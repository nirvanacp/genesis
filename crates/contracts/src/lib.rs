//! MVP-01 host and package contracts. Page RPC is intentionally not implemented.
use serde::{Deserialize, Serialize};

pub const IMPLEMENTATION_STAGE: &str = "MVP-01";

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
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub data_schema_version: u32,
    pub sources: Vec<Source>,
    pub pages: Vec<Page>,
    pub actions: Vec<Action>,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub id: String,
    pub start_url: String,
    pub origins: Vec<String>,
    pub entry: String,
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

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HostEvent {
    Attach {
        index: PackageIndex,
    },
    Open {
        #[serde(rename = "appletId")]
        applet_id: String,
        #[serde(rename = "sourceId")]
        source_id: String,
    },
    Home,
    Back {
        #[serde(rename = "canGoBack")]
        can_go_back: bool,
    },
    Reload,
    Navigated {
        generation: u64,
        url: String,
    },
    LoadFailed {
        generation: u64,
        message: String,
    },
    RendererGone {
        generation: u64,
    },
    Detach,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HostCommand {
    ShowLauncher {
        entries: Vec<LauncherEntry>,
        status: String,
    },
    CreateView {
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
    Reload {
        generation: u64,
    },
    ShowError {
        message: String,
    },
    FinishActivity,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherEntry {
    pub applet_id: String,
    pub source_id: String,
    pub label: String,
}
