//! Adding, reviewing, updating and removing applets. Each flow is a small state machine driven by
//! fetches the shell runs; only one runs at a time. A failure ends the flow, deletes what it
//! downloaded and shows one error; an update check instead counts the applets it could not check.
//! Nothing reaches the applet index before the user accepts.
use crate::{
    applets::capabilities,
    compat, documents, fetch,
    github::{self, Cache, Release, Repository, Target},
    host::{Host, now_ms},
    imports::{self, Verified, VerifiedFiles},
    semver,
    source::{self, Source},
    storage_worker,
};
use genesis_contracts::*;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap},
    fs,
    path::{Path, PathBuf},
};

/// The launcher's automatic check runs at most this often.
const AUTO_CHECK_MS: u64 = 6 * 60 * 60 * 1000;
const BUSY: &str = "Another applet operation is in progress";
const FETCH_DIRECTORY: &str = "genesis-fetch";

/// Updates found by the last check, shown as launcher badges. `files/genesis/updates.json`.
#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Updates {
    #[serde(default)]
    checked_at: u64,
    #[serde(default)]
    applets: BTreeMap<String, AppletUpdate>,
    /// Withdrawn releases the user kept, by applet: the release's `kept_release` key, no longer flagged.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    kept: BTreeMap<String, String>,
}

pub struct Flow {
    kind: Kind,
    stage: Stage,
    /// Fetches in flight: request id to (url, what the response is for).
    waiting: HashMap<String, (String, Step)>,
    /// Downloaded or copied files, deleted when the flow ends.
    files: Vec<PathBuf>,
    target: Target,
    repository: Option<Repository>,
    branch: Option<String>,
    candidates: Vec<Candidate>,
    review: Option<PendingReview>,
    /// Update checks: the result per applet, None when it has no update.
    found: BTreeMap<String, Option<AppletUpdate>>,
    /// Update checks: the applets that could not be checked, with the reason.
    failed: BTreeMap<String, String>,
}

/// A storage job erasing an applet's data, and what follows once the data is gone. The job
/// holds the reviewed build itself, so the install still follows when a new Activity ends the flow.
pub enum Deletion {
    /// The reviewed build, installed with "replace and erase".
    Install { applet_id: String, review: Box<PendingReview> },
    Remove { applet_id: String },
    /// Clear data: the applet and its service connections stay.
    Clear { applet_id: String },
}

impl Deletion {
    fn applet_id(&self) -> &str {
        let (Deletion::Install { applet_id, .. } | Deletion::Remove { applet_id } | Deletion::Clear { applet_id }) = self;
        applet_id
    }
}

#[derive(Clone, PartialEq)]
enum Kind {
    Add,
    File,
    Dev,
    Check { manual: bool, only: Option<String> },
}

#[derive(Clone, Copy, PartialEq)]
enum Stage {
    Releases,
    Branch,
    Choosing,
    Downloading,
    Reviewing,
    /// The data of the applet being replaced is being erased; the install follows.
    Erasing,
    Checking,
}

enum Step {
    Repository,
    /// One page of releases, numbered from 1.
    Releases { page: u32 },
    /// The release of the tag a `/releases/tag/<tag>` link names.
    TagRelease,
    Record(Release),
    Commit,
    Tree { commit: String },
    BranchRecord { commit: String, applet_path: String },
    Bundle { candidate: Box<Candidate>, older_allowed: bool },
    CheckRepository { applet_id: String },
    /// `found` holds this applet's releases from the earlier pages.
    CheckReleases { applet_id: String, page: u32, found: Vec<Release> },
    /// `older` holds the next newer releases, newest first, tried when this one does not run here.
    /// `incompatible` is the newest release already read that does not run here.
    CheckRecord { applet_id: String, release: Release, older: Vec<Release>, withdrawn: bool, incompatible: Option<String> },
    CheckCommit { applet_id: String },
    CheckBranchRecord { applet_id: String, commit: String },
}

impl Step {
    /// The applet an update check step is for.
    fn checked_applet(&self) -> Option<&str> {
        match self {
            Step::CheckRepository { applet_id }
            | Step::CheckReleases { applet_id, .. }
            | Step::CheckRecord { applet_id, .. }
            | Step::CheckCommit { applet_id }
            | Step::CheckBranchRecord { applet_id, .. } => Some(applet_id),
            _ => None,
        }
    }
}

/// A release record that passed every check, with the source it installs as.
#[derive(Clone)]
struct Candidate {
    record: ReleaseRecord,
    source: Source,
    bundle_url: String,
    compatible: bool,
    note: Option<String>,
    release: ReleaseNotes,
}

/// The date and notes summary of the GitHub release a build comes from; empty for other builds.
#[derive(Clone, Default)]
struct ReleaseNotes {
    published_at: Option<String>,
    notes: Option<String>,
}

pub struct PendingReview {
    review_id: String,
    file: PathBuf,
    source: Source,
    older_allowed: bool,
    outcome: ReviewOutcome,
    /// Shows `ShowInstalled` once installed; development builds install without it.
    confirm: bool,
}

impl Flow {
    fn new(kind: Kind, stage: Stage) -> Self {
        Self {
            kind,
            stage,
            waiting: HashMap::new(),
            files: Vec::new(),
            target: Target::default(),
            repository: None,
            branch: None,
            candidates: Vec::new(),
            review: None,
            found: BTreeMap::new(),
            failed: BTreeMap::new(),
        }
    }

    /// The launcher's automatic check reports nothing.
    fn silent(&self) -> bool {
        matches!(self.kind, Kind::Check { manual: false, .. })
    }
}

fn parse_json(text: &str) -> Result<Value, String> {
    serde_json::from_str(text).map_err(|e| format!("GitHub sent invalid JSON: {e}"))
}

fn compatibility(record: &ReleaseRecord) -> (bool, Option<String>) {
    match compat::evaluate_release(&record.compat) {
        Compatibility::Current => (true, None),
        Compatibility::Incompatible { direction: Direction::Newer, .. } => (false, Some("Needs a newer Genesis".into())),
        Compatibility::Incompatible { .. } => (false, Some("Built for an older Genesis".into())),
    }
}

/// A release record that needs a newer Genesis, so updating Genesis would let it install.
fn needs_newer_genesis(record: &ReleaseRecord) -> bool {
    matches!(compat::evaluate_release(&record.compat), Compatibility::Incompatible { direction: Direction::Newer, .. })
}

/// A GitHub release by repository, applet path and tag, so a choice about one publisher's
/// release never matches another's.
fn kept_release(source: &Source) -> Option<String> {
    match source {
        Source::Github { repository_id, path, tag: Some(tag), .. } => Some(format!("{repository_id}:{path}:{tag}")),
        _ => None,
    }
}

fn prerelease(version: &str) -> bool {
    semver::Version::parse(version).is_some_and(|v| v.is_prerelease())
}

fn newer(a: &str, b: &str) -> bool {
    semver::compare(a, b) == Some(Ordering::Greater)
}

