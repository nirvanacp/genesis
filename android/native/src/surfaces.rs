//! Surface state of the active applet: reveal, website sheet, Back slot and source visits.
use serde_json::Value;
use std::collections::BTreeMap;

pub struct BackSlot {
    pub document_id: String,
    pub deadline_ms: u64,
}

pub struct Session {
    pub applet_id: String,
    pub revision: u64,
    /// The foreground view is visible; set by `ui.ready`.
    pub revealed: bool,
    /// Current URL of the website sheet, when open.
    pub website: Option<String>,
    pub back: Option<BackSlot>,
    /// The URL the host last asked each source to load.
    pub source_urls: BTreeMap<String, String>,
    /// Latest `snapshot` event data per source.
    pub snapshots: BTreeMap<String, Value>,
    /// Sources that started a load and have not yet published anything but `loading`, with their deadline.
    pub ready_deadlines: BTreeMap<String, u64>,
    /// The applet was recreated after being retired in the background.
    pub restored: bool,
    /// The foreground's last `navigation.save`; on a restored session, the stack handed back in `bound`.
    pub navigation: Option<Value>,
}

impl Session {
    pub fn new(applet_id: String, revision: u64, restored: bool) -> Self {
        Self {
            applet_id,
            revision,
            revealed: false,
            website: None,
            back: None,
            source_urls: BTreeMap::new(),
            snapshots: BTreeMap::new(),
            ready_deadlines: BTreeMap::new(),
            restored,
            navigation: None,
        }
    }
}

/// Process-level surface state.
#[derive(Default)]
pub struct Surfaces {
    pub session: Option<Session>,
    pub suspended_at_ms: Option<u64>,
    /// Applet retired in the background, reopened on resume, with its saved navigation.
    pub resume_applet: Option<String>,
    pub resume_navigation: Option<Value>,
}
