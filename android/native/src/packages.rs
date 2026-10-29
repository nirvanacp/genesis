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
                .any(|c| !["dom", "navigation-policy", "storage", "services"].contains(&c.as_str()))
        {
            return Err("Invalid bundled package identity, schema or capability".into());
        }
        let mut services = HashSet::new();
        if manifest
            .services
            .iter()
            .any(|id| !identifier(id) || !services.insert(id))
            || (!manifest.services.is_empty()
                && !manifest.capabilities.iter().any(|c| c == "services"))
        {
            return Err("Invalid service declaration".into());
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
                || !start.username().is_empty()
                || start.password().is_some()
                || !source
                    .origins
                    .contains(&start.origin().ascii_serialization())
                || !assets.contains(&source.entry)
            {
                return Err("Invalid bundled source definition".into());
            }
            if source.customized_paths.as_ref().is_some_and(|paths| {
                paths.iter().any(|p| {
                    !p.starts_with('/') || p.contains(['?', '#', '\\']) || p.contains("..")
                })
            }) {
                return Err("Invalid customized paths".into());
            }
            let mut rule_ids = HashSet::new();
            for rule in &source.navigation_rules {
                let fallback = Url::parse(&rule.fallback_url).map_err(|e| e.to_string())?;
                if !identifier(&rule.id)
                    || !rule_ids.insert(&rule.id)
                    || rule.action != "block"
                    || !rule.path_prefix.starts_with('/')
                    || fallback.scheme() != "https"
                    || !fallback.username().is_empty()
                    || fallback.password().is_some()
                    || !source
                        .origins
                        .contains(&fallback.origin().ascii_serialization())
                    || source
                        .navigation_rules
                        .iter()
                        .any(|r| fallback.path().starts_with(&r.path_prefix))
                {
                    return Err("Invalid navigation rule or fallback loop".into());
                }
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
        if let Some(shell) = &manifest.shell {
            let mut sections = HashSet::new();
            if shell.title.is_empty()
                || shell.title.len() > 80
                || !assets.contains(&shell.brand_asset)
                || shell.sections.is_empty()
                || shell.sections.len() > 5
                || shell.sections.iter().any(|s| {
                    !identifier(&s.id)
                        || !sections.insert(&s.id)
                        || s.label.is_empty()
                        || s.icon.as_ref().is_some_and(|i| {
                            !["home", "search", "post", "bookmark", "person"].contains(&i.as_str())
                        })
                        || !sources.contains(&s.source_id)
                        || s.page_id.as_ref().is_some_and(|p| !pages.contains(p))
                })
            {
                return Err("Invalid app shell".into());
            }
            for choice in &shell.choices {
                let url = Url::parse(&choice.url).map_err(|e| e.to_string())?;
                if choice.label.is_empty()
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || !manifest.sources.iter().any(|s| {
                        s.origins.contains(&url.origin().ascii_serialization())
                            && s.customized_paths
                                .as_ref()
                                .is_some_and(|p| p.iter().any(|p| p == url.path()))
                    })
                {
                    return Err("Invalid shell choice".into());
                }
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
