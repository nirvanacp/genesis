//! Import files: envelope validation, classification, then (current bundles only) the full parse.
//! The host's only package validation.
use crate::compat;
use genesis_contracts::{
    Bundle, Compatibility, Direction, Encoding, ErrorBody, ErrorCode, IMPORT_MAX_BYTES, ImportEnvelope, MAX_CONTEXTS,
    Mismatch, RELEASE_FORMAT, ReleaseRecord,
};
use std::collections::{HashMap, HashSet};

/// Files every current bundle contains besides `bundle.json`: the UI document and the page script.
const REQUIRED_FILES: [&str; 2] = ["index.html", "page.js"];

/// A verified bundle's files, decoded, in `bundle.files` order.
pub struct VerifiedFiles(pub Vec<(String, Vec<u8>)>);

/// An applet built for another Genesis. It is listed and cannot be launched.
pub struct IncompatibleBundle {
    pub id: String,
    pub name: String,
    pub direction: Direction,
    pub mismatches: Vec<Mismatch>,
}

pub enum Verified {
    Current { bundle: Box<Bundle>, files: VerifiedFiles },
    Incompatible(IncompatibleBundle),
}

/// Validates the envelope, classifies the bundle and, when it is current, parses its manifest.
/// Nothing is written here; a failure names the first offending field.
pub fn verify(payload: &str) -> Result<Verified, ErrorBody> {
    let invalid = |message: String| ErrorBody::new(ErrorCode::EnvelopeInvalid, message);
    if payload.len() > IMPORT_MAX_BYTES {
        return Err(invalid(format!("The import file is larger than {IMPORT_MAX_BYTES} bytes")));
    }
    let envelope: ImportEnvelope = serde_json::from_str(payload).map_err(|e| invalid(format!("Invalid import file: {e}")))?;
    let files = verify_files(&envelope).map_err(invalid)?;
    let header = &envelope.bundle;
    match compat::evaluate_import(envelope.envelope, header) {
        Compatibility::Incompatible { direction, mismatches } => Ok(Verified::Incompatible(IncompatibleBundle {
            id: header.manifest.id.clone(),
            name: header.manifest.name.clone(),
            direction,
            mismatches,
        })),
        Compatibility::Current => {
            let bundle = parse_bundle(&envelope)?;
            let has = |path: &str| files.0.iter().any(|(p, _)| p == path);
            if let Some(missing) = REQUIRED_FILES.iter().copied().chain([bundle.manifest.foreground.entry.as_str()]).find(|path| !has(path)) {
                return Err(ErrorBody::new(ErrorCode::InvalidArgument, format!("{missing} is missing")));
            }
            Ok(Verified::Current { bundle: Box::new(bundle), files })
        }
    }
}

/// The version-independent checks: the applet id, safe and unique paths, the same path set in
/// `entries` and `bundle.files`, and every entry's sha256.
fn verify_files(envelope: &ImportEnvelope) -> Result<VerifiedFiles, String> {
    let bundle = &envelope.bundle;
    if !is_id(&bundle.manifest.id) {
        return Err("bundle.manifest.id must match [a-z0-9-]+".into());
    }
    let mut entries = HashMap::new();
    for (index, entry) in envelope.entries.iter().enumerate() {
        if !is_safe_path(&entry.path) {
            return Err(format!("entries[{index}].path {} is not a safe relative path", entry.path));
        }
        let bytes = match entry.encoding {
            Encoding::Utf8 => entry.content.as_bytes().to_vec(),
            Encoding::Base64 => base64_decode(&entry.content).ok_or_else(|| format!("entries[{index}].content is not valid base64"))?,
        };
        if entries.insert(entry.path.as_str(), bytes).is_some() {
            return Err(format!("entries[{index}].path {} repeats", entry.path));
        }
    }
    let mut listed = HashSet::new();
    let mut files = Vec::with_capacity(bundle.files.len());
    for (index, file) in bundle.files.iter().enumerate() {
        if !is_safe_path(&file.path) {
            return Err(format!("bundle.files[{index}].path {} is not a safe relative path", file.path));
        }
        if !listed.insert(file.path.as_str()) {
            return Err(format!("bundle.files[{index}].path {} repeats", file.path));
        }
        let bytes = entries.remove(file.path.as_str()).ok_or_else(|| format!("bundle.files[{index}].path {} has no entry", file.path))?;
        if hex(&sha256(&bytes)) != file.sha256 {
            return Err(format!("bundle.files[{index}].sha256 does not match {}", file.path));
        }
        files.push((file.path.clone(), bytes));
    }
    if let Some(extra) = entries.keys().next() {
        return Err(format!("entries path {extra} is not listed in bundle.files"));
    }
    Ok(VerifiedFiles(files))
}

