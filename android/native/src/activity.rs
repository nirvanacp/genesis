//! How much of each covered context's website runs. A context rests (hidden and paused) unless
//! something needs its page: a load, a page call, a dialog, a grant, the user looking at it, or
//! a hold the applet asked for. The shell applies the level; this module chooses it.
use crate::{
    contexts::{ContextView, Session},
    debug_log,
    host::Host,
};
use genesis_contracts::*;
use serde_json::json;

/// A context stays awake this long after its document bound, for the page's own first work.
pub const LOAD_TAIL_MS: u64 = 3_000;
/// A context stays awake this long after a call settled, a dialog closed or it was covered, so
/// the website finishes what the applet started and a burst of calls does not flap the level.
pub const CALL_TAIL_MS: u64 = 2_500;
/// An `awake` hold drops to `running` after this long.
pub const HOLD_AWAKE_MAX_MS: u64 = 30_000;

/// The next context of an applet starts this long after the previous one bound, so their first
/// loads do not compete.
pub const START_STAGGER_MS: u64 = 3_000;

/// The tail a context gets once what keeps it busy now ends, or None when nothing does.
fn busy_tail(session: &Session, id: &str, context: &ContextView, now: u64) -> Option<u64> {
    if context.navigating_since.is_some() || now < context.loading_until_ms {
        return Some(LOAD_TAIL_MS);
    }
    let called = session.calls.values().any(|c| c.context_id == id);
    let busy = called || session.dialogs.contains_key(id) || session.revealed.as_deref() == Some(id);
    busy.then_some(CALL_TAIL_MS)
}

/// The highest level anything asks of the context. A suspended applet's contexts all rest.
fn wanted_level(context: &ContextView, suspended: bool, busy: bool, now: u64) -> ActivityLevel {
    if suspended {
        return ActivityLevel::Resting;
    }
    if busy || now < context.awake_until_ms {
        return ActivityLevel::Awake;
    }
    match context.hold {
        Some((ActivityLevel::Awake, until)) if now < until => ActivityLevel::Awake,
        Some(_) => ActivityLevel::Running,
        None => ActivityLevel::Resting,
    }
}

impl Host {
    /// Sends the shell each context's level when it changed, and wakes the host when the next
    /// level can drop. Runs after every shell event. A raise goes before the event's other
    /// commands, so the page is awake when a call, a load or an input reaches it; a drop goes after.
    pub fn refresh_activity(&mut self, now: u64) {
        if self.activity_off {
            return; // Every view stays as the shell created it: awake.
        }
        let (mut raised, mut lowered) = (Vec::new(), Vec::new());
        let mut next_drop: Option<u64> = None;
        for session in self.contexts.sessions.values_mut() {
            let suspended = session.suspended_at_ms.is_some();
            let ids: Vec<String> = session.contexts.keys().cloned().collect();
            for id in ids {
                let busy = session.contexts.get(&id).and_then(|c| busy_tail(session, &id, c, now));
                let Some(context) = session.contexts.get_mut(&id) else { continue };
                let Some(current) = context.level else { continue };
                match busy {
                    Some(tail) => context.busy_tail_ms = tail,
                    None => {
                        let tail = std::mem::take(&mut context.busy_tail_ms);
                        if tail > 0 {
                            context.awake_until_ms = context.awake_until_ms.max(now + tail);
                        }
                    }
                }
                let wanted = wanted_level(context, suspended, busy.is_some(), now);
                if wanted != current {
                    context.level = Some(wanted);
                    if debug_log::on(&session.applet_id) {
                        debug_log::host(&session.applet_id, "context.level", json!({ "id": id, "level": wanted }));
                    }
                    let view = ViewRef { applet_id: session.applet_id.clone(), role: Role::Context(id.clone()) };
                    let command = ShellCommand::SetActivity { view, level: wanted };
                    if wanted > current { raised.push(command) } else { lowered.push(command) }
                }
                if !suspended {
                    let hold_end = context.hold.filter(|(level, _)| *level == ActivityLevel::Awake).map(|(_, until)| until);
                    let ends = [Some(context.awake_until_ms), Some(context.loading_until_ms), hold_end];
                    let soonest = ends.into_iter().flatten().filter(|at| *at > now).min();
                    next_drop = [next_drop, soonest].into_iter().flatten().min();
                }
            }
        }
        self.out.splice(0..0, raised);
        self.out.extend(lowered);
        // One wake at a time: a wake already due before `at` runs this again and schedules the next.
        if let Some(at) = next_drop
            && !(now < self.activity_wake_ms && self.activity_wake_ms <= at)
        {
            self.activity_wake_ms = at;
            self.out.push(ShellCommand::Wake { delay_ms: at - now });
        }
    }

