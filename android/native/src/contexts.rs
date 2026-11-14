//! State of the live applets' contexts: navigation, reveal, page calls and the Back slot.
use crate::{dialogs::OpenDialog, files::FileHandles};
use serde::{Deserialize, Serialize};
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
    /// Each hidden context's open JavaScript dialog, by context id. Its page calls' deadlines wait.
    pub dialogs: BTreeMap<String, OpenDialog>,
    /// The files the applet picked, and the shell round trips about them.
    pub files: FileHandles,
    next_call: u64,
    /// The applet was recreated after being retired in the background.
    pub restored: bool,
    /// The foreground's last `session.save` (`{version, state}`), handed back in `bound` when restored.
    pub saved: Option<Value>,
    /// The context an opened link loaded in; the foreground shows it once it binds.
    pub open_context: Option<String>,
    /// When the applet's window suspended; None while it is resumed.
    pub suspended_at_ms: Option<u64>,
    /// Each context's input budget, by context id, created on its first input call.
    pub input_budgets: HashMap<String, InputBudget>,
}

/// Page operations that act on the website, so they spend the context's input budget. Reads,
/// watches, waits, scrolling, focus and hover do not.
pub const PACED_OPS: [&str; 11] = ["click", "longPress", "fill", "type", "press", "select", "check", "submit", "attachFiles", "run", "invoke"];

/// A token bucket: `burst` input calls at once, then one more every `refill_ms`.
#[derive(Debug)]
pub struct InputBudget {
    tokens: u32,
    /// When the next token started to come back; moves to `now` while the bucket is full.
    since_ms: u64,
}

impl InputBudget {
    pub fn full(burst: u32, now: u64) -> Self {
        Self { tokens: burst, since_ms: now }
    }

    /// Takes one token, or answers how many milliseconds until one is back.
    pub fn take(&mut self, now: u64, burst: u32, refill_ms: u64) -> Result<(), u64> {
        if refill_ms == 0 {
            return Ok(());
        }
        let gained = now.saturating_sub(self.since_ms) / refill_ms;
        self.tokens = (u64::from(self.tokens) + gained).min(u64::from(burst)) as u32;
        self.since_ms = if self.tokens == burst { now } else { self.since_ms + gained * refill_ms };
        if self.tokens == 0 {
            return Err(refill_ms - now.saturating_sub(self.since_ms));
        }
        self.tokens -= 1;
        Ok(())
    }
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
            dialogs: BTreeMap::new(),
            files: FileHandles::default(),
            next_call: 0,
            restored,
            saved: None,
            open_context: None,
            suspended_at_ms: None,
            input_budgets: HashMap::new(),
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
    /// The live applets, by applet id: at most `LIVE_APPLETS_MAX`.
    pub sessions: BTreeMap<String, Session>,
    /// Resume targets of retired applets, by applet id.
    pub resumes: HashMap<String, Resume>,
    /// The `(context, url)` a starting applet window opens with, by applet id; None opens the
    /// applet where it was.
    pub pending_open: HashMap<String, Option<(String, String)>>,
    /// The applet window that is resumed, if any.
    pub resumed_window: Option<String>,
}