/// The full schema 6 parse, and the manifest rules the host relies on.
fn parse_bundle(envelope: &ImportEnvelope) -> Result<Bundle, ErrorBody> {
    let invalid = |message: String| ErrorBody::new(ErrorCode::InvalidArgument, message);
    let value = serde_json::to_value(&envelope.bundle).map_err(|e| invalid(e.to_string()))?;
    let bundle: Bundle = serde_json::from_value(value).map_err(|e| invalid(format!("Invalid bundle: {e}")))?;
    let contexts = &bundle.manifest.contexts;
    if contexts.is_empty() || contexts.len() > MAX_CONTEXTS {
        return Err(invalid(format!("manifest.contexts must have 1 to {MAX_CONTEXTS} entries")));
    }
    let mut ids = HashSet::new();
    if let Some(context) = contexts.iter().find(|c| !is_id(&c.id) || !ids.insert(c.id.as_str())) {
        return Err(invalid(format!("manifest context id {} is invalid or repeats", context.id)));
    }
    // An origin reaches the WebView's origin rules, which reject anything but `scheme://host[:port]`.
    if let Some(origin) = bundle.manifest.origins.iter().find(|o| !is_https_origin(o)) {
        return Err(invalid(format!("manifest origin {origin} is not an exact https://host origin")));
    }
    let declared = |url: &str| url::Url::parse(url).is_ok_and(|u| {
        u.scheme() == "https" && bundle.manifest.origins.contains(&u.origin().ascii_serialization())
    });
    if let Some(context) = contexts.iter().find(|c| !declared(&c.start_url)) {
        return Err(invalid(format!("manifest context {} startUrl is not on a declared origin", context.id)));
    }
    Ok(bundle)
}

/// `https://host[:port]` in its serialized form: no path, credentials, default port or uppercase.
fn is_https_origin(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|u| u.scheme() == "https" && u.origin().ascii_serialization() == value)
}

pub fn is_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Relative path of plain segments: no empty or dot-leading segment, and only `A-Z a-z 0-9 . _ -`.
/// `bundle.json` is reserved for the host's copy of the metadata.
fn is_safe_path(path: &str) -> bool {
    path.len() <= 256
        && path != "bundle.json"
        && path.split('/').all(|segment| {
            !segment.is_empty()
                && !segment.starts_with('.')
                && segment.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        })
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex(&sha256(data))
}

/// Parses a release record and checks the fields the host relies on.
pub fn parse_release(text: &str) -> Result<ReleaseRecord, String> {
    let record: ReleaseRecord = serde_json::from_str(text).map_err(|e| format!("Invalid release record: {e}"))?;
    if record.release_format != RELEASE_FORMAT {
        return Err(format!("Release record format {} is not supported; this Genesis reads format {RELEASE_FORMAT}", record.release_format));
    }
    if !is_id(&record.applet_id) || record.bundle.file != format!("applet-{}.bundle.json", record.applet_id) {
        return Err("The release record names an invalid applet or bundle file".into());
    }
    if crate::semver::Version::parse(&record.version).is_none() {
        return Err(format!("The release record's version {} is not a semantic version", record.version));
    }
    Ok(record)
}

/// The bundle's bytes must be the ones the record describes.
pub fn check_release(record: &ReleaseRecord, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() as u64 != record.bundle.size || sha256_hex(bytes) != record.bundle.sha256 {
        return Err(format!("The bundle does not match the release record of {} {}", record.applet_id, record.version));
    }
    Ok(())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let input = input.trim_end_matches('=').as_bytes();
    let mut output = Vec::with_capacity(input.len() * 3 / 4);
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &byte in input {
        let value = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        };
        buffer = (buffer << 6) | u32::from(value);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    (bits < 6 && buffer == 0).then_some(output)
}

/// FIPS 180-4 SHA-256.
fn sha256(data: &[u8]) -> [u8; 32] {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let mut message = data.to_vec();
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&((data.len() as u64) * 8).to_be_bytes());
    for block in message.chunks_exact(64) {
        let mut w = [0u32; 64];
        for (i, word) in block.chunks_exact(4).enumerate() {
            w[i] = u32::from_be_bytes([word[0], word[1], word[2], word[3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ (!e & g);
            let t1 = hh.wrapping_add(s1).wrapping_add(ch).wrapping_add(K[i]).wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let t2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(t1);
            d = c;
            c = b;
            b = a;
            a = t1.wrapping_add(t2);
        }
        for (state, value) in h.iter_mut().zip([a, b, c, d, e, f, g, hh]) {
            *state = state.wrapping_add(value);
        }
    }
    let mut digest = [0u8; 32];
    for (chunk, word) in digest.chunks_exact_mut(4).zip(h) {
        chunk.copy_from_slice(&word.to_be_bytes());
    }
    digest
}