/// A release asset record that names the repository, tag, applet and version GitHub listed it
/// under, and the expected path when one is given.
fn release_candidate(repository: (u64, &str), release: &Release, record: ReleaseRecord, path: Option<&str>) -> Option<Candidate> {
    let origin = record.source.as_ref()?;
    let valid = origin.repository.id == repository.0
        && origin.tag == release.tag
        && record.applet_id == release.applet_id
        && record.version == release.version
        && path.is_none_or(|p| p == origin.path);
    if !valid {
        return None;
    }
    let source = Source::Github {
        repository_id: repository.0,
        full_name: repository.1.into(),
        path: origin.path.clone(),
        channel: Channel::Release,
        branch: None,
        version: record.version.clone(),
        tag: Some(release.tag.clone()),
        commit: origin.commit.clone(),
        bundle_sha256: record.bundle.sha256.clone(),
        prerelease: release.prerelease,
    };
    let (compatible, note) = compatibility(&record);
    let notes = ReleaseNotes { published_at: release.published_at.clone(), notes: release.body.as_deref().and_then(github::notes_summary) };
    Some(Candidate { source, bundle_url: release.bundle_url.clone()?, compatible, note, record, release: notes })
}

/// The `published/` path of an applet's file at `applet_path` (`.` for the repository root).
fn published(applet_path: &str, file: &str) -> String {
    match applet_path {
        "." => format!("published/{file}"),
        path => format!("{path}/published/{file}"),
    }
}

fn branch_candidate(repository: (u64, &str), branch: &str, commit: &str, applet_path: &str, record: ReleaseRecord) -> Candidate {
    let bundle = published(applet_path, &record.bundle.file);
    let source = Source::Github {
        repository_id: repository.0,
        full_name: repository.1.into(),
        path: applet_path.into(),
        channel: Channel::Branch,
        branch: Some(branch.into()),
        version: record.version.clone(),
        tag: None,
        commit: commit.into(),
        bundle_sha256: record.bundle.sha256.clone(),
        prerelease: prerelease(&record.version),
    };
    let (compatible, note) = compatibility(&record);
    let bundle_url = github::raw_url(repository.1, commit, &bundle);
    Candidate { source, bundle_url, compatible, note, record, release: ReleaseNotes::default() }
}

/// A bundle that runs on this Genesis; any other is refused before review.
fn current_bundle(payload: &str) -> Result<(Box<Bundle>, VerifiedFiles), String> {
    match imports::verify(payload).map_err(|e| e.message)? {
        Verified::Current { bundle, files } => Ok((bundle, files)),
        Verified::Incompatible(bundle) => Err(format!("{} was built for another Genesis and cannot be installed", bundle.name)),
    }
}

/// The GitHub owner of a GitHub source.
fn publisher(source: &Source) -> Option<String> {
    match source {
        Source::Github { full_name, .. } => full_name.split_once('/').map(|(owner, _)| owner.to_string()),
        _ => None,
    }
}

/// What an offered release asks for beyond the installed applet: origins, services and storage.
/// What the installed applet's files do not say counts as new.
fn gains(installed: Option<&LauncherEntry>, record: &ReleaseRecord) -> (Vec<String>, Vec<String>, bool) {
    let (origins, services) = installed.map(|e| (e.origins.as_slice(), e.services.as_slice())).unwrap_or_default();
    let new_origins = record.origins.iter().filter(|o| !origins.contains(o)).cloned().collect();
    let new_services = record.capabilities.services.iter().filter(|s| !services.contains(s)).cloned().collect();
    (new_origins, new_services, record.capabilities.storage && !installed.is_some_and(|e| e.storage))
}

impl Host {
    fn files_path(&self, relative: &str) -> Option<PathBuf> {
        self.files_dir.as_ref().map(|d| d.join(relative))
    }

    fn cache(&self) -> Option<Cache> {
        Some(Cache { directory: self.files_path("genesis/github-cache")? })
    }

    pub fn load_updates(&mut self) {
        let stored = self.files_path("genesis/updates.json").and_then(|p| fs::read(p).ok());
        self.updates = stored.and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
    }

    fn save_updates(&self) {
        if let (Some(path), Ok(encoded)) = (self.files_path("genesis/updates.json"), serde_json::to_vec(&self.updates)) {
            let _ = crate::applets::write_atomic(&path, &encoded);
        }
    }

    fn clear_update(&mut self, applet_id: &str) {
        if self.updates.applets.remove(applet_id).is_some() {
            self.save_updates();
        }
    }

    /// Launcher entries with the update badges of the last check.
    pub fn launcher_entries(&self) -> Vec<LauncherEntry> {
        let mut entries = self.applets.launcher();
        for entry in &mut entries {
            entry.update = self.updates.applets.get(&entry.applet_id).cloned();
        }
        entries
    }

    /// When every applet was last checked for updates; 0 when never.
    pub fn updates_checked_at(&self) -> u64 {
        self.updates.checked_at
    }

    /// One applet's launcher entry with its update badge.
    fn launcher_entry(&self, applet_id: &str) -> Option<LauncherEntry> {
        let mut entry = self.applets.entry(applet_id)?;
        entry.update = self.updates.applets.get(applet_id).cloned();
        Some(entry)
    }

    // -----------------------------------------------------------------------------------------
    // Running a flow

    fn begin(&mut self, kind: Kind, stage: Stage) -> Result<(), String> {
        if self.flow.is_some() {
            return Err(BUSY.into());
        }
        self.flow = Some(Flow::new(kind, stage));
        Ok(())
    }

    fn flow_mut(&mut self) -> Result<&mut Flow, String> {
        self.flow.as_mut().ok_or_else(|| "The applet operation ended".into())
    }

    fn progress(&mut self, message: String) {
        if self.flow.as_ref().is_some_and(|f| !f.silent()) {
            self.out.push(ShellCommand::ShowProgress { message: Some(message) });
        }
    }

    /// Ends the flow and deletes its files. The shell drops its progress message.
    pub fn end_flow(&mut self) {
        let Some(flow) = self.flow.take() else { return };
        for file in &flow.files {
            let _ = fs::remove_file(file);
        }
        if !flow.silent() {
            self.out.push(ShellCommand::ShowProgress { message: None });
        }
    }

    fn fail(&mut self, message: String) {
        let silent = self.flow.as_ref().is_some_and(Flow::silent);
        self.end_flow();
        if !silent {
            self.out.push(ShellCommand::ShowError { applet_id: None, message });
        }
    }

    /// Asks the shell for `url`. API requests carry the cached ETag and are refused while
    /// GitHub's rate limit is spent. `to_file` downloads into `files/genesis-fetch/`.
    fn request(&mut self, url: String, step: Step, max_bytes: u64, to_file: bool) -> Result<(), String> {
        let now_s = now_ms() / 1000;
        if fetch::is_api(&url) && self.rate_reset_s > now_s {
            let minutes = (self.rate_reset_s - now_s).div_ceil(60);
            return Err(format!("GitHub rate limit reached, try again in {minutes} minutes"));
        }
        self.next_request += 1;
        let request_id = format!("fetch-{}-{}", now_ms(), self.next_request);
        let etag = fetch::is_api(&url).then(|| self.cache().and_then(|c| c.get(&url)).and_then(|c| c.etag)).flatten();
        let file = match to_file {
            true => Some(self.files_path(FETCH_DIRECTORY).ok_or("Genesis is not attached")?.join(format!("{request_id}.bundle.json"))),
            false => None,
        };
        let command = fetch::command(&request_id, &url, max_bytes, etag, file.as_ref().map(|f| f.to_string_lossy().into_owned()))?;
        let flow = self.flow_mut()?;
        flow.files.extend(file);
        flow.waiting.insert(request_id, (url, step));
        self.out.push(command);
        Ok(())
    }

