//! State of the active applet's contexts: navigation, reveal, actions and the Back slot.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

pub struct BackSlot {
    pub document_id: String,
    pub deadline_ms: u64,
}

/// One context WebView, as the shell last reported it.
pub struct ContextView {
    /// The last committed URL (`ContextNavigated`), or the start URL before the first commit.
    pub url: String,
    pub index: i32,
    pub size: i32,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    /// Set by `DocumentStarted` and cleared when that document says hello: a document committed
    /// and has not bound yet.
    pub navigating_since: Option<u64>,
}

/// An action the foreground asked a context document to perform.
pub struct ActionHandle {
    pub foreground_document: String,
    pub context_id: String,
    pub context_document: String,
    /// The context reported `dispatched`: the action left the host's hands.
    pub dispatched: bool,
    /// The context handed a navigating action to the foreground, which observes its outcome. The handle
    /// stays only so a step that fails after the handoff can still report it.
    pub navigating: bool,
    pub deadline_ms: u64,
}

pub struct Session {
    pub applet_id: String,
    pub revision: u64,
    /// The foreground view is visible; set by `ui.ready`.
    pub foreground_shown: bool,
    /// The context whose WebView is revealed above the foreground.
    pub revealed: Option<String>,
    pub back: Option<BackSlot>,
    /// The context a Back stepped back in, until it moves or the shell reports it did not.
    pub back_history: Option<String>,
    pub contexts: BTreeMap<String, ContextView>,
    pub actions: HashMap<u64, ActionHandle>,
    next_action: u64,
    /// The applet was recreated after being retired in the background.
    pub restored: bool,
    /// The foreground's last `session.save` (`{version, state}`), handed back in `bound` when restored.
    pub saved: Option<Value>,
    /// The context an opened link loaded in; the foreground shows it once it binds.
    pub open_context: Option<String>,
}

impl Session {
    pub fn new(applet_id: String, revision: u64, restored: bool) -> Self {
        Self {
            applet_id,
            revision,
            foreground_shown: false,
            revealed: None,
            back: None,
            back_history: None,
            contexts: BTreeMap::new(),
            actions: HashMap::new(),
            next_action: 0,
            restored,
            saved: None,
            open_context: None,
        }
    }

    pub fn begin_action(&mut self, handle: ActionHandle) -> u64 {
        self.next_action += 1;
        self.actions.insert(self.next_action, handle);
        self.next_action
    }

    /// Removes and returns the actions matching `predicate`.
    pub fn take_actions(&mut self, predicate: impl Fn(&ActionHandle) -> bool) -> Vec<(u64, ActionHandle)> {
        let ids: Vec<u64> = self.actions.iter().filter(|(_, a)| predicate(a)).map(|(id, _)| *id).collect();
        ids.into_iter().filter_map(|id| self.actions.remove(&id).map(|a| (id, a))).collect()
    }
}

/// Where an applet was when the host retired it without the user closing its window: its
/// window recreates it there when it resumes. Saved as `applets/<id>/resume.json`, so a Recents
/// card restores the applet after the process ended.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Resume {
    /// Each context's last committed URL. Recreation loads them, never replaying a POST.
    pub urls: BTreeMap<String, String>,
    pub saved: Option<Value>,
}

/// Process-level state.
#[derive(Default)]
pub struct Contexts {
    pub session: Option<Session>,
    pub suspended_at_ms: Option<u64>,
    /// Resume targets of retired applets, by applet id.
    pub resumes: HashMap<String, Resume>,
    /// The `(context, url)` a starting applet window opens with, by applet id; None opens the
    /// applet where it was.
    pub pending_open: HashMap<String, Option<(String, String)>>,
    /// The applet window that is resumed, if any.
    pub resumed_window: Option<String>,
}
