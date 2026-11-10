//! Types shared by the Android shell, the Rust host and applet documents.
//!
//! JSON names are camelCase so they match `@genesis/core` and `@genesis/sdk`.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

// ---------------------------------------------------------------------------------------------
// Versions

/// The version of every serialized boundary, the same values as `COMPAT` in `@genesis/core`.
/// Only the developer changes them; `tools/check-packages.mjs` compares the two tables.
pub mod compat {
    pub const MANIFEST_SCHEMA: u32 = 6;
    pub const BUNDLE_FORMAT: u32 = 3;
    pub const PROTOCOL: u32 = 1;
    pub const ADAPTER_API: u32 = 1;
    pub const SESSION_STATE: u32 = 1;
    pub const IMPORT_ENVELOPE: u32 = 1;
    pub const CREDENTIAL_ENVELOPE: u32 = 1;
    pub const PACKAGES_INDEX: u32 = 1;
}

/// The host's version table, sent to every document in `bound`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCompat {
    pub manifest_schema: u32,
    pub bundle_format: u32,
    pub protocol: u32,
    pub adapter_api: u32,
    pub session_state: u32,
    pub import_envelope: u32,
    pub credential_envelope: u32,
    pub packages_index: u32,
}

impl Default for HostCompat {
    fn default() -> Self {
        Self {
            manifest_schema: compat::MANIFEST_SCHEMA,
            bundle_format: compat::BUNDLE_FORMAT,
            protocol: compat::PROTOCOL,
            adapter_api: compat::ADAPTER_API,
            session_state: compat::SESSION_STATE,
            import_envelope: compat::IMPORT_ENVELOPE,
            credential_envelope: compat::CREDENTIAL_ENVELOPE,
            packages_index: compat::PACKAGES_INDEX,
        }
    }
}

pub const MAX_CONTEXTS: usize = 3;
/// The largest import file the shell reads and the host accepts.
pub const IMPORT_MAX_BYTES: usize = 64 * 1024 * 1024;
/// Origin that serves foreground documents through `WebViewAssetLoader`.
pub const FOREGROUND_ORIGIN: &str = "https://appassets.androidplatform.net";

// ---------------------------------------------------------------------------------------------
// Views

/// Which WebView of an applet a message or command concerns.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewRef {
    pub applet_id: String,
    pub role: Role,
}

/// Serialized as `"foreground"` or `"context:<id>"`, the same text documentIds use.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub enum Role {
    Foreground,
    Context(String),
}

impl From<Role> for String {
    fn from(role: Role) -> String {
        match role {
            Role::Foreground => "foreground".into(),
            Role::Context(id) => format!("context:{id}"),
        }
    }
}

