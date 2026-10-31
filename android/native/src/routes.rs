use genesis_contracts::Source;

pub fn valid_pattern(pattern: &str) -> bool {
    if pattern.len() > 256 || !pattern.starts_with('/') {
        return false;
    }
    if pattern == "/" {
        return true;
    }
    let parts: Vec<_> = pattern[1..].split('/').collect();
    parts.len() <= 16
        && parts.iter().enumerate().all(|(i, part)| {
            if *part == "*" {
                return i == parts.len() - 1;
            }
            if let Some(name) = part.strip_prefix(':') {
                return name.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
                    && name.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_');
            }
            !part.is_empty()
                && *part != "."
                && *part != ".."
                && part
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
        })
}
pub fn matches(pattern: &str, path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    if ["%2f", "%5c", "%2e", "%25", "\\"]
        .iter()
        .any(|p| lower.contains(p))
    {
        return false;
    }
    let bytes = path.as_bytes();
    if bytes.iter().enumerate().any(|(i, c)| {
        *c == b'%'
            && (i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit())
    }) {
        return false;
    }
    if pattern == "/" {
        return path == "/";
    }
    let parts: Vec<_> = pattern[1..].split('/').collect();
    let actual: Vec<_> = path.strip_prefix('/').unwrap_or(path).split('/').collect();
    parts.iter().enumerate().all(|(i, part)| {
        *part == "*"
            || actual
                .get(i)
                .is_some_and(|value| !value.is_empty() && (part.starts_with(':') || value == part))
    }) && if parts.last() == Some(&"*") {
        actual.len() >= parts.len() - 1
    } else {
        actual.len() == parts.len()
    }
}
pub fn customized(source: &Source, path: &str) -> bool {
    if source
        .ordinary_routes
        .iter()
        .any(|pattern| matches(pattern, path))
    {
        return false;
    }
    if let Some(patterns) = &source.customized_routes {
        return patterns.iter().any(|pattern| matches(pattern, path));
    }
    source
        .customized_paths
        .as_ref()
        .is_none_or(|paths| paths.iter().any(|p| p == path))
}

/// Validate before URL parsing can erase unsafe path segments.
fn safe_url(value: &str) -> Option<url::Url> {
    if value.len() > 8192 || value.bytes().any(|b| b <= 32 || b == 127 || b == b'\\') {
        return None;
    }
    let bytes = value.as_bytes();
    if bytes.iter().enumerate().any(|(i, c)| {
        *c == b'%'
            && (i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit())
    }) {
        return None;
    }
    let (scheme, tail) = value.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("https") {
        return None;
    }
    let path_start = tail.find(['/', '?', '#']).unwrap_or(tail.len());
    let path = tail[path_start..].split(['?', '#']).next()?;
    let lower = path.to_ascii_lowercase();
    if ["%2f", "%5c", "%2e", "%25"]
        .iter()
        .any(|part| lower.contains(part))
        || path.split('/').any(|part| part == "." || part == "..")
    {
        return None;
    }
    let url = url::Url::parse(value).ok()?;
    (url.scheme() == "https" && url.username().is_empty() && url.password().is_none())
        .then_some(url)
}

pub fn resolve(
    contract: &genesis_contracts::RouteContract,
    value: &str,
) -> genesis_contracts::RouteResolution {
    use genesis_contracts::{QueryConstraint, RouteResolution};
    let Some(url) = safe_url(value) else {
        return RouteResolution::Blocked;
    };
    if !contract
        .origins
        .contains(&url.origin().ascii_serialization())
    {
        return RouteResolution::External;
    }
    let query: Vec<_> = url.query_pairs().collect();
    if contract
        .routes
        .iter()
        .flat_map(|r| r.query.keys())
        .any(|key| query.iter().filter(|(name, _)| name == key).count() > 1)
    {
        return RouteResolution::Unsupported;
    }
    for rule in &contract.routes {
        if !matches(&rule.path, url.path()) {
            continue;
        }
        if !rule.query.iter().all(|(key, constraint)| {
            query.iter().any(|(name, value)| {
                name == key
                    && match constraint {
                        QueryConstraint::Present(_) => true,
                        QueryConstraint::Equals(exact) => value == &exact.equals,
                    }
            })
        }) {
            continue;
        }
        if rule
            .fragment
            .as_ref()
            .is_some_and(|fragment| url.fragment().unwrap_or("") != fragment.equals)
        {
            continue;
        }
        return RouteResolution::Matched {
            route_id: rule.id.clone(),
            result: rule.result.clone(),
        };
    }
    RouteResolution::Unsupported
}

