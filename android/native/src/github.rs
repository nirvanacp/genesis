//! GitHub: repository input, request URLs, the few response fields the host reads, and the ETag
//! cache. Responses are read with `serde_json::Value` lookups, so unknown fields never break them.
use crate::{applets::write_atomic, imports, semver::Version};
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

const API: &str = "https://api.github.com";

/// What the user typed: `owner/name`, or a github.com URL with an optional folder or release.
#[derive(Clone, Debug, Default)]
pub struct Target {
    pub owner: String,
    pub name: String,
    pub branch: Option<String>,
    pub path: Option<String>,
    pub tag: Option<String>,
}

pub fn parse_input(input: &str) -> Result<Target, String> {
    let bad = || format!("{input} is not a GitHub repository. Enter owner/name or a github.com link.");
    let trimmed = input.trim().trim_end_matches('/');
    let rest = ["https://github.com/", "http://github.com/", "github.com/", "https://www.github.com/"]
        .iter()
        .find_map(|prefix| trimmed.strip_prefix(prefix))
        .unwrap_or(trimmed);
    let parts: Vec<&str> = rest.split('/').collect();
    let (owner, name) = match parts.as_slice() {
        [owner, name, ..] => (*owner, name.trim_end_matches(".git")),
        _ => return Err(bad()),
    };
    let valid = |part: &str| !part.is_empty() && part.bytes().all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b));
    if !valid(owner) || !valid(name) {
        return Err(bad());
    }
    let mut target = Target { owner: owner.into(), name: name.into(), ..Target::default() };
    match &parts[2..] {
        [] => {}
        ["tree", branch, path @ ..] => {
            target.branch = Some((*branch).into());
            if !path.is_empty() {
                target.path = Some(path.join("/"));
            }
        }
        ["releases", "tag", tag @ ..] if !tag.is_empty() => target.tag = Some(tag.join("/")),
        _ => return Err(bad()),
    }
    Ok(target)
}

pub fn repository_url(owner: &str, name: &str) -> String {
    format!("{API}/repos/{owner}/{name}")
}

/// Follows renames and transfers: the id is the repository's stable identity.
pub fn repository_by_id_url(id: u64) -> String {
    format!("{API}/repositories/{id}")
}

/// GitHub's largest page.
pub const RELEASES_PER_PAGE: usize = 100;
/// Genesis reads at most the newest 1000 releases of a repository.
pub const MAX_RELEASE_PAGES: u32 = 10;

/// One page of releases, newest first; `page` starts at 1.
pub fn releases_url(full_name: &str, page: u32) -> String {
    format!("{API}/repos/{full_name}/releases?per_page={RELEASES_PER_PAGE}&page={page}")
}

/// Whether a later page may hold more releases: this page is full. A page past
/// `MAX_RELEASE_PAGES` is never read, and the caller treats the list as incomplete.
pub fn page_full(page: &Value) -> bool {
    page.as_array().is_some_and(|a| a.len() >= RELEASES_PER_PAGE)
}

/// The release of one tag, wherever it sits in the release list.
pub fn release_by_tag_url(full_name: &str, tag: &str) -> String {
    format!("{API}/repos/{full_name}/releases/tags/{}", tag.split('/').map(encode).collect::<Vec<_>>().join("/"))
}

pub fn commit_url(full_name: &str, branch: &str) -> String {
    format!("{API}/repos/{full_name}/commits/{}", encode(branch))
}

pub fn tree_url(full_name: &str, commit: &str) -> String {
    format!("{API}/repos/{full_name}/git/trees/{commit}?recursive=1")
}

/// A file at a commit, never at a branch name.
pub fn raw_url(full_name: &str, commit: &str, path: &str) -> String {
    format!("https://raw.githubusercontent.com/{full_name}/{commit}/{}", path.split('/').map(encode).collect::<Vec<_>>().join("/"))
}

fn encode(part: &str) -> String {
    url::form_urlencoded::byte_serialize(part.as_bytes()).collect::<String>().replace('+', "%20")
}

pub struct Repository {
    pub id: u64,
    pub full_name: String,
    pub default_branch: String,
    pub archived: bool,
}

pub fn parse_repository(body: &Value) -> Result<Repository, String> {
    let text = |key: &str| body.get(key).and_then(Value::as_str).map(String::from);
    if body.get("private").and_then(Value::as_bool) != Some(false) {
        return Err("Genesis adds applets only from public repositories.".into());
    }
    Ok(Repository {
        id: body.get("id").and_then(Value::as_u64).ok_or("GitHub sent no repository id")?,
        full_name: text("full_name").ok_or("GitHub sent no repository name")?,
        default_branch: text("default_branch").ok_or("GitHub sent no default branch")?,
        archived: body.get("archived").and_then(Value::as_bool).unwrap_or(false),
    })
}