    pub fn fetch_completed(&mut self, event: ShellEvent) {
        let ShellEvent::FetchCompleted { request_id, status, error, etag, rate_remaining, rate_reset, body, path, .. } = event else {
            return;
        };
        let Some((url, step)) = self.flow.as_mut().and_then(|f| f.waiting.remove(&request_id)) else {
            // A result for a flow that ended: delete what it downloaded.
            if let (Some(path), Some(directory)) = (path, self.files_path(FETCH_DIRECTORY))
                && Path::new(&path).starts_with(&directory)
            {
                let _ = fs::remove_file(path);
            }
            return;
        };
        let got = match status {
            0 => Err(error.unwrap_or_else(|| "Network error".into())),
            403 | 429 if rate_remaining == Some(0) => {
                self.rate_reset_s = rate_reset.unwrap_or_else(|| now_ms() / 1000 + 3600);
                let minutes = self.rate_reset_s.saturating_sub(now_ms() / 1000).div_ceil(60).max(1);
                Err(format!("GitHub rate limit reached, try again in {minutes} minutes"))
            }
            304 => self.cache().and_then(|c| c.get(&url)).map(|c| c.body).ok_or_else(|| "GitHub's cached answer is missing; try again".into()),
            // A tag with no release: settle reports it as a missing applet release.
            404 if matches!(step, Step::TagRelease) => Ok(String::new()),
            404 => Err(format!("Not found on GitHub: {url}")),
            200..=299 => {
                if let (true, Some(body), Some(cache)) = (fetch::is_api(&url), body.as_ref(), self.cache()) {
                    cache.put(&url, etag.as_deref(), body, now_ms());
                }
                Ok(path.or(body).unwrap_or_default())
            }
            status => Err(format!("GitHub answered {status} for {url}")),
        };
        let checked = step.checked_applet().map(String::from);
        let Err(message) = got.and_then(|got| self.advance(step, got)).and_then(|()| self.settle()) else { return };
        // One applet that cannot be checked does not stop the others.
        let checking = self.flow.as_mut().filter(|f| f.stage == Stage::Checking);
        match (checking, checked) {
            (Some(flow), Some(applet_id)) => {
                flow.failed.insert(applet_id, message);
                if let Err(message) = self.settle() {
                    self.fail(message);
                }
            }
            _ => self.fail(message),
        }
    }

    /// Moves the flow on once every fetch of the current stage has answered.
    fn settle(&mut self) -> Result<(), String> {
        let Some(flow) = self.flow.as_ref() else { return Ok(()) };
        if !flow.waiting.is_empty() {
            return Ok(());
        }
        match flow.stage {
            Stage::Releases if flow.candidates.is_empty() => match flow.target.tag.clone() {
                Some(tag) => Err(format!("{} has no applet release {tag}", flow.repository.as_ref().map_or("The repository", |r| &r.full_name))),
                None => self.start_branch(),
            },
            Stage::Releases | Stage::Branch => self.show_candidates(),
            Stage::Checking => {
                self.finish_check();
                Ok(())
            }
            Stage::Choosing | Stage::Downloading | Stage::Reviewing | Stage::Erasing => Ok(()),
        }
    }

    fn advance(&mut self, step: Step, got: String) -> Result<(), String> {
        const API: u64 = FETCH_API_MAX_BYTES;
        match step {
            Step::Repository => {
                let repository = github::parse_repository(&parse_json(&got)?)?;
                let full_name = repository.full_name.clone();
                self.progress(format!("Reading {full_name}…"));
                let flow = self.flow_mut()?;
                flow.repository = Some(repository);
                // A `/tree/<branch>` link names the branch channel; releases are not consulted.
                if flow.target.branch.is_some() {
                    return self.start_branch();
                }
                match flow.target.tag.clone() {
                    Some(tag) => self.request(github::release_by_tag_url(&full_name, &tag), Step::TagRelease, API, false),
                    None => self.request(github::releases_url(&full_name, 1), Step::Releases { page: 1 }, API, false),
                }
            }
            Step::Releases { page } => {
                let body = parse_json(&got)?;
                for release in github::parse_releases(&body) {
                    self.request(release.record_url.clone(), Step::Record(release), API, false)?;
                }
                if github::page_full(&body) && page < github::MAX_RELEASE_PAGES {
                    let full_name = self.flow_mut()?.repository.as_ref().ok_or("No repository")?.full_name.clone();
                    self.request(github::releases_url(&full_name, page + 1), Step::Releases { page: page + 1 }, API, false)?;
                }
                Ok(())
            }
            Step::TagRelease => {
                if got.is_empty() {
                    return Ok(());
                }
                for release in github::parse_releases(&Value::Array(vec![parse_json(&got)?])) {
                    self.request(release.record_url.clone(), Step::Record(release), API, false)?;
                }
                Ok(())
            }
            Step::Record(release) => {
                // A record that does not parse or match is not offered; the others still are.
                let Ok(record) = imports::parse_release(&got) else { return Ok(()) };
                let flow = self.flow_mut()?;
                let repository = flow.repository.as_ref().ok_or("No repository")?;
                let found = release_candidate((repository.id, &repository.full_name), &release, record, flow.target.path.as_deref());
                flow.candidates.extend(found);
                Ok(())
            }
            Step::Commit => {
                let commit = github::parse_commit(&parse_json(&got)?)?;
                let full_name = self.flow_mut()?.repository.as_ref().ok_or("No repository")?.full_name.clone();
                self.request(github::tree_url(&full_name, &commit), Step::Tree { commit }, API, false)
            }
            Step::Tree { commit } => {
                let flow = self.flow_mut()?;
                let full_name = flow.repository.as_ref().ok_or("No repository")?.full_name.clone();
                let path = flow.target.path.clone();
                let records = github::parse_tree(&parse_json(&got)?);
                for (applet_path, record_path) in records.into_iter().filter(|(p, _)| path.as_ref().is_none_or(|w| w == p)) {
                    let step = Step::BranchRecord { commit: commit.clone(), applet_path };
                    self.request(github::raw_url(&full_name, &commit, &record_path), step, API, false)?;
                }
                Ok(())
            }
            Step::BranchRecord { commit, applet_path } => {
                let Ok(record) = imports::parse_release(&got) else { return Ok(()) };
                let flow = self.flow_mut()?;
                let repository = flow.repository.as_ref().ok_or("No repository")?;
                let branch = flow.branch.clone().unwrap_or_default();
                let candidate = branch_candidate((repository.id, &repository.full_name), &branch, &commit, &applet_path, record);
                flow.candidates.push(candidate);
                Ok(())
            }
            Step::Bundle { candidate, older_allowed } => {
                let file = PathBuf::from(got);
                let bytes = fs::read(&file).map_err(|e| format!("Cannot read the download: {e}"))?;
                imports::check_release(&candidate.record, &bytes)?;
                let Candidate { source, record, release, .. } = *candidate;
                self.review_bundle(file, source, Some(&record), release, older_allowed, Vec::new())
            }
            Step::CheckRepository { applet_id } => self.check_repository(applet_id, &got),
            Step::CheckReleases { applet_id, page, found } => self.check_releases(applet_id, page, found, &got),
            Step::CheckRecord { applet_id, release, older, withdrawn, incompatible } => {
                self.check_record(applet_id, release, older, withdrawn, incompatible, &got)
            }
            Step::CheckCommit { applet_id } => self.check_commit(applet_id, &got),
            Step::CheckBranchRecord { applet_id, commit } => self.check_branch_record(applet_id, commit, &got),
        }
    }