    /// Creates the context's view at its stored URL, unless it exists. Returns whether it did.
    /// A foreground call that names a context starts it, so the page the user is on never waits.
    pub fn start_context(&mut self, applet_id: &str, context_id: &str, now: u64) -> bool {
        if self.session(applet_id).and_then(|s| s.contexts.get(context_id)).is_none_or(|c| c.started()) {
            return false;
        }
        let Some((revision, manifest)) = self.applets.current(applet_id) else { return false };
        let origins = manifest.origins.clone();
        let Ok(script) = self.applets.read_text(applet_id, revision, "page.js") else { return false };
        let ready_ms = self.limits.document_ready_ms;
        let Some(session) = self.session_mut(applet_id) else { return false };
        let Some(context) = session.contexts.get_mut(context_id) else { return false };
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "context.start", json!({ "id": context_id }));
        }
        // A new view starts awake in the shell, and stays so while its first page loads.
        context.level = Some(ActivityLevel::Awake);
        context.loading_until_ms = now + ready_ms;
        let url = context.url.clone();
        // The next context waits for this one to bind, or for as long as a page may take to.
        let waiting = session.contexts.values().any(|c| !c.started());
        session.start_next_at_ms = waiting.then_some(now + ready_ms);
        let covered = session.revealed.as_deref() != Some(context_id);
        self.out.push(ShellCommand::CreateView {
            view: ViewRef { applet_id: applet_id.into(), role: Role::Context(context_id.into()) },
            url,
            origins,
            start_script: Some(script),
        });
        if covered {
            self.set_light(applet_id, context_id, true);
        }
        true
    }

    /// A covered context is light: it skips image downloads nobody sees. Reveal lifts it before
    /// the shell shows the page, and covering sets it again. Only for a started context, and
    /// never with the `light` switch off. GeckoView has no such setting; its shell ignores it.
    pub fn set_light(&mut self, applet_id: &str, context_id: &str, on: bool) {
        if self.light_off || self.session(applet_id).and_then(|s| s.contexts.get(context_id)).is_none_or(|c| !c.started()) {
            return;
        }
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "context.light", json!({ "id": context_id, "on": on }));
        }
        let view = ViewRef { applet_id: applet_id.into(), role: Role::Context(context_id.into()) };
        self.out.push(ShellCommand::SetLight { view, on });
    }

    /// A context document bound: the applet's next context may start after the stagger.
    pub fn context_bound(&mut self, applet_id: &str, now: u64) {
        let Some(session) = self.session_mut(applet_id) else { return };
        if let Some(at) = session.start_next_at_ms
            && now + START_STAGGER_MS < at
        {
            session.start_next_at_ms = Some(now + START_STAGGER_MS);
            self.out.push(ShellCommand::Wake { delay_ms: START_STAGGER_MS });
        }
    }

    /// Starts the next context, in manifest order, of each applet in front whose turn has come.
    pub fn start_due_contexts(&mut self, now: u64) {
        let due = |s: &&Session| s.suspended_at_ms.is_none() && s.start_next_at_ms.is_some_and(|at| at <= now);
        let applets: Vec<String> = self.contexts.sessions.values().filter(due).map(|s| s.applet_id.clone()).collect();
        for applet_id in applets {
            let next = self.active_manifest(&applet_id).and_then(|(_, manifest)| {
                let session = self.session(&applet_id)?;
                let waiting = |id: &&String| session.contexts.get(*id).is_some_and(|c| !c.started());
                manifest.contexts.iter().map(|c| &c.id).find(waiting).cloned()
            });
            match next {
                Some(id) => {
                    self.start_context(&applet_id, &id, now);
                }
                None => {
                    if let Some(session) = self.session_mut(&applet_id) {
                        session.start_next_at_ms = None;
                    }
                }
            }
        }
    }

    /// Keeps the context awake until `until_ms` at least.
    pub fn extend_awake(&mut self, applet_id: &str, context_id: &str, until_ms: u64) {
        if let Some(context) = self.context_mut(applet_id, context_id) {
            context.awake_until_ms = context.awake_until_ms.max(until_ms);
        }
    }

    /// The host asked the context's view to load, reload or move in history. The context is
    /// awake until the new document binds, or until it would be reported as not loading.
    pub fn begin_load(&mut self, view: &ViewRef, now: u64) {
        let Role::Context(id) = &view.role else { return };
        let ready_ms = self.limits.document_ready_ms;
        if let Some(context) = self.context_mut(&view.applet_id, id) {
            context.loading_until_ms = now + ready_ms;
        }
    }

    /// The load the host asked for is over: its document bound, or nothing was left to load.
    pub fn end_load(&mut self, view: &ViewRef) {
        let Role::Context(id) = &view.role else { return };
        if let Some(context) = self.context_mut(&view.applet_id, id) {
            context.loading_until_ms = 0;
        }
    }

    /// The foreground's `context.hold`. `Resting` or no level releases the hold.
    pub fn hold(&mut self, applet_id: &str, context_id: &str, level: Option<ActivityLevel>, now: u64) {
        let Some(context) = self.context_mut(applet_id, context_id) else { return };
        context.hold = match level {
            Some(ActivityLevel::Awake) => Some((ActivityLevel::Awake, now + HOLD_AWAKE_MAX_MS)),
            Some(ActivityLevel::Running) => Some((ActivityLevel::Running, 0)),
            Some(ActivityLevel::Resting) | None => None,
        };
    }

    /// A new foreground document knows none of the old one's holds.
    pub fn release_holds(&mut self, applet_id: &str) {
        let Some(session) = self.session_mut(applet_id) else { return };
        for context in session.contexts.values_mut() {
            context.hold = None;
        }
    }
}
