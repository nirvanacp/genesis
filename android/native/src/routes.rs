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