    /// An erase already running finishes with its install, as the user confirmed.
    pub fn cancel_flow(&mut self) {
        if self.flow.as_ref().is_none_or(|f| f.stage != Stage::Erasing) {
            self.end_flow();
        }
    }

    // -----------------------------------------------------------------------------------------
    // Adding from a repository

    pub fn add_from_repository(&mut self, input: &str) {
        let started = github::parse_input(input).and_then(|target| {
            self.begin(Kind::Add, Stage::Releases)?;
            let url = github::repository_url(&target.owner, &target.name);
            self.progress(format!("Reading {}/{}…", target.owner, target.name));
            self.flow_mut()?.target = target;
            self.request(url, Step::Repository, FETCH_API_MAX_BYTES, false)
        });
        if let Err(message) = started {
            match self.flow.is_some() && message != BUSY {
                true => self.fail(message),
                false => self.out.push(ShellCommand::ShowError { applet_id: None, message }),
            }
        }
    }

    /// No release qualified: read the committed `published/` builds of the branch, at its head commit.
    fn start_branch(&mut self) -> Result<(), String> {
        let flow = self.flow_mut()?;
        let repository = flow.repository.as_ref().ok_or("No repository")?;
        let branch = flow.target.branch.clone().unwrap_or_else(|| repository.default_branch.clone());
        let url = github::commit_url(&repository.full_name, &branch);
        flow.branch = Some(branch);
        flow.stage = Stage::Branch;
        self.request(url, Step::Commit, FETCH_API_MAX_BYTES, false)
    }

    fn show_candidates(&mut self) -> Result<(), String> {
        let flow = self.flow.as_mut().ok_or("The applet operation ended")?;
        let repository = flow.repository.as_ref().ok_or("No repository")?;
        if flow.candidates.is_empty() {
            return Err(format!("{} has no published applets", repository.full_name));
        }
        flow.candidates.sort_by(|a, b| {
            let version = |c: &Candidate| semver::Version::parse(&c.record.version);
            a.record.applet_id.cmp(&b.record.applet_id).then_with(|| version(b).cmp(&version(a)))
        });
        let mut applets: Vec<RepositoryApplet> = Vec::new();
        for candidate in &flow.candidates {
            let id = &candidate.record.applet_id;
            let prerelease = prerelease(&candidate.record.version);
            let version = CandidateVersion {
                version: candidate.record.version.clone(),
                prerelease,
                compatible: candidate.compatible,
                note: candidate.note.clone(),
                published_at: candidate.release.published_at.clone(),
                notes: candidate.release.notes.clone(),
            };
            if let Some(applet) = applets.last_mut().filter(|a| a.applet_id == *id) {
                if applet.version.is_none() && candidate.compatible && !prerelease {
                    applet.version = Some(version.version.clone());
                }
                applet.versions.push(version);
                continue;
            }
            let installed = self.applets.source(id).flatten().filter(|s| source::same_source(s, &candidate.source));
            let (path, channel) = match &candidate.source {
                Source::Github { path, channel, .. } => (path.clone(), *channel),
                _ => (".".into(), Channel::Release),
            };
            applets.push(RepositoryApplet {
                applet_id: id.clone(),
                name: candidate.record.name.clone(),
                path,
                channel,
                version: (candidate.compatible && !prerelease).then(|| version.version.clone()),
                versions: vec![version],
                installed: installed.and_then(|s| s.version()).map(String::from),
                note: None,
            });
        }
        for applet in &mut applets {
            if applet.version.is_none() {
                applet.note = match applet.versions.iter().any(|v| v.compatible) {
                    true => Some("Only prereleases are published".into()),
                    false => applet.versions.first().and_then(|v| v.note.clone()),
                };
            }
        }
        let note = repository.archived.then(|| "This repository is archived and gets no more updates.".to_string());
        let repository = repository.full_name.clone();
        flow.stage = Stage::Choosing;
        self.out.push(ShellCommand::ShowProgress { message: None });
        self.out.push(ShellCommand::ShowRepositoryApplets { repository, note, applets });
        Ok(())
    }

    /// `version` None takes the newest compatible stable version. Naming a version is "Install
    /// another version", which also allows a downgrade.
    pub fn choose_candidate(&mut self, applet_id: &str, version: Option<&str>) {
        let chosen = (|| {
            let flow = self.flow.as_ref().filter(|f| f.stage == Stage::Choosing).ok_or("Nothing to choose from")?;
            let mut matching = flow.candidates.iter().filter(|c| c.record.applet_id == applet_id);
            let candidate = match version {
                Some(version) => matching.find(|c| c.record.version == version),
                None => matching.find(|c| c.compatible && !prerelease(&c.record.version)),
            };
            let candidate = candidate.cloned().ok_or_else(|| format!("{applet_id} has no such version"))?;
            if !candidate.compatible {
                return Err(candidate.note.unwrap_or_else(|| "This version does not run on this Genesis".into()));
            }
            self.download(candidate, version.is_some())
        })();
        if let Err(message) = chosen {
            self.fail(message);
        }
    }

    fn download(&mut self, candidate: Candidate, older_allowed: bool) -> Result<(), String> {
        self.flow_mut()?.stage = Stage::Downloading;
        self.progress(format!("Downloading {} {}…", candidate.record.name, candidate.record.version));
        let url = candidate.bundle_url.clone();
        let step = Step::Bundle { candidate: Box::new(candidate), older_allowed };
        self.request(url, step, IMPORT_MAX_BYTES as u64, true)
    }

    // -----------------------------------------------------------------------------------------
    // Reviewing and installing

    /// Verifies the bundle file and asks the user. The bundle must run on this Genesis.
    fn review_bundle(
        &mut self,
        file: PathBuf,
        source: Source,
        record: Option<&ReleaseRecord>,
        release: ReleaseNotes,
        older_allowed: bool,
        mut warnings: Vec<String>,
    ) -> Result<(), String> {
        let payload = fs::read_to_string(&file).map_err(|e| format!("Cannot read the bundle: {e}"))?;
        let (bundle, _) = current_bundle(&payload)?;
        let manifest = &bundle.manifest;
        if record.is_some_and(|r| r.applet_id != manifest.id) {
            return Err("The bundle is not the applet its release record names".into());
        }
        let review = source::review(self.applets.source(&manifest.id), &source, older_allowed);
        warnings.extend(review.warnings);
        self.next_request += 1;
        let review_id = format!("review-{}-{}", now_ms(), self.next_request);
        self.out.push(ShellCommand::ShowProgress { message: None });
        self.out.push(ShellCommand::ShowImportReview {
            review_id: review_id.clone(),
            applet_id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: source.version().map(String::from),
            source_label: source.label(),
            origins: manifest.origins.clone(),
            capabilities: capabilities(manifest),
            outcome: review.outcome.clone(),
            warnings,
            publisher: publisher(&source),
            bundle_sha256: source.bundle_sha256().into(),
            bundle_bytes: payload.len() as u64,
            notes: release.notes,
            published_at: release.published_at,
            previous: self.launcher_entry(&manifest.id).map(Box::new),
        });
        let flow = self.flow_mut()?;
        flow.stage = Stage::Reviewing;
        if !flow.files.contains(&file) {
            flow.files.push(file.clone());
        }
        let confirm = flow.kind != Kind::Dev;
        flow.review = Some(PendingReview { review_id, file, source, older_allowed, outcome: review.outcome, confirm });
        Ok(())
    }

