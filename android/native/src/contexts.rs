//! State of the active applet's contexts: navigation, reveal, page calls and the Back slot.
use serde_json::{Value, json};
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

/// A page operation the foreground asked a context document to run (`page.call`). The foreground's
/// request stays open until the context answers with `page.result` or the host fails the call.
pub struct CallHandle {
    pub foreground_document: String,
    pub request_id: u64,
    pub context_id: String,
    pub context_document: String,
    /// The context reported `dispatched`: input left the page agent.
    pub dispatched: bool,
    /// The context reported `navigating`: the input started a navigation.
    pub navigating: bool,
    pub completed_steps: Option<u64>,
    pub deadline_ms: u64,
}

impl CallHandle {
    /// The `details` of an error that ends this call early.
    pub fn details(&self) -> Value {
        let mut details = json!({ "dispatched": self.dispatched, "navigating": self.navigating });
        if let Some(steps) = self.completed_steps {
            details["completedSteps"] = json!(steps);
        }
        details
    }
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
    /// Open page calls by call id.
    pub calls: HashMap<String, CallHandle>,
    next_call: u64,
    /// The applet was recreated after being retired in the background.
    pub restored: bool,
    /// The foreground's last `session.save` (`{version, state}`), handed back in `bound` when restored.
    pub saved: Option<Value>,
    /// The context an opened link loaded in; the foreground shows it once it binds.
    pub open_context: Option<String>,
    /// The applet opened a link another app shared; the Back that leaves it returns there.
    pub return_to_caller: bool,
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
            calls: HashMap::new(),
            next_call: 0,
            restored,
            saved: None,
            open_context: None,
            return_to_caller: false,
        }
    }

    pub fn begin_call(&mut self, handle: CallHandle) -> String {
        self.next_call += 1;
        let call_id = format!("c{}", self.next_call);
        self.calls.insert(call_id.clone(), handle);
        call_id
    }

    /// Removes and returns the calls matching `predicate`.
    pub fn take_calls(&mut self, predicate: impl Fn(&CallHandle) -> bool) -> Vec<(String, CallHandle)> {
        let ids: Vec<String> = self.calls.iter().filter(|(_, c)| predicate(c)).map(|(id, _)| id.clone()).collect();
        ids.into_iter().filter_map(|id| self.calls.remove(&id).map(|c| (id, c))).collect()
    }
}

/// An applet the host retired without the user leaving it, to recreate where it was.
pub struct Resume {
    pub applet_id: String,
    /// Each context's last committed URL. Recreation loads them, never replaying a POST.
    pub urls: BTreeMap<String, String>,
    pub saved: Option<Value>,
    /// Recreated on the next resume (background retirement), or only when the user reopens it
    /// (renderer loss).
    pub on_resume: bool,
    /// The applet opened a link another app shared, so its leaving Back still returns there.
    pub return_to_caller: bool,
}

/// Process-level state.
#[derive(Default)]
pub struct Contexts {
    pub session: Option<Session>,
    pub suspended_at_ms: Option<u64>,
    pub resume: Option<Resume>,
}
