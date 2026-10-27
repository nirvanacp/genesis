use genesis_contracts::{IMPLEMENTATION_STAGE, PackageIndex};
use std::collections::HashSet;
use url::Url;

fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn asset_path(path: &str) -> bool {
    !path.starts_with('/')
        && !path.contains('\\')
        && path
            .split('/')
            .all(|p| !p.is_empty() && p != "." && p != "..")
}
fn hash(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

pub fn validate(index: &PackageIndex) -> Result<(), String> {
    if index.schema_version != 1 || index.implementation_stage != IMPLEMENTATION_STAGE {
        return Err("Unsupported bundled index version or implementation stage".into());
    }
    let mut ids = HashSet::new();
    for package in &index.packages {
        let manifest = &package.manifest;
        if manifest.schema_version != 1
            || manifest.data_schema_version != 1
            || !identifier(&manifest.id)
            || !ids.insert(&manifest.id)
            || manifest.sources.is_empty()
            || !hash(&package.revision)
            || manifest
                .capabilities
                .iter()
                .any(|c| !["dom", "navigation-policy", "storage"].contains(&c.as_str()))
        {
            return Err("Invalid bundled package identity, schema or capability".into());
        }
        let mut assets = HashSet::new();
        for asset in &package.assets {
            if !asset_path(&asset.path) || !hash(&asset.sha256) || !assets.insert(&asset.path) {
                return Err("Invalid or duplicate bundled asset path/hash".into());
            }
        }
        let mut sources = HashSet::new();
        for source in &manifest.sources {
            let start = Url::parse(&source.start_url).map_err(|e| e.to_string())?;
            if !identifier(&source.id)
                || !sources.insert(&source.id)
                || start.scheme() != "https"
                || !source
                    .origins
                    .contains(&start.origin().ascii_serialization())
                || !assets.contains(&source.entry)
            {
                return Err("Invalid bundled source definition".into());
            }
            for origin in &source.origins {
                let url = Url::parse(origin).map_err(|e| e.to_string())?;
                if url.scheme() != "https" || url.origin().ascii_serialization() != *origin {
                    return Err("Source requires exact HTTPS origins".into());
                }
            }
        }
        let mut pages = HashSet::new();
        for page in &manifest.pages {
            if !identifier(&page.id)
                || !pages.insert(&page.id)
                || !assets.contains(&page.entry)
                || !assets.contains(&format!("pages/{}/index.html", page.id))
            {
                return Err("Invalid bundled local page".into());
            }
        }
        let mut actions = HashSet::new();
        for action in &manifest.actions {
            if !identifier(&action.id)
                || !actions.insert(&action.id)
                || !pages.contains(&action.page_id)
            {
                return Err("Invalid bundled action/page reference".into());
            }
        }
    }
    Ok(())
}
