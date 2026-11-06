//! Types shared by the Android shell, the Rust host and applet documents.
//!
//! JSON names are camelCase so they match `@genesis/core` and `@genesis/sdk`.
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MANIFEST_SCHEMA_VERSION: u32 = 5;
pub const BUNDLE_FORMAT: u32 = 2;
pub const MAX_SOURCES: usize = 3;
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

/// Serialized as `"foreground"`, `"source:<id>"` or `"website"`, the same text documentIds use.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(try_from = "String", into = "String")]
pub enum Role {
    Foreground,
    Source(String),
    Website,
}

impl From<Role> for String {
    fn from(role: Role) -> String {
        match role {
            Role::Foreground => "foreground".into(),
            Role::Source(id) => format!("source:{id}"),
            Role::Website => "website".into(),
        }
    }
}

impl TryFrom<String> for Role {
    type Error = String;
    fn try_from(value: String) -> Result<Self, String> {
        match value.as_str() {
            "foreground" => Ok(Role::Foreground),
            "website" => Ok(Role::Website),
            _ => match value.strip_prefix("source:") {
                Some(id) if !id.is_empty() => Ok(Role::Source(id.into())),
                _ => Err(format!("unknown view role {value}")),
            },
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Shell events and commands

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ShellEvent {
    /// First event after process start. `files_dir` is the app's private files directory.
    Attach { files_dir: String },
    Resumed,
    Suspended,
    /// Android Back. `website_can_go_back` reports the website sheet's own history.
    Back {
        #[serde(default)]
        website_can_go_back: bool,
    },
    /// The website sheet's Return button.
    WebsiteReturn,
    OpenApplet { applet_id: String },
    Home,
    Menu { action: MenuAction },
    /// A main-frame load started in a view.
    DocumentLoaded { view: ViewRef, url: String },
    /// A string a document posted on `__genesisBridge`, forwarded unparsed.
    DocumentMessage { view: ViewRef, payload: String },
    WebsiteUrlChanged { url: String },
    ImportFound { kind: ImportKind, path: String, payload: String },
    ServiceResponse { request_id: u64, status: u16, body: Value },
    ServiceFailed { request_id: u64, code: ErrorCode, message: String },
    /// A storage worker result, relayed by the shell to the UI thread.
    StorageCompleted { payload: String },
    Tick,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MenuAction {
    Home,
    Reload,
    OpenWebsite,
    Info,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ImportKind {
    Bundle,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ShellCommand {
    ShowLauncher { applets: Vec<LauncherEntry> },
    /// Shows the applet container with the splash until `RevealForeground`.
    ShowApplet { applet_id: String, name: String, accent: Option<String> },
    CreateView { view: ViewRef, url: String, origins: Vec<String>, start_script: Option<String> },
    DestroyView { view: ViewRef },
    LoadUrl { view: ViewRef, url: String },
    RevealForeground,
    /// Opens the website sheet. Top-level navigations to origins outside `origins` go to the Android browser.
    ShowWebsite { url: String, title: String, origins: Vec<String> },
    HideWebsite,
    WebsiteBack,
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
    OpenExternal { url: String },
    /// Asks the shell to send `Tick` after `delay_ms`, for deadlines shorter than the periodic tick.
    Wake { delay_ms: u64 },
    MoveTaskToBack,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub applet_id: String,
    pub name: String,
    pub accent: Option<String>,
}

// ---------------------------------------------------------------------------------------------
// Manifest (schema 5) and bundle (format 2)

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub origins: Vec<String>,
    pub foreground: Foreground,
    pub sources: Vec<Source>,
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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub id: String,
    pub start_url: String,
    pub adapter: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum Route {
    Adapted {
        id: String,
        pattern: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        query: Option<Vec<String>>,
        source: String,
        screen: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        requires_sign_in: Option<bool>,
    },
    Website {
        id: String,
        pattern: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        query: Option<Vec<String>>,
    },
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

/// `dist/bundle.json`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bundle {
    pub format: u32,
    pub manifest: Manifest,
    pub files: Vec<BundleFile>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleFile {
    pub path: String,
    pub sha256: String,
}

/// `applet-<id>.bundle.json`, the transport form of a bundle.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BundleImport {
    pub bundle: Bundle,
    pub entries: Vec<BundleEntry>,
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
// Limits and errors

/// Sent to every document in `bound`.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Limits {
    pub rpc_deadline_ms: u64,
    pub message_max_bytes: usize,
    pub snapshot_max_bytes: usize,
    pub stored_document_max_bytes: usize,
    pub pending_requests_max: usize,
    pub document_ready_ms: u64,
    pub publish_throttle_ms: u64,
    pub intent_timeout_ms: u64,
    pub back_answer_ms: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            rpc_deadline_ms: 15_000,
            message_max_bytes: 262_144,
            snapshot_max_bytes: 196_608,
            stored_document_max_bytes: 32_768,
            pending_requests_max: 32,
            document_ready_ms: 15_000,
            publish_throttle_ms: 250,
            intent_timeout_ms: 15_000,
            back_answer_ms: 300,
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
    SnapshotTooLarge,
    MessageTooLarge,
    Deadline,
    SourceReplaced,
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
// Document protocol

/// Document to host.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum DocumentMessage {
    Hello { url: String },
    Request {
        #[serde(default)]
        document_id: Option<String>,
        request_id: u64,
        method: String,
        #[serde(default)]
        params: Value,
    },
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
    #[serde(rename = "website.open")]
    WebsiteOpen { url: String },
    #[serde(rename = "website.close")]
    WebsiteClose {},
    #[serde(rename = "source.navigate")]
    SourceNavigate { source_id: String, url: String },
    #[serde(rename = "source.intent")]
    SourceIntent { source_id: String, intent: Value },
    #[serde(rename = "source.publish")]
    SourcePublish { snapshot: Value },
    #[serde(rename = "source.intentResult")]
    SourceIntentResult {
        intent_id: u64,
        ok: bool,
        #[serde(default)]
        error: Option<Value>,
    },
    #[serde(rename = "back.handled")]
    BackHandled { handled: bool },
    /// Leaves the applet after a Back the foreground handled by asking first, once the user confirms.
    #[serde(rename = "back.leave")]
    BackLeave {},
}

/// Host to document. Every message names the document it is for; a document ignores others.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum HostMessage {
    Bound {
        document_id: String,
        applet_id: String,
        role: String,
        source_id: Option<String>,
        revision: u64,
        manifest: Box<Manifest>,
        limits: Limits,
        state: Value,
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
