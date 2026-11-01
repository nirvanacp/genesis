//! Pure presentation decisions, independent of document lifecycle and website DOM.
use genesis_contracts::{
    DestinationKind as Kind, Manifest, NavigationDecision as Decision, NavigationTarget as Target,
    RouteResolution, RouteResult, WebsiteDisposition,
};
use std::collections::HashSet;

fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}
fn text(value: &str, limit: usize) -> bool {
    !value.trim().is_empty() && value.len() <= limit
}

/// Apply the same raw-path checks to HTTP external links without allowing HTTP extraction.
pub fn safe_url(value: &str) -> Option<url::Url> {
    let (scheme, tail) = value.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return None;
    }
    let checked = crate::routes::safe_url(&format!("https://{tail}"))?;
    if checked.host_str() == Some("appassets.androidplatform.net") {
        return None;
    }
    url::Url::parse(value).ok()
}

pub fn validate(manifest: &Manifest) -> Result<(), String> {
    if manifest.schema_version != 3 {
        if manifest.navigation.is_some()
            || !manifest.website_actions.is_empty()
            || manifest
                .route_contracts
                .iter()
                .any(|c| c.default_source_id.is_some())
        {
            return Err("Navigation policy requires schema 3".into());
        }
        return Ok(());
    }
    let policy = manifest
        .navigation
        .as_ref()
        .ok_or("Navigation policy required")?;
    if policy.external.origins.len() > 64
        || manifest.website_actions.len() > 64
        || serde_json::to_vec(&(policy, &manifest.website_actions))
            .map_err(|e| e.to_string())?
            .len()
            > 65536
    {
        return Err("Navigation metadata exceeds bounds".into());
    }
    let mut origins = HashSet::new();
    for contract in &manifest.route_contracts {
        if !contract
            .origins
            .iter()
            .all(|origin| origins.insert(origin.clone()))
        {
            return Err("Internal origin belongs to multiple contracts".into());
        }
        if !manifest.sources.iter().any(|s| {
            Some(&s.id) == contract.default_source_id.as_ref()
                && s.route_contract_id.as_ref() == Some(&contract.id)
        }) {
            return Err("Contract requires matching default source".into());
        }
    }
    for origin in &policy.external.origins {
        if !safe_url(&origin.origin)
            .is_some_and(|u| u.origin().ascii_serialization() == origin.origin)
            || !origins.insert(origin.origin.clone())
            || !text(&origin.reason, 1024)
        {
            return Err("Invalid external origin policy".into());
        }
    }
    let mut actions = HashSet::new();
    for action in &manifest.website_actions {
        let contract = manifest
            .route_contracts
            .iter()
            .find(|c| c.id == action.contract_id)
            .ok_or("Unknown website action contract")?;
        let mut route_ids = HashSet::new();
        if !identifier(&action.id)
            || !actions.insert(&action.id)
            || !text(&action.label, 100)
            || !text(&action.reason, 1024)
            || action.route_ids.is_empty()
            || action.route_ids.len() > 100
            || !action.route_ids.iter().all(|id| {
                route_ids.insert(id)
                    && contract
                        .routes
                        .iter()
                        .any(|r| r.id == *id && matches!(r.result, RouteResult::Custom { .. }))
            })
        {
            return Err("Invalid website action".into());
        }
    }
    Ok(())
}

pub fn decide(manifest: &Manifest, active_source: Option<&str>, target: Target) -> Decision {
    let mut decision = Decision {
        target: target.clone(),
        kind: Kind::Blocked,
        source_id: None,
        contract_id: None,
        route_id: None,
        screen: None,
        title: "Page unavailable".into(),
        reason: Some("This destination is not permitted.".into()),
        website_action_id: None,
        website_allowed: false,
    };
    let Target::Url {
        ref url,
        ref source_id,
        ref website_action_id,
    } = target
    else {
        if let Target::Page { ref page_id } = target {
            if manifest.pages.iter().any(|p| p.id == *page_id) {
                decision.kind = Kind::Page;
                decision.title = "Applet page".into();
                decision.reason = None;
            }
        }
        return decision;
    };
    let Some(parsed) = safe_url(url) else {
        return decision;
    };
    let Some(policy) = manifest.navigation.as_ref() else {
        return decision;
    };
    let origin = parsed.origin().ascii_serialization();
    let Some(contract) = manifest
        .route_contracts
        .iter()
        .find(|c| c.origins.contains(&origin))
    else {
        if website_action_id.is_some() || source_id.is_some() {
            return decision;
        }
        let external = policy.external.origins.iter().find(|o| o.origin == origin);
        if external.map_or(&policy.external.default, |o| &o.result) == &WebsiteDisposition::Website
        {
            decision.kind = Kind::External;
            decision.title = "External website".into();
            decision.website_allowed = true;
            decision.reason = Some("Open this destination in its original website.".into());
        } else if let Some(rule) = external {
            decision.reason = Some(rule.reason.clone());
        }
        return decision;
    };
    decision.contract_id = Some(contract.id.clone());
    let chosen = source_id
        .as_deref()
        .or_else(|| {
            active_source.filter(|id| {
                manifest
                    .sources
                    .iter()
                    .any(|s| s.id == *id && s.route_contract_id.as_ref() == Some(&contract.id))
            })
        })
        .or(contract.default_source_id.as_deref());
    if !manifest.sources.iter().any(|s| {
        Some(s.id.as_str()) == chosen && s.route_contract_id.as_ref() == Some(&contract.id)
    }) {
        return decision;
    }
    decision.source_id = chosen.map(str::to_owned);
    match crate::routes::resolve(contract, url) {
        RouteResolution::Matched { route_id, result } => {
            decision.route_id = Some(route_id.clone());
            match result {
                RouteResult::Custom { screen, title, .. } => {
                    if let Some(id) = website_action_id {
                        let Some(action) = manifest.website_actions.iter().find(|a| {
                            a.id == *id
                                && a.contract_id == contract.id
                                && a.route_ids.contains(&route_id)
                        }) else {
                            decision.reason = Some("INVALID_WEBSITE_ACTION".into());
                            return decision;
                        };
                        decision.kind = Kind::Website;
                        decision.title = action.label.clone();
                        decision.reason = Some(action.reason.clone());
                        decision.website_action_id = Some(id.clone());
                        decision.website_allowed = true;
                    } else {
                        decision.kind = Kind::Custom;
                        decision.screen = Some(screen);
                        decision.title = title.unwrap_or_else(|| "Applet page".into());
                        decision.reason = None;
                    }
                }
                RouteResult::Website { reason } if website_action_id.is_none() => {
                    decision.kind = Kind::Website;
                    decision.title = "Continue on website".into();
                    decision.reason = Some(reason);
                    decision.website_allowed = true;
                }
                RouteResult::Blocked { reason } => decision.reason = Some(reason),
                _ => decision.reason = Some("INVALID_WEBSITE_ACTION".into()),
            }
        }
        RouteResolution::Unsupported if website_action_id.is_none() => {
            decision.kind = Kind::Uncovered;
            decision.title = "Not covered by this applet".into();
            decision.reason = Some("This page has no customized screen.".into());
            decision.website_allowed = policy.uncovered_website_recovery;
        }
        _ => {}
    }
    decision
}