    pub fn review_decision(&mut self, review_id: &str, accept: bool, replace: Option<ReplaceMode>) {
        let matches = self.flow.as_ref().and_then(|f| f.review.as_ref()).is_some_and(|r| r.review_id == review_id);
        if !matches {
            return; // An answer to a review that already ended.
        }
        let review = self.flow.as_mut().and_then(|f| f.review.take()).expect("checked above");
        if !accept {
            return self.end_flow();
        }
        match self.install_reviewed(review, replace) {
            Ok(true) => self.end_flow(),
            Ok(false) => {} // The install follows the erase.
            Err(message) => self.fail(message),
        }
    }

    /// The reviewed file, checked against the source it was reviewed with.
    fn read_reviewed(review: &PendingReview) -> Result<(Box<Bundle>, VerifiedFiles), String> {
        let payload = fs::read_to_string(&review.file).map_err(|e| format!("Cannot read the bundle: {e}"))?;
        if imports::sha256_hex(payload.as_bytes()) != review.source.bundle_sha256() {
            return Err("The bundle changed before it was installed".into());
        }
        current_bundle(&payload)
    }

    /// Checks the file and the installed applet again, since either may have changed during the
    /// review, then installs with the new source. Returns false when the install waits for the
    /// old applet's data to be erased: a failed erase then leaves the old applet as it was.
    fn install_reviewed(&mut self, review: PendingReview, replace: Option<ReplaceMode>) -> Result<bool, String> {
        let (bundle, files) = Self::read_reviewed(&review)?;
        let id = bundle.manifest.id.clone();
        if self.erasing(&id) {
            return Err(erasing_message(&id));
        }
        let again = source::review(self.applets.source(&id), &review.source, review.older_allowed);
        if json!(again.outcome) != json!(review.outcome) {
            return Err("The installed applet changed during the review. Try again.".into());
        }
        let erase = match &again.outcome {
            ReviewOutcome::Blocked { reason } => return Err(reason.clone()),
            ReviewOutcome::Replace { .. } => match replace {
                Some(mode) => mode == ReplaceMode::Erase,
                None => return Err("Choose whether to keep or erase the applet's data".into()),
            },
            ReviewOutcome::Reinstall => {
                // The same build: only the source record changes.
                let version = review.source.version().map(String::from);
                self.applets.set_source(&id, review.source)?;
                self.clear_update(&id);
                self.refresh_launcher();
                if review.confirm {
                    self.show_installed(&bundle.manifest, version, true);
                }
                return Ok(true);
            }
            _ => false,
        };
        if erase {
            self.retire_active_applet(&id);
            // The erase owns the reviewed file from here, so ending the flow keeps it.
            let file = review.file.clone();
            self.flow_mut()?.files.retain(|f| *f != file);
            if let Err(message) = self.erase_data(Deletion::Install { applet_id: id, review: Box::new(review) }) {
                let _ = fs::remove_file(&file);
                return Err(message);
            }
            self.progress(format!("Erasing the data of {}…", bundle.manifest.name));
            self.flow_mut()?.stage = Stage::Erasing;
            return Ok(false);
        }
        self.install_bundle(&bundle, files, review.source, review.confirm)?;
        Ok(true)
    }

    /// Installs a reviewed build. With `confirm`, `ShowInstalled` follows the launcher or applet.
    fn install_bundle(&mut self, bundle: &Bundle, files: VerifiedFiles, source: Source, confirm: bool) -> Result<(), String> {
        let id = bundle.manifest.id.clone();
        let updated = self.applets.source(&id).is_some();
        let version = source.version().map(String::from);
        let (_, previous) = self.applets.install(bundle, files, source)?;
        self.clear_update(&id);
        let was_active = self.contexts.session.as_ref().is_some_and(|s| s.applet_id == id);
        self.after_install(&id, previous, was_active);
        if confirm {
            self.show_installed(&bundle.manifest, version, updated);
        }
        Ok(())
    }

    fn show_installed(&mut self, manifest: &Manifest, version: Option<String>, updated: bool) {
        self.out.push(ShellCommand::ShowInstalled {
            applet_id: manifest.id.clone(),
            name: manifest.name.clone(),
            version,
            origins: manifest.origins.clone(),
            updated,
        });
    }

    /// Shows the manager's list again, so entries and badges are current.
    fn refresh_launcher(&mut self) {
        self.show_launcher();
    }

    /// Retires the applet and forgets where it was.
    fn retire_active_applet(&mut self, applet_id: &str) {
        self.forget_resume(applet_id);
        if self.contexts.session.as_ref().is_some_and(|s| s.applet_id == applet_id) {
            self.retire_active();
        }
    }

    /// Deletes the applet's stored documents and namespace. The install or removal waits for
    /// `deletion_completed`, so an applet whose data could not be erased stays as it was.
    fn erase_data(&mut self, deletion: Deletion) -> Result<(), String> {
        let applet_id = deletion.applet_id().to_string();
        let job_id = documents::next_op_id();
        let job = StorageJob { job_id, applet_id: applet_id.clone(), operation: StorageOperation::DeleteApplet };
        if !storage_worker::submit(job) {
            return Err(format!("Storage is busy; the stored data of {applet_id} was not erased"));
        }
        self.deletions.insert(job_id, deletion);
        Ok(())
    }

    /// An applet whose data is being erased: it cannot be opened, installed or removed until the
    /// erase finishes.
    pub fn erasing(&self, applet_id: &str) -> bool {
        self.deletions.values().any(|d| d.applet_id() == applet_id)
    }

