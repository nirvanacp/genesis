use genesis_contracts::{
    AppletBundle, BUNDLE_FORMAT_VERSION, IMPLEMENTATION_STAGE, PackageIndex, RUNTIME_API_VERSION,
};
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
        && !path.contains('\0')
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
    if index
        .hidden_applet_ids
        .iter()
        .any(|id| !index.packages.iter().any(|p| &p.manifest.id == id))
    {
        return Err("Unknown hidden applet".into());
    }
    let mut ids = HashSet::new();
    for package in &index.packages {
        let manifest = &package.manifest;
        if ![1, 2, 3, 4].contains(&package.runtime_api_version) {
            return Err("Unsupported package runtime API".into());
        }
        if matches!(manifest.schema_version, 2 | 3) {
            if package.runtime_api_version != manifest.schema_version + 1 {
                return Err("Isolated schema/runtime API mismatch".into());
            }
            crate::routes::validate_manifest(manifest)?;
            let mut legacy = package.clone();
            legacy.runtime_api_version = 2;
            legacy.manifest.schema_version = 1;
            for source in &mut legacy.manifest.sources {
                source.origins = manifest
                    .route_contracts
                    .iter()
                    .find(|c| Some(&c.id) == source.route_contract_id.as_ref())
                    .ok_or("Unknown contract")?
                    .origins
                    .clone();
                source.route_contract_id = None;
            }
            legacy.manifest.route_contracts.clear();
            legacy.manifest.foreground = None;
            legacy.manifest.navigation = None;legacy.manifest.website_actions.clear();
            validate(&PackageIndex {
                hidden_applet_ids: Vec::new(),
                schema_version: 1,
                implementation_stage: IMPLEMENTATION_STAGE.into(),
                packages: vec![legacy],
            })?;
            if !ids.insert(&manifest.id) {
                return Err("Duplicate applet".into());
            }
            continue;
        }
        if matches!(package.runtime_api_version, 3 | 4) {
            return Err("API 3 requires schema 2".into());
        }
        if manifest.navigation.is_some() || !manifest.website_actions.is_empty() || !manifest.route_contracts.is_empty()
            || manifest.foreground.is_some()
            || manifest
                .sources
                .iter()
                .any(|s| s.route_contract_id.is_some())
        {
            return Err("Isolated declarations require schema 2".into());
        }
        if manifest.schema_version != 1
            || manifest.data_schema_version != 1
            || manifest.name.trim().is_empty()
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
        let mut capabilities = HashSet::new();
        if manifest
            .capabilities
            .iter()
            .any(|c| !capabilities.insert(c))
        {
            return Err("Duplicate capability".into());
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
                || source.origins.is_empty()
                || !assets.contains(&source.entry)
            {
                return Err("Invalid bundled source definition".into());
            }
            if source
                .customized_paths
                .as_ref()
                .is_some_and(|paths| paths.iter().any(|p| !route(p)))
            {
                return Err("Invalid customized paths".into());
            }
            if source.customized_paths.is_some() && source.customized_routes.is_some() {
                return Err("Choose paths or route patterns".into());
            }
            for patterns in [
                source.customized_routes.as_deref().unwrap_or(&[]),
                &source.ordinary_routes,
            ] {
                let unique: HashSet<_> = patterns.iter().collect();
                if patterns.len() > 100
                    || unique.len() != patterns.len()
                    || patterns.iter().any(|p| !crate::routes::valid_pattern(p))
                {
                    return Err("Invalid route patterns".into());
                }
            }
            if package.runtime_api_version < 2
                && (source.customized_routes.is_some() || !source.ordinary_routes.is_empty())
            {
                return Err("Routes require API 2".into());
            }
            if source.home_paths.iter().any(|p| !route(p)) {
                return Err("Invalid home paths".into());
            }
            let mut rule_ids = HashSet::new();
            for rule in &source.navigation_rules {
                let fallback = Url::parse(&rule.fallback_url).map_err(|e| e.to_string())?;
                if !identifier(&rule.id)
                    || !rule_ids.insert(&rule.id)
                    || rule.action != "block"
                    || !route(&rule.path_prefix)
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
            let mut origin_ids = HashSet::new();
            for origin in &source.origins {
                let url = Url::parse(origin).map_err(|e| e.to_string())?;
                if url.scheme() != "https"
                    || url.origin().ascii_serialization() != *origin
                    || url.host_str() == Some("appassets.androidplatform.net")
                    || !origin_ids.insert(origin)
                {
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
            if package.runtime_api_version < 2
                && (shell.color_scheme.is_some()
                    || shell
                        .sections
                        .iter()
                        .any(|s| s.icon.as_deref() == Some("notifications")))
            {
                return Err("Shell additions require API 2".into());
            }
            if shell
                .color_scheme
                .as_ref()
                .is_some_and(|v| !["default", "neutral"].contains(&v.as_str()))
            {
                return Err("Invalid color scheme".into());
            }
            if shell.title.trim().is_empty()
                || shell.title.len() >= 80
                || !assets.contains(&shell.brand_asset)
                || shell.sections.is_empty()
                || shell.sections.len() > 5
                || shell.sections.iter().any(|s| {
                    !identifier(&s.id)
                        || !sections.insert(&s.id)
                        || s.label.trim().is_empty()
                        || s.icon.as_ref().is_some_and(|i| {
                            ![
                                "home",
                                "search",
                                "post",
                                "bookmark",
                                "person",
                                "notifications",
                            ]
                            .contains(&i.as_str())
                        })
                        || !sources.contains(&s.source_id)
                        || s.page_id.as_ref().is_some_and(|p| !pages.contains(p))
                })
            {
                return Err("Invalid app shell".into());
            }
            for choice in &shell.choices {
                let url = Url::parse(&choice.url).map_err(|e| e.to_string())?;
                let source_id = choice
                    .source_id
                    .as_deref()
                    .unwrap_or(&shell.sections[0].source_id);
                if choice.label.trim().is_empty()
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || !manifest.sources.iter().any(|s| {
                        s.id == source_id
                            && s.origins.contains(&url.origin().ascii_serialization())
                            && crate::routes::customized(s, url.path())
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
                || action.label.trim().is_empty()
                || !pages.contains(&action.page_id)
            {
                return Err("Invalid bundled action/page reference".into());
            }
        }
    }
    Ok(())
}

fn route(path: &str) -> bool {
    path.starts_with('/')
        && !path.contains("..")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/.-".contains(&b))
}

/// Validate the external shape before the Android store verifies bytes and canonical revision.
pub fn validate_bundle(bundle: &AppletBundle) -> Result<(), String> {
    if bundle.format_version != BUNDLE_FORMAT_VERSION
        || ![1, 2, 3, 4].contains(&bundle.runtime_api_version)
    {
        return Err(format!(
            "Unsupported bundle/runtime API; supported {BUNDLE_FORMAT_VERSION}/{RUNTIME_API_VERSION}"
        ));
    }
    let version: Vec<_> = bundle.sdk_version.split('.').collect();
    if version.len() != 3
        || version
            .iter()
            .any(|v| v.is_empty() || !v.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err("Invalid SDK version".into());
    }
    if bundle
        .package
        .assets
        .windows(2)
        .any(|a| a[0].path >= a[1].path)
    {
        return Err("Bundle assets must be sorted and unique".into());
    }
    validate(&PackageIndex {
        hidden_applet_ids: Vec::new(),
        schema_version: 1,
        implementation_stage: IMPLEMENTATION_STAGE.into(),
        packages: vec![{
            let mut package = bundle.package.clone();
            package.runtime_api_version = bundle.runtime_api_version;
            package
        }],
    })
}