/// A published release that may hold an applet: a version tag with a release record asset.
pub struct Release {
    pub tag: String,
    pub applet_id: String,
    pub version: String,
    pub prerelease: bool,
    pub record_url: String,
    pub bundle_url: Option<String>,
}

/// The releases whose tag is `v<version>` or `<id>/v<version>` and that carry
/// `applet-<id>.release.json`. Drafts are skipped; a single-applet tag takes its id from the asset.
pub fn parse_releases(body: &Value) -> Vec<Release> {
    let mut found = Vec::new();
    for release in body.as_array().into_iter().flatten() {
        if release.get("draft").and_then(Value::as_bool) != Some(false) {
            continue;
        }
        let Some(tag) = release.get("tag_name").and_then(Value::as_str) else { continue };
        let (tag_id, version) = match tag.rsplit_once("/v") {
            Some((id, version)) => (Some(id), version),
            None => match tag.strip_prefix('v') {
                Some(version) => (None, version),
                None => continue,
            },
        };
        let Some(parsed) = Version::parse(version) else { continue };
        let assets: Vec<(&str, &str)> = release
            .get("assets")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|a| Some((a.get("name")?.as_str()?, a.get("browser_download_url")?.as_str()?)))
            .collect();
        let records = assets.iter().filter_map(|(name, url)| {
            let id = name.strip_prefix("applet-")?.strip_suffix(".release.json")?;
            (imports::is_id(id) && tag_id.is_none_or(|t| t == id)).then_some((id, *url))
        });
        for (id, record_url) in records {
            let bundle_name = format!("applet-{id}.bundle.json");
            found.push(Release {
                tag: tag.into(),
                applet_id: id.into(),
                version: version.into(),
                prerelease: parsed.is_prerelease(),
                record_url: record_url.into(),
                bundle_url: assets.iter().find(|(name, _)| *name == bundle_name).map(|(_, url)| (*url).into()),
            });
        }
    }
    found
}

pub fn parse_commit(body: &Value) -> Result<String, String> {
    let sha = body.get("sha").and_then(Value::as_str).ok_or("GitHub sent no commit")?;
    (sha.len() == 40 && sha.bytes().all(|b| b.is_ascii_hexdigit())).then(|| sha.into()).ok_or_else(|| "GitHub sent an invalid commit".into())
}

/// The committed release records of a branch: `published/applet-<id>.release.json` beside an
/// `applet.json`, at the root (single-applet) or one directory down (multi-applet). Returns
/// (applet path, record path) pairs; a root applet wins over subdirectories.
pub fn parse_tree(body: &Value) -> Vec<(String, String)> {
    let paths: Vec<&str> = body
        .get("tree")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|e| e.get("type").and_then(Value::as_str) == Some("blob"))
        .filter_map(|e| e.get("path")?.as_str())
        .collect();
    let has = |path: &str| paths.contains(&path);
    let record = |prefix: &str, path: &str| -> Option<String> {
        let rest = path.strip_prefix(prefix)?.strip_prefix("published/applet-")?;
        let id = rest.strip_suffix(".release.json")?;
        imports::is_id(id).then(|| path.to_string())
    };
    if has("applet.json") {
        return paths.iter().filter_map(|p| record("", p)).map(|r| (".".to_string(), r)).take(1).collect();
    }
    paths
        .iter()
        .filter_map(|p| {
            let (directory, _) = p.split_once('/')?;
            let found = record(&format!("{directory}/"), p)?;
            has(&format!("{directory}/applet.json")).then(|| (directory.to_string(), found))
        })
        .collect()
}

/// API responses by URL, with their ETags, in `files/genesis/github-cache/`.
pub struct Cache {
    pub directory: PathBuf,
}

pub struct Cached {
    pub etag: Option<String>,
    pub body: String,
}

impl Cache {
    fn file(&self, url: &str) -> PathBuf {
        self.directory.join(format!("{}.json", imports::sha256_hex(url.as_bytes())))
    }

    pub fn get(&self, url: &str) -> Option<Cached> {
        let stored: Value = serde_json::from_slice(&fs::read(self.file(url)).ok()?).ok()?;
        Some(Cached {
            etag: stored.get("etag").and_then(Value::as_str).map(String::from),
            body: stored.get("body")?.as_str()?.into(),
        })
    }

    pub fn put(&self, url: &str, etag: Option<&str>, body: &str, now_ms: u64) {
        let stored = json!({ "url": url, "etag": etag, "body": body, "fetchedAt": now_ms });
        let _ = write_atomic(&self.file(url), stored.to_string().as_bytes());
    }
}
