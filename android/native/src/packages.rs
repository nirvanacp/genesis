use genesis_contracts::{IMPLEMENTATION_STAGE, PackageIndex};
use std::collections::HashSet;
use url::Url;

pub fn validate(index: &PackageIndex) -> Result<(), String> {
    if index.schema_version != 1 || index.implementation_stage != IMPLEMENTATION_STAGE {
        return Err("Unsupported bundled index version or implementation stage".into());
    }
    let mut ids = HashSet::new();
    for package in &index.packages {
        let manifest = &package.manifest;
        if manifest.schema_version != 1
            || manifest.data_schema_version != 1
            || !ids.insert(&manifest.id)
            || manifest.sources.is_empty()
            || package.revision.len() != 64
        {
            return Err("Invalid bundled package identity or schema".into());
        }
        let mut sources = HashSet::new();
        for source in &manifest.sources {
            let start = Url::parse(&source.start_url).map_err(|e| e.to_string())?;
            if !sources.insert(&source.id)
                || start.scheme() != "https"
                || !source
                    .origins
                    .contains(&start.origin().ascii_serialization())
            {
                return Err("Invalid bundled source definition".into());
            }
        }
        for asset in &package.assets {
            if asset.path.starts_with('/') || asset.path.contains("..") || asset.sha256.len() != 64
            {
                return Err("Invalid bundled asset path or hash".into());
            }
        }
    }
    Ok(())
}