    /// Finishes what waited for the erase, also when a new Activity ended the flow. The shell
    /// forgets the service credentials only once the stored data is gone.
    pub fn deletion_completed(&mut self, deletion: Deletion, erased: Result<(), String>) {
        match deletion {
            Deletion::Install { applet_id, review } => {
                let file = review.file.clone();
                let installed = erased
                    .map_err(|e| format!("The stored data of {applet_id} was not erased, so the new build was not installed: {e}"))
                    .and_then(|()| {
                        self.out.push(ShellCommand::ForgetApplet { applet_id });
                        let (bundle, files) = Self::read_reviewed(&review)?;
                        self.install_bundle(&bundle, files, review.source, review.confirm)
                    });
                let _ = fs::remove_file(&file);
                // Another flow may have started after a new Activity ended this one; leave it alone.
                let waiting = self.flow.as_ref().is_some_and(|f| f.stage == Stage::Erasing);
                match (installed, waiting) {
                    (Ok(()), true) => self.end_flow(),
                    (Ok(()), false) => self.refresh_launcher(),
                    (Err(message), true) => self.fail(message),
                    (Err(message), false) => self.out.push(ShellCommand::ShowError { applet_id: None, message }),
                }
            }
            Deletion::Remove { applet_id } => {
                let removed = erased
                    .map_err(|e| format!("The stored data of {applet_id} was not erased, so it was not removed: {e}"))
                    .and_then(|()| {
                        self.out.push(ShellCommand::ForgetApplet { applet_id: applet_id.clone() });
                        self.applets.remove(&applet_id)
                    });
                match removed {
                    Ok(()) => {
                        self.clear_update(&applet_id);
                        self.forget_kept(&applet_id);
                    }
                    Err(message) => self.out.push(ShellCommand::ShowError { applet_id: None, message }),
                }
                self.refresh_launcher();
            }
            Deletion::Clear { applet_id } => {
                match erased {
                    Ok(()) => {
                        let name = self.applets.entry(&applet_id).map_or(applet_id.clone(), |e| e.name);
                        let message = format!("{name}'s saved data was erased.");
                        self.out.push(ShellCommand::ShowInfo { applet_id: None, title: "Data cleared".into(), message });
                    }
                    Err(e) => {
                        let message = format!("The stored data of {applet_id} was not erased: {e}");
                        self.out.push(ShellCommand::ShowError { applet_id: None, message });
                    }
                }
                self.refresh_launcher();
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // Files and development builds

    /// A bundle the shell copied into `files/genesis-fetch/`, with the release record the user
    /// picked beside it. A record whose source is the installed GitHub source keeps that source.
    pub fn review_file(&mut self, path: &str, release: Option<&str>) {
        let file = PathBuf::from(path);
        let inside = self.files_path(FETCH_DIRECTORY).is_some_and(|d| file.starts_with(d));
        if !inside {
            return self.out.push(ShellCommand::ShowError { applet_id: None, message: "Genesis reads files only from its own folder".into() });
        }
        if let Err(message) = self.begin(Kind::File, Stage::Reviewing) {
            let _ = fs::remove_file(&file);
            return self.out.push(ShellCommand::ShowError { applet_id: None, message });
        }
        let reviewed = (|| {
            self.flow_mut()?.files.push(file.clone());
            let bytes = fs::read(&file).map_err(|e| format!("Cannot read the file: {e}"))?;
            let record = release.map(imports::parse_release).transpose()?;
            if let Some(record) = &record {
                imports::check_release(record, &bytes)?;
            }
            let bundle_sha256 = imports::sha256_hex(&bytes);
            let mut warnings = Vec::new();
            let installed = record.as_ref().and_then(|r| self.applets.source(&r.applet_id).flatten().cloned());
            let source = match (&record, installed) {
                (Some(record), Some(Source::Github { repository_id, full_name, path, .. }))
                    if record.source.as_ref().is_some_and(|s| s.repository.id == repository_id && s.path == path) =>
                {
                    let origin = record.source.as_ref().expect("matched above");
                    warnings.push(format!("Genesis cannot confirm that this file came from {full_name}; it matches that repository's release record."));
                    Source::Github {
                        repository_id,
                        full_name,
                        path,
                        channel: Channel::Release,
                        branch: None,
                        version: record.version.clone(),
                        tag: Some(origin.tag.clone()),
                        commit: origin.commit.clone(),
                        bundle_sha256,
                        prerelease: prerelease(&record.version),
                    }
                }
                (record, _) => Source::File { version: record.as_ref().map(|r| r.version.clone()), bundle_sha256 },
            };
            self.review_bundle(file.clone(), source, record.as_ref(), ReleaseNotes::default(), true, warnings)
        })();
        if let Err(message) = reviewed {
            self.fail(message);
        }
    }

    /// A development build from `genesis-import/`. Refused on a release build. It installs over
    /// a missing, legacy, development or bundled applet; over a GitHub or file source it asks first.
    pub fn import_dev(&mut self, path: &str, payload: &str) {
        let outcome = self.import_dev_outcome(payload);
        let receipt = match &outcome {
            Ok(Some((_, _, receipt))) => receipt.clone(),
            Ok(None) => json!({ "ok": false, "error": "Genesis asks on the device before replacing this applet. Answer there, then run dev status." }),
            Err(error) => json!({ "ok": false, "code": error.code, "error": error.message }),
        };
        let receipt_path = path.strip_suffix(".json").unwrap_or(path).to_owned() + ".receipt.json";
        let _ = crate::applets::write_atomic(Path::new(&receipt_path), receipt.to_string().as_bytes());
        let _ = fs::remove_file(path);
        match outcome {
            Ok(Some((applet_id, previous, _))) => self.after_install(&applet_id, previous, false),
            Ok(None) => {}
            Err(error) => self.out.push(ShellCommand::ShowError { applet_id: None, message: error.message }),
        }
    }

    /// The installed applet, its previous revision and the receipt; None when a review started.
    fn import_dev_outcome(&mut self, payload: &str) -> Result<Option<(String, Option<u64>, Value)>, ErrorBody> {
        if !self.debuggable {
            return Err(ErrorBody::new(ErrorCode::Rejected, "Development builds can only be installed on a debug build"));
        }
        let storage = |message: String| ErrorBody::new(ErrorCode::StorageFailure, message);
        match imports::verify(payload)? {
            Verified::Current { bundle, files } => {
                let id = bundle.manifest.id.clone();
                let source = Source::Dev { bundle_sha256: imports::sha256_hex(payload.as_bytes()) };
                if self.erasing(&id) {
                    return Err(ErrorBody::new(ErrorCode::Rejected, erasing_message(&id)));
                }
                if matches!(self.applets.source(&id), Some(Some(Source::Github { .. } | Source::File { .. }))) {
                    self.review_dev(payload, source).map_err(|m| ErrorBody::new(ErrorCode::Rejected, m))?;
                    return Ok(None);
                }
                let (revision, previous) = self.applets.install(&bundle, files, source).map_err(storage)?;
                self.clear_update(&id);
                let receipt = json!({ "ok": true, "appletId": id, "revision": revision, "status": "current" });
                Ok(Some((id, previous, receipt)))
            }
            Verified::Incompatible(bundle) => {
                let id = bundle.id.clone();
                let receipt = json!({
                    "ok": true, "appletId": bundle.id, "status": "incompatible",
                    "direction": bundle.direction, "mismatches": bundle.mismatches,
                });
                let previous = self.applets.record_incompatible(bundle).map_err(storage)?;
                Ok(Some((id, previous, receipt)))
            }
        }
    }

    fn review_dev(&mut self, payload: &str, source: Source) -> Result<(), String> {
        self.begin(Kind::Dev, Stage::Reviewing)?;
        let started = (|| {
            self.next_request += 1;
            let name = format!("dev-{}-{}.bundle.json", now_ms(), self.next_request);
            let file = self.files_path(FETCH_DIRECTORY).ok_or("Genesis is not attached")?.join(name);
            self.flow_mut()?.files.push(file.clone());
            crate::applets::write_atomic(&file, payload.as_bytes())?;
            self.review_bundle(file, source, None, ReleaseNotes::default(), true, Vec::new())
        })();
        // The caller reports the error with the receipt.
        if started.is_err() {
            self.end_flow();
        }
        started
    }

    /// A bundle staged from the APK, with its release record when the APK has one. It never
    /// replaces another source, and over its own GitHub source it installs only a higher version.
    pub fn import_bundled(&mut self, path: &str, payload: &str, release: Option<&str>) {
        let _ = fs::remove_file(path);
        let installed = match imports::verify(payload) {
            Err(error) => return self.out.push(ShellCommand::ShowError { applet_id: None, message: error.message }),
            Ok(Verified::Incompatible(bundle)) => {
                let id = bundle.id.clone();
                let takes = !self.applets.removed_bundled(&id)
                    && matches!(self.applets.source(&id), None | Some(None) | Some(Some(Source::Bundled { .. })));
                if !takes {
                    return;
                }
                self.applets.record_incompatible(bundle).map(|previous| (id, previous))
            }
            Ok(Verified::Current { bundle, files }) => {
                let id = bundle.manifest.id.clone();
                let bundle_sha256 = imports::sha256_hex(payload.as_bytes());
                let record = release
                    .and_then(|text| imports::parse_release(text).ok())
                    .filter(|r| r.applet_id == id && imports::check_release(r, payload.as_bytes()).is_ok());
                let source = Source::Bundled {
                    version: record.as_ref().map(|r| r.version.clone()),
                    bundle_sha256,
                    home: record.and_then(|r| r.home),
                };
                if self.applets.removed_bundled(&id) || self.erasing(&id) || !self.bundled_wins(&id, &source) {
                    return;
                }
                self.applets.install(&bundle, files, source).map(|(_, previous)| (id, previous))
            }
        };
        match installed {
            Ok((id, previous)) => self.after_install(&id, previous, false),
            Err(message) => self.out.push(ShellCommand::ShowError { applet_id: None, message }),
        }
    }

    fn bundled_wins(&self, applet_id: &str, candidate: &Source) -> bool {
        let Some(Some(installed)) = self.applets.source(applet_id) else { return true };
        match installed {
            Source::Bundled { bundle_sha256, .. } => bundle_sha256 != candidate.bundle_sha256(),
            Source::Dev { .. } => true,
            Source::Github { version, .. } if source::same_source(installed, candidate) => {
                candidate.version().is_some_and(|v| newer(v, version))
            }
            Source::Github { .. } | Source::File { .. } => false,
        }
    }

    // -----------------------------------------------------------------------------------------
    // Removing

    pub fn remove_applet(&mut self, applet_id: &str) {
        self.erase_applet(Deletion::Remove { applet_id: applet_id.into() });
    }

    /// Erases the applet's stored data and keeps the applet and its service connections.
    pub fn clear_data(&mut self, applet_id: &str) {
        self.erase_applet(Deletion::Clear { applet_id: applet_id.into() });
    }

    /// Starts a removal or a data clear: refused during a review or another erase of the applet.
    /// An open applet retires and its window closes first.
    fn erase_applet(&mut self, deletion: Deletion) {
        let applet_id = deletion.applet_id().to_string();
        let reviewing = self.flow.as_ref().and_then(|f| f.review.as_ref()).is_some();
        if reviewing || self.erasing(&applet_id) {
            return self.out.push(ShellCommand::ShowError { applet_id: None, message: BUSY.into() });
        }
        if self.applets.source(&applet_id).is_none() {
            return self.out.push(ShellCommand::ShowError { applet_id: None, message: format!("Applet {applet_id} is not installed") });
        }
        self.retire_active_applet(&applet_id);
        self.out.push(ShellCommand::CloseAppletWindow { applet_id: applet_id.clone() });
        if let Err(message) = self.erase_data(deletion) {
            self.out.push(ShellCommand::ShowError { applet_id: None, message });
        }
        self.show_launcher();
    }

    /// Keeps an installed release the publisher withdrew: later checks no longer flag its tag.
    pub fn keep_version(&mut self, applet_id: &str) {
        let Some(release) = self.github_source(applet_id).as_ref().and_then(kept_release) else {
            return self.out.push(ShellCommand::ShowError { applet_id: None, message: format!("{applet_id} has no GitHub release to keep") });
        };
        self.updates.kept.insert(applet_id.into(), release);
        self.updates.applets.remove(applet_id);
        self.save_updates();
        self.refresh_launcher();
    }

    fn forget_kept(&mut self, applet_id: &str) {
        if self.updates.kept.remove(applet_id).is_some() {
            self.save_updates();
        }
    }

    // -----------------------------------------------------------------------------------------
    // Updates

    /// Re-resolves GitHub-sourced applets with ETags. One applet with `manual` set is a badge tap:
    /// an update found goes straight to review.
    pub fn check_updates(&mut self, applet_id: Option<String>, manual: bool) {
        let now = now_ms();
        if self.flow.is_some() {
            if manual {
                self.out.push(ShellCommand::ShowError { applet_id: None, message: BUSY.into() });
            }
            return;
        }
        if !manual {
            if now.saturating_sub(self.updates.checked_at) < AUTO_CHECK_MS {
                return;
            }
            // A failed automatic check waits for the next period too.
            self.updates.checked_at = now;
            self.save_updates();
        }
        let targets: Vec<(String, u64)> = self
            .applets
            .sources()
            .filter(|(id, _)| applet_id.as_ref().is_none_or(|only| only == *id))
            .filter_map(|(id, s)| match s {
                Source::Github { repository_id, .. } => Some((id.clone(), *repository_id)),
                _ => None,
            })
            .collect();
        if targets.is_empty() {
            if manual {
                let message = match applet_id {
                    Some(_) => "This applet was not installed from GitHub, so Genesis cannot check it for updates.",
                    None => "No applets are installed from GitHub.",
                };
                self.out.push(ShellCommand::ShowInfo { applet_id: None, title: "Updates".into(), message: message.into() });
            }
            return;
        }
        let started = (|| {
            self.begin(Kind::Check { manual, only: applet_id }, Stage::Checking)?;
            self.progress("Checking for updates…".into());
            for (id, repository_id) in targets {
                let step = Step::CheckRepository { applet_id: id };
                self.request(github::repository_by_id_url(repository_id), step, FETCH_API_MAX_BYTES, false)?;
            }
            Ok(())
        })();
        if let Err(message) = started {
            self.fail(message);
        }
    }

    fn github_source(&self, applet_id: &str) -> Option<Source> {
        self.applets.source(applet_id).flatten().filter(|s| matches!(s, Source::Github { .. })).cloned()
    }

    fn found(&mut self, applet_id: String, update: Option<AppletUpdate>) -> Result<(), String> {
        self.flow_mut()?.found.insert(applet_id, update);
        Ok(())
    }

    fn badge_tap(&self, applet_id: &str) -> bool {
        self.flow.as_ref().is_some_and(|f| f.kind == Kind::Check { manual: true, only: Some(applet_id.into()) })
    }

    /// Follows a rename or transfer quietly, then reads the applet's channel.
    fn check_repository(&mut self, applet_id: String, got: &str) -> Result<(), String> {
        let repository = github::parse_repository(&parse_json(got)?)?;
        let Some(mut installed) = self.github_source(&applet_id) else { return Ok(()) };
        let Source::Github { full_name, channel, branch, .. } = &mut installed else { return Ok(()) };
        let (channel, branch) = (*channel, branch.clone().unwrap_or_default());
        if *full_name != repository.full_name {
            *full_name = repository.full_name.clone();
            self.applets.set_source(&applet_id, installed)?;
        }
        let (url, step) = match channel {
            Channel::Release => (github::releases_url(&repository.full_name, 1), Step::CheckReleases { applet_id, page: 1, found: Vec::new() }),
            Channel::Branch => (github::commit_url(&repository.full_name, &branch), Step::CheckCommit { applet_id }),
        };
        self.request(url, step, FETCH_API_MAX_BYTES, false)
    }

    /// Reads release pages, newest first, until the installed tag appears or the list ends.
    fn check_releases(&mut self, applet_id: String, page: u32, mut found: Vec<Release>, got: &str) -> Result<(), String> {
        let Some(installed @ Source::Github { .. }) = self.github_source(&applet_id) else { return Ok(()) };
        let release = kept_release(&installed);
        let Source::Github { full_name, tag, version, prerelease: on_prerelease, .. } = installed else { return Ok(()) };
        let body = parse_json(got)?;
        found.extend(github::parse_releases(&body).into_iter().filter(|r| r.applet_id == applet_id));
        let seen = tag.as_ref().is_some_and(|t| found.iter().any(|r| r.tag == *t));
        let more = github::page_full(&body);
        if more && tag.is_some() && !seen && page < github::MAX_RELEASE_PAGES {
            let step = Step::CheckReleases { applet_id, page: page + 1, found };
            return self.request(github::releases_url(&full_name, page + 1), step, FETCH_API_MAX_BYTES, false);
        }
        // A tag missing from a list cut off after the last page read may still exist.
        // A withdrawn release the user kept is not flagged again.
        let kept = release.is_some() && self.updates.kept.get(&applet_id) == release.as_ref();
        let withdrawn = !more && tag.is_some() && !seen && !kept;
        let mut newer: Vec<Release> = found.into_iter().filter(|r| (on_prerelease || !r.prerelease) && newer(&r.version, &version)).collect();
        newer.sort_by(|a, b| semver::compare(&a.version, &b.version).unwrap_or(Ordering::Equal));
        self.check_next_release(applet_id, newer, withdrawn, None)
    }

    /// Reads the record of the newest release left; `older` is sorted oldest first.
    fn check_next_release(&mut self, applet_id: String, mut older: Vec<Release>, withdrawn: bool, incompatible: Option<String>) -> Result<(), String> {
        match older.pop() {
            Some(release) => {
                let url = release.record_url.clone();
                let step = Step::CheckRecord { applet_id, release, older, withdrawn, incompatible };
                self.request(url, step, FETCH_API_MAX_BYTES, false)
            }
            None => self.offer(applet_id, None, withdrawn, incompatible),
        }
    }

    /// A newer release that does not run on this Genesis gives way to the next older one, and the
    /// newest one that needs a newer Genesis is remembered for "Needs a newer Genesis". One built
    /// for an older Genesis is only skipped: updating Genesis would not help.
    fn check_record(
        &mut self,
        applet_id: String,
        release: Release,
        older: Vec<Release>,
        withdrawn: bool,
        incompatible: Option<String>,
        got: &str,
    ) -> Result<(), String> {
        let Some(Source::Github { repository_id, full_name, path, .. }) = self.github_source(&applet_id) else { return Ok(()) };
        let candidate = imports::parse_release(got)
            .ok()
            .and_then(|record| release_candidate((repository_id, &full_name), &release, record, Some(&path)));
        match candidate {
            Some(candidate) if candidate.compatible => self.offer(applet_id, Some(candidate), withdrawn, incompatible),
            Some(candidate) => {
                let incompatible = incompatible.or(needs_newer_genesis(&candidate.record).then_some(candidate.record.version));
                self.check_next_release(applet_id, older, withdrawn, incompatible)
            }
            None => self.check_next_release(applet_id, older, withdrawn, incompatible),
        }
    }

    fn check_commit(&mut self, applet_id: String, got: &str) -> Result<(), String> {
        let commit = github::parse_commit(&parse_json(got)?)?;
        let Some(Source::Github { full_name, path, commit: installed, .. }) = self.github_source(&applet_id) else { return Ok(()) };
        if commit == installed {
            return self.found(applet_id, None);
        }
        let record = published(&path, &format!("applet-{applet_id}.release.json"));
        let url = github::raw_url(&full_name, &commit, &record);
        self.request(url, Step::CheckBranchRecord { applet_id, commit }, FETCH_API_MAX_BYTES, false)
    }

    /// A new commit with the same build is recorded without asking; a new build is an update.
    fn check_branch_record(&mut self, applet_id: String, commit: String, got: &str) -> Result<(), String> {
        let Some(installed @ Source::Github { .. }) = self.github_source(&applet_id) else { return Ok(()) };
        let Source::Github { repository_id, full_name, path, branch, bundle_sha256, .. } = &installed else { return Ok(()) };
        let Ok(record) = imports::parse_release(got) else { return self.found(applet_id, None) };
        if record.applet_id != applet_id {
            return self.found(applet_id, None);
        }
        if record.bundle.sha256 == *bundle_sha256 {
            let mut moved = installed.clone();
            if let Source::Github { commit: c, .. } = &mut moved {
                *c = commit;
            }
            self.applets.set_source(&applet_id, moved)?;
            return self.found(applet_id, None);
        }
        let branch = branch.clone().unwrap_or_default();
        let candidate = branch_candidate((*repository_id, full_name), &branch, &commit, path, record);
        match candidate.compatible {
            true => self.offer(applet_id, Some(candidate), false, None),
            false => {
                let incompatible = needs_newer_genesis(&candidate.record).then_some(candidate.record.version);
                self.offer(applet_id, None, false, incompatible)
            }
        }
    }

    /// Records an update, or for a badge tap downloads it for review. Without a candidate, a
    /// withdrawn release or a newer one that needs a newer Genesis is still recorded.
    fn offer(&mut self, applet_id: String, candidate: Option<Candidate>, withdrawn: bool, incompatible: Option<String>) -> Result<(), String> {
        let Some(candidate) = candidate else {
            let update = AppletUpdate { withdrawn, incompatible, ..AppletUpdate::default() };
            return self.found(applet_id, (update.withdrawn || update.incompatible.is_some()).then_some(update));
        };
        if self.badge_tap(&applet_id) {
            return self.download(candidate, false);
        }
        let record = &candidate.record;
        let (new_origins, new_services, gains_storage) = gains(self.applets.entry(&applet_id).as_ref(), record);
        let update = AppletUpdate {
            version: Some(record.version.clone()),
            prerelease: prerelease(&record.version),
            withdrawn,
            new_origins,
            new_services,
            gains_storage,
            incompatible,
        };
        self.found(applet_id, Some(update))
    }

    fn finish_check(&mut self) {
        let Some(flow) = self.flow.as_ref() else { return };
        let (kind, found, flow_failed) = (flow.kind.clone(), flow.found.clone(), flow.failed.clone());
        for (id, update) in found.iter().filter(|(id, _)| self.applets.source(id).is_some()) {
            match update {
                Some(update) => self.updates.applets.insert(id.clone(), update.clone()),
                None => self.updates.applets.remove(id),
            };
        }
        let Kind::Check { manual, only } = kind else { return };
        if manual && only.is_none() {
            self.updates.checked_at = now_ms();
        }
        self.save_updates();
        self.end_flow();
        if manual {
            let count = found.values().filter(|u| u.as_ref().is_some_and(|u| u.version.is_some())).count();
            let withdrawn = found.values().any(|u| u.as_ref().is_some_and(|u| u.withdrawn));
            let failed = flow_failed;
            let mut message = match (only.as_deref(), count) {
                (Some(_), _) if !failed.is_empty() => format!("Genesis could not check this applet: {}", failed.values().next().map_or("", String::as_str)),
                (Some(_), _) => "This applet is up to date.".to_string(),
                (None, 0) if !failed.is_empty() => "No updates were found.".to_string(),
                (None, 0) => "All applets are up to date.".to_string(),
                (None, 1) => "1 update is available.".to_string(),
                (None, n) => format!("{n} updates are available."),
            };
            if withdrawn {
                message.push_str(" The publisher withdrew an installed release.");
            }
            if found.values().any(|u| u.as_ref().is_some_and(|u| u.version.is_none() && u.incompatible.is_some())) {
                message.push_str(" A newer version needs a newer Genesis.");
            }
            match (only.is_none(), failed.len()) {
                (false, _) | (_, 0) => {}
                (true, 1) => message.push_str(" 1 applet could not be checked."),
                (true, n) => message.push_str(&format!(" {n} applets could not be checked.")),
            }
            self.out.push(ShellCommand::ShowInfo { applet_id: None, title: "Updates".into(), message });
        }
        self.refresh_launcher();
    }
}

pub fn erasing_message(applet_id: &str) -> String {
    format!("The data of {applet_id} is being erased; try again in a moment")
}
