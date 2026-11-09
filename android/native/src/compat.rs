//! Classifies a bundle against the host's version table. Runs on import and on every load.
use genesis_contracts::{BundleHeader, Compatibility, Direction, Mismatch, compat};
use serde_json::{Map, Value};

/// A version that differs: the field, the applet's value (None when absent) and the host's.
type Difference = (&'static str, Option<u64>, u32);

/// Compares the bundle's format, manifest schema, protocol and adapter API with the host's.
/// A bundle without a `compat` block is outdated.
pub fn evaluate(header: &BundleHeader) -> Compatibility {
    classify(differences(header))
}

/// `evaluate`, plus the import file's envelope version.
pub fn evaluate_import(envelope: Option<u32>, header: &BundleHeader) -> Compatibility {
    let mut found = differences(header);
    if envelope != Some(compat::IMPORT_ENVELOPE) {
        found.insert(0, ("envelope", envelope.map(u64::from), compat::IMPORT_ENVELOPE));
    }
    classify(found)
}

fn differences(header: &BundleHeader) -> Vec<Difference> {
    let format = Some(u64::from(header.format));
    let schema = Some(u64::from(header.manifest.schema_version));
    compare_all(format, schema, header.compat.as_ref())
}

/// A release record's copy of the bundle's `compat` block, read before downloading the bundle.
pub fn evaluate_release(block: &Map<String, Value>) -> Compatibility {
    let number = |key: &str| block.get(key).and_then(Value::as_u64);
    classify(compare_all(number("bundleFormat"), number("manifestSchema"), Some(block)))
}

fn compare_all(format: Option<u64>, schema: Option<u64>, block: Option<&Map<String, Value>>) -> Vec<Difference> {
    let mut found = Vec::new();
    let mut compare = |field, applet: Option<u64>, host: u32| {
        if applet != Some(u64::from(host)) {
            found.push((field, applet, host));
        }
    };
    let number = |key: &str| block.and_then(|b| b.get(key)).and_then(Value::as_u64);
    compare("format", format, compat::BUNDLE_FORMAT);
    compare("schemaVersion", schema, compat::MANIFEST_SCHEMA);
    compare("protocol", number("protocol"), compat::PROTOCOL);
    compare("adapterApi", number("adapterApi"), compat::ADAPTER_API);
    found
}

/// Newer when any value is above the host's, outdated when any is below or absent, mixed for both.
fn classify(found: Vec<Difference>) -> Compatibility {
    if found.is_empty() {
        return Compatibility::Current;
    }
    let newer = found.iter().any(|(_, applet, host)| applet.is_some_and(|a| a > u64::from(*host)));
    let older = found.iter().any(|(_, applet, host)| applet.is_none_or(|a| a < u64::from(*host)));
    let direction = match (newer, older) {
        (true, true) => Direction::Mixed,
        (true, false) => Direction::Newer,
        _ => Direction::Outdated,
    };
    let mismatches = found
        .into_iter()
        .map(|(field, applet, host)| Mismatch {
            field: field.into(),
            applet: applet.map_or_else(|| "missing".into(), |a| a.to_string()),
            host: host.to_string(),
        })
        .collect();
    Compatibility::Incompatible { direction, mismatches }
}
