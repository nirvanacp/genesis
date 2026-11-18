//! State of the live applets' contexts: navigation, reveal, page calls and the Back slot.
use crate::{dialogs::OpenDialog, files::FileHandles};
use genesis_contracts::ActivityLevel;
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
    /// The level last sent to the shell for this context. `None` before its view exists.
    pub level: Option<ActivityLevel>,
    /// The context stays awake until this time: the tail after a load, a call or a cover.
    pub awake_until_ms: u64,
    /// A load the host asked for may still commit until this time; 0 when none is under way.
    pub loading_until_ms: u64,
    /// The tail the context gets once what keeps it busy now ends; 0 while nothing does.
    pub busy_tail_ms: u64,
    /// The foreground's hold, and when an awake hold drops to running.
    pub hold: Option<(ActivityLevel, u64)>,
    /// The `view` of the page's last watch message, for the messages the host sends in its name.
    pub last_view: Option<Value>,
}

impl ContextView {
    /// Whether the shell has this context's view. Contexts start one after another.
    pub fn started(&self) -> bool {
        self.level.is_some()
    }
}

impl ContextView {
    /// A context at `url` whose view does not exist yet.
    pub fn at(url: String) -> Self {
        Self {
            url,
            index: 0,
            size: 0,
            can_go_back: false,
            can_go_forward: false,
            navigating_since: None,
            level: None,
            awake_until_ms: 0,
            loading_until_ms: 0,
            busy_tail_ms: 0,
            hold: None,
            last_view: None,
        }
    }
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
    /// The operation is in `PACED_OPS`, so its trusted input may tap, press keys and type.
    pub paced: bool,
    /// The `page.input` requests this call has made.
    pub inputs: u32,
    /// The operation's name and when the call began (`mono_ms`), for the debug log.
    pub op: String,
    pub started_ms: u64,
    /// Set on a call the host made for a watch subscription: its result goes to no document.
    pub watch: Option<WatchCall>,
}

/// The subscription a host-made watch call belongs to.
#[derive(Clone)]
pub struct WatchCall {
    pub id: String,
    pub serial: u64,
}

/// The foreground's subscription to one watch of a context.
pub struct Subscription {
    pub spec: Value,
    pub when: Option<Value>,
    /// Tells this subscription from an earlier one with the same id.
    pub serial: u64,
    /// The context document the host sent `watch.open` to, until that open fails.
    pub open_in: Option<String>,
    /// The store's fingerprint of `spec`, so a value read with another specification is not served.
    pub fingerprint: u64,
    /// A snapshot from the page reached the foreground, so a kept value would be older.
    pub live: bool,
    /// The store also writes the watch's values to the phone.
    pub persist: bool,
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
    /// When the applet's window suspended, in wall-clock milliseconds (`now_ms`), so time the
    /// phone sleeps counts; None while it is resumed.
    pub suspended_at_ms: Option<u64>,
    /// Each context's input budget, by context id, created on its first input call.
    pub input_budgets: HashMap<String, InputBudget>,
    /// When the next context that has no view yet starts (`mono_ms`); None once all have.
    pub start_next_at_ms: Option<u64>,
    /// The revision's page script, read once when the applet starts; every context view gets it.
    /// An install retires the session, so it never outlives its revision.
    pub page_script: String,
    /// The current foreground's watch subscriptions, by context id and watch id.
    pub subscriptions: BTreeMap<(String, String), Subscription>,
    pub next_subscription: u64,
}

/// Page operations that act on the website, so they spend the context's input budget. Reads,
/// watches, waits, scrolling, focus and hover do not.
pub const PACED_OPS: [&str; 11] = ["click", "longPress", "fill", "type", "press", "select", "check", "submit", "attachFiles", "run", "invoke"];
/// `page.input` requests one page call may make. Each trusted step sends one, so this is also the
/// most trusted steps one `run` or command can hold.
pub const CALL_INPUTS_MAX: u32 = 64;

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
            start_next_at_ms: None,
            page_script: String::new(),
            subscriptions: BTreeMap::new(),
            next_subscription: 0,
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
