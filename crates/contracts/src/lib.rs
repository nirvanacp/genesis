//! Shared package, host, and document qualification contracts. Shared host, managed runtime/navigation and generic storage contracts.
use serde::{Deserialize, Serialize};

pub const IMPLEMENTATION_STAGE: &str = "MVP-07";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PackageIndex {
    pub schema_version: u32,
    pub implementation_stage: String,
    pub packages: Vec<Package>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Package {
    pub manifest: Manifest,
    pub revision: String,
    pub assets: Vec<Asset>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub path: String,
    pub sha256: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    #[serde(default)]
    pub shell: Option<AppShell>,
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub data_schema_version: u32,
    pub sources: Vec<Source>,
    pub pages: Vec<Page>,
    pub actions: Vec<Action>,
    pub capabilities: Vec<String>,
    #[serde(default)]
    pub services: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    #[serde(default)]
    pub customized_paths: Option<Vec<String>>,
    pub id: String,
    pub start_url: String,
    pub origins: Vec<String>,
    pub entry: String,
    #[serde(default)]
    pub home_paths: Vec<String>,
    #[serde(default)]
    pub navigation_rules: Vec<NavigationRule>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NavigationRule {
    pub id: String,
    pub path_prefix: String,
    pub action: String,
    pub fallback_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub id: String,
    pub entry: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Action {
    pub id: String,
    pub label: String,
    pub page_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppShell {
    pub title: String,
    pub brand_asset: String,
    pub sections: Vec<ShellSection>,
    #[serde(default)]
    pub choices: Vec<ShellChoice>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellSection {
    pub id: String,
    pub label: String,
    pub source_id: String,
    pub page_id: Option<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShellChoice {
    pub label: String,
    pub url: String,
}

// Host-issued identities never come from a website's claimed applet ID.
macro_rules! identity {
    ($($name:ident),+ $(,)?) => { $(
        #[derive(Clone, Debug, Default, PartialEq, Eq, Hash, Deserialize, Serialize)]
        #[serde(transparent)]
        pub struct $name(pub String);
    )+ };
}
identity!(
    AppletId,
    InstanceId,
    SourceId,
    ViewId,
    DocumentId,
    DocumentNonce,
    RequestId
);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct ViewGeneration(pub u64);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(transparent)]
pub struct RouteRevision(pub u64);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ContextKind {
    Source {
        #[serde(rename = "sourceId")]
        source_id: SourceId,
    },
    Page {
        #[serde(rename = "pageId")]
        page_id: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionContext {
    pub instance_id: InstanceId,
    pub applet_id: AppletId,
    pub view_id: ViewId,
    pub generation: ViewGeneration,
    pub binding: ContextKind,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    #[serde(default)]
    pub opener: Option<Selection>,
    #[serde(default)]
    pub current_url: Option<String>,
    pub selection: Option<Selection>,
    pub source_urls: std::collections::HashMap<String, String>,
    pub disabled: Vec<AppletId>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub applet_id: AppletId,
    pub source_id: SourceId,
    pub page_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HostEvent {
    Attach {
        index: PackageIndex,
        #[serde(default)]
        debug: bool,
        restore: Option<SessionSnapshot>,
    },
    Open {
        #[serde(default)]
        url: Option<String>,
        #[serde(rename = "appletId")]
        applet_id: String,
        #[serde(rename = "sourceId")]
        source_id: String,
        #[serde(default, rename = "pageId")]
        page_id: Option<String>,
    },
    OpenPage {
        #[serde(rename = "pageId")]
        page_id: String,
    },
    ActivateDestination {
        generation: u64,
        #[serde(rename = "documentId")]
        document_id: DocumentId,
        selection: Selection,
        url: Option<String>,
    },
    ModalDeadline {
        generation: u64,
        #[serde(rename = "documentId")]
        document_id: DocumentId,
        token: u64,
    },
    ClassifyUrl {
        url: String,
    },
    Home,
    Back {
        #[serde(rename = "canGoBack")]
        can_go_back: bool,
    },
    Forward,
    Reload,
    Retry,
    Ordinary,
    Inspect,
    Qualify,
    DebugFailure,
    DebugTerminate,
    StorageCompleted {
        completion: StorageCompletion,
    },
    ConfigureServices,
    ServiceCompleted {
        completion: ServiceCompletion,
    },
    SaveSession,
    Suspended,
    Resumed,
    FullscreenRequested {
        generation: u64,
    },
    FullscreenClosed {
        generation: u64,
    },
    Capabilities {
        generation: u64,
        supported: bool,
        details: String,
    },
    NavigationStarted {
        generation: u64,
        url: String,
        #[serde(rename = "sameDocument")]
        same_document: bool,
    },
    Navigated {
        generation: u64,
        url: String,
    },
    PageMessage {
        generation: u64,
        channel: u64,
        origin: String,
        #[serde(rename = "mainFrame")]
        main_frame: bool,
        message: String,
    },
    Deadline {
        generation: u64,
        epoch: u64,
    },
    LoadFailed {
        generation: u64,
        message: String,
    },
    SiteFailed {
        generation: u64,
        message: String,
    },
    RendererGone {
        generation: u64,
    },
    RendererUnresponsive {
        generation: u64,
    },
    Detach,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HostCommand {
    ModalState {
        open: bool,
    },
    ClassifiedUrl {
        kind: String,
    },
    ShowLauncher {
        entries: Vec<LauncherEntry>,
        status: String,
    },
    CreateView {
        #[serde(rename = "ownerSelection")]
        owner_selection: Option<Selection>,
        generation: u64,
        package: Box<Package>,
        context: ExecutionContext,
        origins: Vec<String>,
        entry: String,
        customized: bool,
        #[serde(rename = "localAssets")]
        local_assets: Vec<LocalAsset>,
    },
    ParkView {
        generation: u64,
    },
    ResumeView {
        generation: u64,
    },
    DestroyView {
        generation: u64,
    },
    LoadUrl {
        generation: u64,
        url: String,
    },
    GoBack {
        generation: u64,
    },
    GoForward {
        generation: u64,
    },
    Reload {
        generation: u64,
    },
    Presentation {
        generation: u64,
        epoch: u64,
        document_id: Option<DocumentId>,
        route_kind: String,
        detail: bool,
        state: String,
        message: String,
        actions: Vec<Action>,
    },
    Challenge {
        generation: u64,
        channel: u64,
        nonce: DocumentNonce,
        challenge: String,
    },
    ReplyToPage {
        generation: u64,
        channel: u64,
        message: serde_json::Value,
    },
    ScheduleDeadline {
        generation: u64,
        epoch: u64,
    },
    DeferNavigation {
        generation: u64,
        #[serde(rename = "documentId")]
        document_id: DocumentId,
        selection: Selection,
        url: Option<String>,
    },
    ScheduleModalDeadline {
        generation: u64,
        #[serde(rename = "documentId")]
        document_id: DocumentId,
        token: u64,
    },
    TerminateRenderer {
        generation: u64,
    },
    ShowFullscreen {
        generation: u64,
    },
    ExitFullscreen {
        generation: u64,
    },
    StorageJob {
        job: StorageJob,
    },
    ServiceRequest {
        job: ServiceJob,
    },
    ConfigureServices {
        generation: u64,
        #[serde(rename = "appletId")]
        applet_id: String,
        services: Vec<String>,
    },
    Diagnostics {
        text: String,
    },
    RetainSession {
        snapshot: SessionSnapshot,
    },
    ShowError {
        message: String,
    },
    FinishActivity,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAsset {
    pub url_path: String,
    pub asset_path: String,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub applet_id: String,
    pub source_id: String,
    pub page_id: Option<String>,
    pub label: String,
}

// Generic storage operations carry no website-specific fields. Namespace is host-issued.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "method", content = "params")]
pub enum StorageOperation {
    #[serde(rename = "storage.get")]
    Get(StorageKey),
    #[serde(rename = "storage.list")]
    List(StorageList),
    #[serde(rename = "storage.commit")]
    Commit(StorageBatch),
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageKey {
    pub collection: String,
    pub key: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageList {
    pub collection: String,
    pub after_key: Option<String>,
    pub limit: usize,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageCheck {
    pub collection: String,
    pub key: String,
    pub expected_revision: Option<u64>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoragePut {
    pub collection: String,
    pub key: String,
    pub value: serde_json::Value,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StorageBatch {
    pub checks: Vec<StorageCheck>,
    pub puts: Vec<StoragePut>,
    pub deletes: Vec<StorageKey>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageJob {
    pub generation: u64,
    pub document_id: DocumentId,
    pub channel: u64,
    pub request_id: String,
    pub applet_id: String,
    pub data_schema_version: u32,
    pub operation: StorageOperation,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageCompletion {
    pub generation: u64,
    pub document_id: DocumentId,
    pub channel: u64,
    pub request_id: String,
    pub applet_id: String,
    pub response: serde_json::Value,
    pub changed: Vec<StorageKey>,
}

// Opaque service bodies belong to the applet. The host only validates transport.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceJob {
    pub generation: u64,
    pub document_id: DocumentId,
    pub channel: u64,
    pub request_id: String,
    pub applet_id: String,
    pub service_id: String,
    pub path: String,
    pub method: String,
    pub body: Option<serde_json::Value>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceCompletion {
    pub generation: u64,
    pub document_id: DocumentId,
    pub channel: u64,
    pub response: serde_json::Value,
}
