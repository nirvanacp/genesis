//! Requests the shell fetches for the host. The host builds every URL; this module refuses any
//! that is not HTTPS on one of `FETCH_HOSTS`, the same list the shell enforces on redirects.
use genesis_contracts::{FETCH_HOSTS, ShellCommand};

pub fn allowed(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|u| u.scheme() == "https" && u.host_str().is_some_and(|h| FETCH_HOSTS.contains(&h)))
}

/// The GitHub REST API, whose responses carry ETags and count against the rate limit.
pub fn is_api(url: &str) -> bool {
    url.starts_with("https://api.github.com/")
}

pub fn command(request_id: &str, url: &str, max_bytes: u64, etag: Option<String>, to_file: Option<String>) -> Result<ShellCommand, String> {
    if !allowed(url) {
        return Err(format!("Genesis does not fetch {url}"));
    }
    Ok(ShellCommand::Fetch {
        request_id: request_id.into(),
        url: url.into(),
        max_bytes,
        etag,
        to_file,
        hosts: FETCH_HOSTS.iter().map(|h| (*h).into()).collect(),
    })
}