impl TryFrom<String> for Role {
    type Error = String;
    fn try_from(value: String) -> Result<Self, String> {
        if value == "foreground" {
            return Ok(Role::Foreground);
        }
        match value.strip_prefix("context:") {
            Some(id) if !id.is_empty() => Ok(Role::Context(id.into())),
            _ => Err(format!("unknown view role {value}")),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Shell events and commands

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ShellEvent {
    /// First event after process start. `files_dir` is the app's private files directory;
    /// `debuggable` is true on a debug build, the only build that accepts development imports.
    Attach {
        files_dir: String,
        #[serde(default)]
        debuggable: bool,
    },
    Resumed,
    Suspended,
    /// Android Back. The WebViews never handle Back themselves.
    Back,
    /// The website bar's Done button over a revealed context.
    WebsiteDone,
    OpenApplet { applet_id: String },
    Home,
    Menu { action: MenuAction },
    /// `onPageStarted`: a new document committed in a view, with its post-redirect URL.
    DocumentStarted { view: ViewRef, url: String },
    /// A string a document posted on `__genesisBridge`, forwarded unparsed.
    DocumentMessage { view: ViewRef, payload: String },
    /// `doUpdateVisitedHistory`, with the back-forward list's current item, index and size.
    /// `can_go_back` is `index > 0` and `can_go_forward` is `index < size - 1`.
    ContextNavigated {
        view: ViewRef,
        url: String,
        index: i32,
        size: i32,
        can_go_back: bool,
        can_go_forward: bool,
        same_document: bool,
        reload: bool,
    },
    /// `onRenderProcessGone`. Every view shares one renderer, so the shell reports each.
    RendererGone { view: ViewRef },
    /// A `HistoryGo` that moved nothing: `history.go` did not start a navigation and the
    /// WebView's own list had no entry at that offset.
    HistoryUnmoved { view: ViewRef },
    /// An import file. `release` is the text of a bundled applet's release record, when the APK has one.
    ImportFound {
        kind: ImportKind,
        path: String,
        payload: String,
        #[serde(default)]
        release: Option<String>,
    },
    ServiceResponse { request_id: u64, status: u16, body: Value },
    ServiceFailed { request_id: u64, code: ErrorCode, message: String },
    /// A storage worker result, relayed by the shell to the UI thread.
    StorageCompleted { payload: String },
    Tick,
    /// The answer to `Fetch`. `status` is 0 when no response arrived and `error` says why. `body` is
    /// the UTF-8 body for an in-memory fetch, `path` the written file for `to_file`. `rate_remaining`
    /// and `rate_reset` (epoch seconds) are GitHub's rate limit headers.
    FetchCompleted {
        request_id: String,
        status: u16,
        error: Option<String>,
        etag: Option<String>,
        final_url: Option<String>,
        rate_remaining: Option<u32>,
        rate_reset: Option<u64>,
        body: Option<String>,
        path: Option<String>,
    },
    /// Add applet: a repository as `owner/name` or a GitHub URL.
    AddFromRepository { input: String },
    /// Add from file: a copied bundle file, with a copied release record when the user picked one.
    ReviewFile { path: String, release: Option<String> },
    /// A choice on the repository screen. `version` None is the newest compatible stable version.
    ChooseCandidate { applet_id: String, version: Option<String> },
    /// The user's answer to `ShowImportReview`. `replace` is required to accept a replacement.
    ReviewDecision { review_id: String, accept: bool, replace: Option<ReplaceMode> },
    /// Checks GitHub-sourced applets for updates: one applet, or all. `manual` is false for the
    /// launcher's automatic check, which the host runs at most every six hours.
    CheckUpdates { applet_id: Option<String>, manual: bool },
    /// Ends the running add, review or update flow, from a dismissed screen.
    CancelFlow,
    RemoveApplet { applet_id: String },
    /// Erases the applet's stored data; the applet and its service connections stay.
    ClearData { applet_id: String },
    /// Keeps the installed release the publisher withdrew; later checks stop flagging that tag.
    KeepVersion { applet_id: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MenuAction {
    Home,
    Reload,
    ViewWebsite,
    Info,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportKind {
    /// A development import from `genesis-applet dev install`.
    Bundle,
    /// An applet bundled into the APK, staged by the shell.
    Bundled,
}

/// `push` adds a history entry; `replace` replaces the current one.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NavigateMode {
    #[default]
    Push,
    Replace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StatusKind {
    /// The applet was built for another Genesis; it is listed and cannot be launched.
    Incompatible,
    /// The shared renderer stopped; the applet was retired.
    RendererLost,
    /// An import file was installed or recorded.
    ImportReceived,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ShellCommand {
    /// `updates_checked_at` is when the last update check of every applet ran, in ms since the
    /// epoch; 0 when none has.
    ShowLauncher {
        applets: Vec<LauncherEntry>,
        #[serde(default)]
        updates_checked_at: u64,
    },
    /// Shows the applet container with the splash until `RevealForeground`.
    ShowApplet { applet_id: String, name: String, accent: Option<String> },
    CreateView { view: ViewRef, url: String, origins: Vec<String>, start_script: Option<String> },
    DestroyView { view: ViewRef },
    /// `push` is `loadUrl`; `replace` is `location.replace(url)`, with `loadUrl` when the page cannot run script.
    LoadUrl { view: ViewRef, url: String, mode: NavigateMode },
    RevealForeground,
    /// Moves the context's WebView above the foreground and shows the website bar.
    RevealContext { view: ViewRef, title: String },
    /// Moves the revealed context back under the foreground.
    CoverContext,
    /// Page-side `history.go(delta)`, with the native fallback the shell applies.
    HistoryGo { view: ViewRef, delta: i32 },
    Reload { view: ViewRef },
    PostMessage { view: ViewRef, payload: String },
    /// The shell's `ServiceClient` looks up the stored credential for (`applet_id`, `service_id`).
    ServiceRequest {
        request_id: u64,
        applet_id: String,
        service_id: String,
        path: String,
        method: String,
        body: Option<Value>,
    },
    ShowError { message: String },
    ShowInfo { title: String, message: String },
    /// The status sheet: an incompatible applet, a lost renderer or a received import.
    ShowStatus { kind: StatusKind, applet: Option<LauncherEntry>, details: String },
    OpenExternal { url: String },
    /// Asks the shell to send `Tick` after `delay_ms`, for deadlines shorter than the periodic tick.
    Wake { delay_ms: u64 },
    MoveTaskToBack,
    /// An HTTPS GET for the host. The shell follows redirects only to `hosts`, which must also be
    /// in its own `FETCH_HOSTS`. With `to_file`, the body is written to that path (through
    /// `<to_file>.part`) and refused beyond `max_bytes`.
    Fetch {
        request_id: String,
        url: String,
        max_bytes: u64,
        etag: Option<String>,
        to_file: Option<String>,
        hosts: Vec<String>,
    },
    /// A modal progress message for a running applet flow; None hides it. Cancel sends `CancelFlow`.
    ShowProgress { message: Option<String> },
    /// The applets a repository offers.
    ShowRepositoryApplets { repository: String, note: Option<String>, applets: Vec<RepositoryApplet> },
    /// The review before installing. The buttons follow `outcome`. `publisher` is the GitHub owner;
    /// `notes` and `published_at` come from the GitHub release the build was downloaded from.
    /// `previous` is the installed applet with the same id, for comparing.
    ShowImportReview {
        review_id: String,
        applet_id: String,
        name: String,
        version: Option<String>,
        source_label: String,
        origins: Vec<String>,
        capabilities: ReleaseCapabilities,
        outcome: ReviewOutcome,
        warnings: Vec<String>,
        #[serde(default)]
        publisher: Option<String>,
        #[serde(default)]
        bundle_sha256: String,
        #[serde(default)]
        bundle_bytes: u64,
        #[serde(default)]
        notes: Option<String>,
        #[serde(default)]
        published_at: Option<String>,
        #[serde(default)]
        previous: Option<Box<LauncherEntry>>,
    },
    /// A reviewed install finished. `updated` is set when an earlier version was installed.
    ShowInstalled {
        applet_id: String,
        name: String,
        version: Option<String>,
        origins: Vec<String>,
        updated: bool,
    },
    /// The shell deletes the applet's stored service credentials.
    ForgetApplet { applet_id: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppletStatus {
    Current,
    Incompatible,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub applet_id: String,
    pub name: String,
    pub accent: Option<String>,
    pub status: AppletStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<Direction>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mismatches: Vec<Mismatch>,
    /// The installed version, when the source names one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Where the applet came from, for display: a repository, a file, bundled or development.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<SourceKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub update: Option<AppletUpdate>,
    /// The installed manifest's origins; empty for an incompatible applet whose files are unknown.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub origins: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub services: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub storage: bool,
    /// The GitHub owner of a GitHub source.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    /// A GitHub source's `owner/name` and the applet's path in it, `.` for the root.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// When the current revision was installed, in ms since the epoch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bundle_sha256: Option<String>,
}

/// The kind of source an applet was installed from, for the shell's choices.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKind {
    Github,
    File,
    Bundled,
    Dev,
}

/// An update found for a GitHub-sourced applet. `withdrawn` is set when the installed release no
/// longer exists; `version` is then the release offered in its place, if any. `new_origins`,
/// `new_services` and `gains_storage` are what the offered version asks for beyond the installed
/// one. `incompatible` is the newest newer version, when it does not run on this Genesis.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppletUpdate {
    pub version: Option<String>,
    pub prerelease: bool,
    pub withdrawn: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub new_origins: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub new_services: Vec<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub gains_storage: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub incompatible: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Adding, reviewing and updating applets

/// Hosts the shell may fetch from. The shell keeps an equal list in `Fetcher.FETCH_HOSTS`.
pub const FETCH_HOSTS: [&str; 5] = [
    "api.github.com",
    "github.com",
    "raw.githubusercontent.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
];
/// The largest API response or release record the host fetches.
pub const FETCH_API_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Release: GitHub Releases with a release record. Branch: the committed `published/` build on a
/// branch, pinned to its commit.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Channel {
    Release,
    Branch,
}

/// What a replacement does with the replaced applet's stored data.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ReplaceMode {
    Keep,
    Erase,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ReviewOutcome {
    Install,
    Update { from: Option<String> },
    Reinstall,
    Downgrade { from: String },
    /// Another source's applet with the same id is installed; `from_source` describes it.
    Replace { from_source: String },
    Blocked { reason: String },
}

/// An applet on the repository screen.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryApplet {
    pub applet_id: String,
    pub name: String,
    pub path: String,
    pub channel: Channel,
    /// The version Add installs: the newest compatible stable one, or None when there is none.
    pub version: Option<String>,
    /// Every version, newest first. The shell shows prereleases only with "Show prereleases".
    pub versions: Vec<CandidateVersion>,
    /// The installed version, when this applet is installed from this repository.
    pub installed: Option<String>,
    pub note: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateVersion {
    pub version: String,
    pub prerelease: bool,
    pub compatible: bool,
    pub note: Option<String>,
    /// The GitHub release's date (ISO 8601) and the first paragraph of its notes.
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Compatibility

/// `Outdated`: built for an older Genesis. `Newer`: needs a newer Genesis. `Mixed`: both.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Direction {
    Outdated,
    Newer,
    Mixed,
}

/// One version that differs from the host's. `applet` is `"missing"` when the bundle has none.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mismatch {
    pub field: String,
    pub applet: String,
    pub host: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Compatibility {
    Current,
    Incompatible { direction: Direction, mismatches: Vec<Mismatch> },
}

// ---------------------------------------------------------------------------------------------
// Manifest (schema 6) and bundle (format 3)

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub origins: Vec<String>,
    pub foreground: Foreground,
    pub adapter: String,
    pub contexts: Vec<Context>,
    pub routes: Vec<Route>,
    pub capabilities: Capabilities,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell: Option<Shell>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Foreground {
    pub entry: String,
    pub screens: Vec<String>,
}

/// One WebView with its own history. The first context is active at launch.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub id: String,
    pub start_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Route {
    pub id: String,
    pub pattern: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<Vec<String>>,
    pub page: String,
    pub screen: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Capabilities {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub storage: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub services: Option<Vec<ServiceDeclaration>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServiceDeclaration {
    pub id: String,
    pub config: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Shell {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
}

/// The versions a bundle was built against, written by the builder.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleCompat {
    pub manifest_schema: u32,
    pub bundle_format: u32,
    pub protocol: u32,
    pub adapter_api: u32,
    pub sdk: String,
    pub tools: String,
    pub built_at: String,
}

/// `bundle.json` in the revision directory.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub format: u32,
    pub compat: BundleCompat,
    pub manifest: Manifest,
    pub files: Vec<BundleFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleFile {
    pub path: String,
    pub sha256: String,
}

/// `applet-<id>.bundle.json`, the transport form of a bundle. Parsed before any version is
/// read, so it types the bundle only as far as envelope validation and classification need.
/// Files from before the envelope version have no `envelope` field.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportEnvelope {
    #[serde(default)]
    pub envelope: Option<u32>,
    pub bundle: BundleHeader,
    pub entries: Vec<BundleEntry>,
}

/// A bundle of any format: the version fields and the file list.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleHeader {
    pub format: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compat: Option<Map<String, Value>>,
    pub manifest: ManifestHeader,
    pub files: Vec<BundleFile>,
}

/// A manifest of any schema: the fields every schema has, and the rest unparsed.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestHeader {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub rest: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleEntry {
    pub path: String,
    pub encoding: Encoding,
    pub content: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Encoding {
    Utf8,
    Base64,
}

// ---------------------------------------------------------------------------------------------
// Release records

/// The format of the release record, `published/applet-<id>.release.json`. Versioned on its own,
/// outside `compat`.
pub const RELEASE_FORMAT: u32 = 1;

/// Written by `genesis-applet publish` beside the bundle, and uploaded by CI with a `source`
/// block. The same fields as `ReleaseRecord` in `@genesis/core`.
///
/// Unknown fields are ignored, here and in the nested blocks, so a newer `genesis-applet` can add
/// fields without hiding its releases from older phones; `releaseFormat` marks a breaking change.
/// The CLI's `validateReleaseRecord` stays strict.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRecord {
    pub release_format: u32,
    pub applet_id: String,
    pub name: String,
    pub version: String,
    pub bundle: ReleaseBundle,
    /// An exact copy of the bundle's `compat` block, kept unparsed so any format can be evaluated.
    pub compat: Map<String, Value>,
    pub origins: Vec<String>,
    pub capabilities: ReleaseCapabilities,
    pub toolchain: ReleaseToolchain,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home: Option<ReleaseHome>,
    pub built_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<ReleaseSource>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseBundle {
    pub file: String,
    pub sha256: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseCapabilities {
    pub storage: bool,
    pub services: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseToolchain {
    pub genesis_commit: String,
    pub node: String,
    pub tools: String,
    pub sdk: String,
}

/// Where the applet is published, from the git remote. `path` is `.` for a single-applet repository.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseHome {
    pub full_name: String,
    pub path: String,
}

/// Added by CI to the uploaded copy. The host compares it with what it asked GitHub for.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseSource {
    pub repository: ReleaseRepository,
    pub path: String,
    pub commit: String,
    pub tag: String,
    pub workflow_run: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseRepository {
    pub id: u64,
    pub full_name: String,
}

// ---------------------------------------------------------------------------------------------
// Limits and errors

/// Sent to every document in `bound`. The same fields as `Limits` in `@genesis/core`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub rpc_deadline_ms: u64,
    pub message_max_bytes: usize,
    pub page_max_bytes: usize,
    pub patch_max_bytes: usize,
    pub patch_records_max: usize,
    pub stored_document_max_bytes: usize,
    pub pending_requests_max: usize,
    pub document_ready_ms: u64,
    pub navigation_join_ms: u64,
    pub publish_quiet_ms: u64,
    pub publish_max_delay_ms: u64,
    pub action_timeout_ms: u64,
    pub back_answer_ms: u64,
    pub history_entries_max: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            rpc_deadline_ms: 15_000,
            message_max_bytes: 262_144,
            page_max_bytes: 196_608,
            patch_max_bytes: 65_536,
            patch_records_max: 200,
            stored_document_max_bytes: 32_768,
            pending_requests_max: 32,
            document_ready_ms: 15_000,
            navigation_join_ms: 1_000,
            publish_quiet_ms: 150,
            publish_max_delay_ms: 1_000,
            action_timeout_ms: 15_000,
            back_answer_ms: 300,
            history_entries_max: 16,
        }
    }
}

/// The same names as `ERROR_CODES` in `@genesis/core`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    Retired,
    Conflict,
    NotFound,
    DocumentTooLarge,
    StorageFailure,
    OriginNotDeclared,
    MessageTooLarge,
    PageTooLarge,
    PatchTooLarge,
    Deadline,
    InvalidSteps,
    ServiceUnreachable,
    ServiceFailure,
    AuthenticationFailed,
    CertificateFailed,
    ConfigurationRequired,
    NotReady,
    UnknownMethod,
    InvalidArgument,
    QuotaExceeded,
    ProtocolMismatch,
    AppletIncompatible,
    EnvelopeInvalid,
    ContextReplaced,
    TargetNotFound,
    PreconditionFailed,
    AsyncRead,
    AuthRequired,
    Rejected,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
}

impl ErrorBody {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

// ---------------------------------------------------------------------------------------------
// Document protocol (`compat::PROTOCOL`)

/// Document to host.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DocumentMessage {
    /// Documents from before the protocol version send no `protocol`; they read as 0.
    Hello {
        #[serde(default)]
        protocol: u32,
        url: String,
    },
    Request {
        #[serde(default)]
        document_id: Option<String>,
        request_id: u64,
        method: String,
        #[serde(default)]
        params: Value,
    },
}

/// `state` of an action the context reports with `context.actionResult`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionState {
    Dispatched,
    Observed,
    Failed,
    Cancelled,
}

/// A request's method and parameters, decoded from `method` and `params` of `DocumentMessage::Request`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "method", content = "params", rename_all_fields = "camelCase")]
pub enum Call {
    #[serde(rename = "ui.ready")]
    UiReady {},
    #[serde(rename = "storage.get")]
    StorageGet { collection: String, key: String },
    #[serde(rename = "storage.list")]
    StorageList {
        collection: String,
        #[serde(default)]
        after_key: Option<String>,
        #[serde(default)]
        limit: Option<usize>,
    },
    #[serde(rename = "storage.commit")]
    StorageCommit(StorageBatch),
    #[serde(rename = "services.request")]
    ServicesRequest {
        service_id: String,
        path: String,
        method: String,
        #[serde(default)]
        body: Option<Value>,
    },
    #[serde(rename = "context.navigate")]
    ContextNavigate {
        id: String,
        url: String,
        #[serde(default)]
        mode: NavigateMode,
    },
    /// Goes back `steps` entries (1 when absent).
    #[serde(rename = "context.back")]
    ContextBack {
        id: String,
        #[serde(default)]
        steps: Option<u32>,
    },
    #[serde(rename = "context.forward")]
    ContextForward { id: String },
    #[serde(rename = "context.reload")]
    ContextReload { id: String },
    #[serde(rename = "context.reveal")]
    ContextReveal { id: String },
    #[serde(rename = "context.cover")]
    ContextCover {},
    #[serde(rename = "context.resync")]
    ContextResync { id: String },
    /// `action` is `{region, key, name, args}`; the host adds `actionId`.
    #[serde(rename = "context.act")]
    ContextAct { id: String, generation: u64, action: Map<String, Value> },
    #[serde(rename = "context.cancel")]
    ContextCancel { action_id: u64 },
    #[serde(rename = "context.ping")]
    ContextPing { id: String },
    /// The foreground's coordinator state, handed back in `bound.session` after background retirement.
    #[serde(rename = "session.save")]
    SessionSave { version: u32, state: Value },
    #[serde(rename = "back.handled")]
    BackHandled { handled: bool },
    /// Leaves the applet after a Back the foreground handled by asking first, once the user confirms.
    #[serde(rename = "back.leave")]
    BackLeave {},
    /// Exactly one of `page` and `patch`.
    #[serde(rename = "context.publish")]
    ContextPublish {
        #[serde(default)]
        page: Option<Value>,
        #[serde(default)]
        patch: Option<Value>,
    },
    #[serde(rename = "context.actionResult")]
    ContextActionResult {
        action_id: u64,
        state: ActionState,
        #[serde(default)]
        navigating: Option<bool>,
        /// On a navigating `dispatched`: the destination pages the foreground judges by, passed through.
        #[serde(default)]
        expect: Option<Value>,
        #[serde(default)]
        result: Option<Value>,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DocumentRole {
    Foreground,
    Context,
}

/// Host to document. Every message names the document it is for; a document ignores others.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HostMessage {
    Bound {
        protocol: u32,
        compat: HostCompat,
        document_id: String,
        applet_id: String,
        revision: u64,
        context_id: Option<String>,
        role: DocumentRole,
        generation: u64,
        manifest: Box<Manifest>,
        limits: Limits,
        session: Option<Value>,
    },
    Response {
        document_id: String,
        request_id: u64,
        #[serde(skip_serializing_if = "Option::is_none")]
        result: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<ErrorBody>,
    },
    Event { document_id: String, name: String, data: Value },
    /// The answer to a `hello` the host does not bind, such as one with another protocol. The document stops.
    Refused { error: ErrorBody },
}

// ---------------------------------------------------------------------------------------------
// Storage

#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageKey {
    pub collection: String,
    pub key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCheck {
    pub collection: String,
    pub key: String,
    /// `null` requires the document to be absent.
    pub expected_revision: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePut {
    pub collection: String,
    pub key: String,
    pub value: Value,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageBatch {
    #[serde(default)]
    pub checks: Vec<StorageCheck>,
    #[serde(default)]
    pub puts: Vec<StoragePut>,
    #[serde(default)]
    pub deletes: Vec<StorageKey>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageList {
    pub collection: String,
    pub after_key: Option<String>,
    pub limit: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "op", content = "args", rename_all = "camelCase")]
pub enum StorageOperation {
    Get(StorageKey),
    List(StorageList),
    Commit(StorageBatch),
    /// Deletes the applet's documents and namespace. Sent by the host only, never by a document.
    DeleteApplet,
}

/// Host to storage worker.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageJob {
    pub job_id: u64,
    pub applet_id: String,
    pub operation: StorageOperation,
}

/// Storage worker to host, through `ShellEvent::StorageCompleted`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageCompletion {
    pub job_id: u64,
    pub applet_id: String,
    pub result: Option<Value>,
    pub error: Option<ErrorBody>,
    pub changed: Vec<StorageKey>,
}