pub fn validate_manifest(manifest: &genesis_contracts::Manifest) -> Result<(), String> {
    use genesis_contracts::{QueryConstraint, RouteResolution, RouteResult};
    use std::collections::HashSet;
    let id = |value: &str| {
        !value.is_empty()
            && value.len() <= 64
            && value.as_bytes()[0].is_ascii_lowercase()
            && value
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
    };
    let Some(foreground) = &manifest.foreground else {
        return Err("Foreground required".into());
    };
    if !id(&foreground.page_id)
        || !manifest.pages.iter().any(|p| p.id == foreground.page_id)
        || foreground.screens.is_empty()
        || foreground.screens.len() > 100
        || foreground.screens.iter().any(|screen| !id(screen))
        || foreground.screens.iter().collect::<HashSet<_>>().len() != foreground.screens.len()
    {
        return Err("Invalid foreground declaration".into());
    }
    if manifest.route_contracts.is_empty()
        || manifest.route_contracts.len() > 16
        || serde_json::to_vec(&manifest.route_contracts)
            .map_err(|e| e.to_string())?
            .len()
            > 131072
    {
        return Err("Invalid route contract bounds".into());
    }
    let mut contract_ids = HashSet::new();
    for contract in &manifest.route_contracts {
        if !id(&contract.id)
            || !contract_ids.insert(&contract.id)
            || contract.origins.is_empty()
            || contract.origins.iter().collect::<HashSet<_>>().len() != contract.origins.len()
            || contract.origins.iter().any(|origin| {
                safe_url(origin).is_none_or(|url| {
                    url.origin().ascii_serialization() != *origin
                        || url.host_str() == Some("appassets.androidplatform.net")
                })
            })
            || contract.routes.is_empty()
            || contract.routes.len() > 100
        {
            return Err("Invalid route contract".into());
        }
        let mut rule_ids = HashSet::new();
        let mut predicates = HashSet::new();
        let mut unconditional: Vec<&str> = Vec::new();
        for rule in &contract.routes {
            let predicate = serde_json::to_string(&(&rule.path, &rule.query, &rule.fragment))
                .map_err(|e| e.to_string())?;
            if !id(&rule.id) || !rule_ids.insert(&rule.id) || !valid_pattern(&rule.path)
                || !predicates.insert(predicate) || rule.query.len() > 16
                || rule.query.iter().any(|(key, constraint)| key.is_empty() || key.len() > 256
                    || matches!(constraint, QueryConstraint::Equals(exact) if exact.equals.len() > 1024))
                || rule.fragment.as_ref().is_some_and(|v| v.equals.len() > 1024)
                || unconditional.iter().any(|path| covers(path, &rule.path)) {
                return Err("Invalid, duplicate or unreachable route rule".into());
            }
            match &rule.result {
                RouteResult::Custom { screen, adapter } => {
                    if !id(screen) || !id(adapter) || !foreground.screens.contains(screen) {
                        return Err("Unknown foreground screen or adapter".into());
                    }
                }
                RouteResult::Website { reason } | RouteResult::Blocked { reason } => {
                    if reason.trim().is_empty() || reason.len() > 1024 {
                        return Err("Invalid route explanation".into());
                    }
                }
            }
            if rule.query.is_empty() && rule.fragment.is_none() {
                unconditional.push(&rule.path);
            }
        }
    }
    for source in &manifest.sources {
        if !source.origins.is_empty()
            || source.customized_paths.is_some()
            || source.customized_routes.is_some()
            || !source.ordinary_routes.is_empty()
            || !source.navigation_rules.is_empty()
        {
            return Err("Legacy fields are not allowed in isolated sources".into());
        }
        let contract = manifest
            .route_contracts
            .iter()
            .find(|c| Some(&c.id) == source.route_contract_id.as_ref())
            .ok_or("Unknown source route contract")?;
        if !matches!(
            resolve(contract, &source.start_url),
            RouteResolution::Matched {
                result: RouteResult::Custom { .. } | RouteResult::Website { .. },
                ..
            }
        ) {
            return Err("Source start requires an explicit custom or website route".into());
        }
    }
    if let Some(shell) = &manifest.shell {
        for choice in &shell.choices {
            let source_id = choice
                .source_id
                .as_deref()
                .or_else(|| shell.sections.first().map(|s| s.source_id.as_str()))
                .ok_or("Missing choice source")?;
            let contract = manifest
                .sources
                .iter()
                .find(|s| s.id == source_id)
                .and_then(|s| {
                    manifest
                        .route_contracts
                        .iter()
                        .find(|c| Some(&c.id) == s.route_contract_id.as_ref())
                })
                .ok_or("Unknown choice source")?;
            if !matches!(
                resolve(contract, &choice.url),
                RouteResolution::Matched {
                    result: RouteResult::Custom { .. } | RouteResult::Website { .. },
                    ..
                }
            ) {
                return Err("Choice requires an explicit custom or website route".into());
            }
        }
    }
    Ok(())
}

fn covers(earlier: &str, later: &str) -> bool {
    let a: Vec<_> = earlier[1..].split('/').collect();
    let b: Vec<_> = later[1..].split('/').collect();
    for (i, part) in a.iter().enumerate() {
        if *part == "*" {
            return true;
        }
        let Some(other) = b.get(i) else {
            return false;
        };
        if *other == "*" || !(part.starts_with(':') || part == other) {
            return false;
        }
    }
    a.len() == b.len()
}
