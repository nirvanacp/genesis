//! Decoding and verification of bundle import files. The host's only package validation.
use genesis_contracts::{BUNDLE_FORMAT, BundleImport, Encoding, MANIFEST_SCHEMA_VERSION, MAX_SOURCES};
use std::collections::HashMap;

/// A verified bundle: every listed file, decoded, in `bundle.files` order.
pub struct VerifiedFiles(pub Vec<(String, Vec<u8>)>);

pub fn verify(import: &BundleImport) -> Result<VerifiedFiles, String> {
    let bundle = &import.bundle;
    let manifest = &bundle.manifest;
    if bundle.format != BUNDLE_FORMAT {
        return Err(format!("Bundle format {} is not supported; rebuild the applet", bundle.format));
    }
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        return Err(format!("Manifest schema {} is not supported", manifest.schema_version));
    }
    if !is_id(&manifest.id) || manifest.sources.len() > MAX_SOURCES || !manifest.sources.iter().all(|s| is_id(&s.id)) {
        return Err("Invalid applet or source id".into());
    }
    let mut entries = HashMap::new();
    for entry in &import.entries {
        let bytes = match entry.encoding {
            Encoding::Utf8 => entry.content.as_bytes().to_vec(),
            Encoding::Base64 => base64_decode(&entry.content).ok_or_else(|| format!("{} is not valid base64", entry.path))?,
        };
        if entries.insert(entry.path.as_str(), bytes).is_some() {
            return Err(format!("{} appears twice", entry.path));
        }
    }
    if entries.len() != bundle.files.len() {
        return Err("Bundle entries do not match bundle.json".into());
    }
    let mut files = Vec::with_capacity(bundle.files.len());
    for file in &bundle.files {
        if !is_safe_path(&file.path) {
            return Err(format!("Unsafe bundle path {}", file.path));
        }
        let bytes = entries.remove(file.path.as_str()).ok_or_else(|| format!("{} is missing", file.path))?;
        if hex(&sha256(&bytes)) != file.sha256 {
            return Err(format!("{} does not match its sha256", file.path));
        }
        files.push((file.path.clone(), bytes));
    }
    let has = |path: &str| files.iter().any(|(p, _)| p == path);
    if !has("index.html") {
        return Err("index.html is missing".into());
    }
    if let Some(source) = manifest.sources.iter().find(|s| !has(&format!("sources/{}.js", s.id))) {
        return Err(format!("sources/{}.js is missing", source.id));
    }
    Ok(VerifiedFiles(files))
}

pub fn is_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Relative path of plain segments. `bundle.json` is reserved for the host's copy of the metadata.
fn is_safe_path(path: &str) -> bool {
    path.len() <= 256
        && path != "bundle.json"
        && path.split('/').all(|segment| {
            !segment.is_empty()
                && segment != "."
                && segment != ".."
                && segment.bytes().all(|b| b.is_ascii_alphanumeric() || b"._@-".contains(&b))
        })
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
