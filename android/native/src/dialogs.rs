//! JavaScript dialogs of hidden context pages. The shell shows each one itself, over the applet
//! UI, and the website stays hidden. The page waits until the user answers, so the host only
//! keeps the context's page calls from counting that time against their deadlines.
use crate::host::Host;
use genesis_contracts::*;

/// The open dialog of one context. A context has at most one, since its page is blocked by it.
pub struct OpenDialog {
    pub token: u64,
    /// When the dialog opened. The context's page calls do not count this time against their deadlines.
    pub opened_at_ms: u64,
}

impl Host {
    /// A hidden context's page opened a dialog, which the shell shows.
    pub fn js_dialog(&mut self, view: &ViewRef, token: u64, now: u64) {
        let Role::Context(id) = &view.role else { return };
        // A page opens one dialog at a time; an older one the shell never closed has ended.
        self.end_dialog(&view.applet_id, id, None, now);
        if let Some(session) = self.session_mut(&view.applet_id) {
            session.dialogs.insert(id.clone(), OpenDialog { token, opened_at_ms: now });
        }
    }

    /// The shell ended dialog `token`: the user answered it, or its page navigated or was destroyed.
    pub fn js_dialog_closed(&mut self, view: &ViewRef, token: u64, now: u64) {
        if let Role::Context(id) = &view.role {
            self.end_dialog(&view.applet_id, id, Some(token), now);
        }
    }

    /// Clears the context's dialog slot when it holds `token` (any dialog for `None`) and gives
    /// the context's page calls back the time the dialog was open.
    pub fn end_dialog(&mut self, applet_id: &str, id: &str, token: Option<u64>, now: u64) {
        let Some(session) = self.session_mut(applet_id) else { return };
        if session.dialogs.get(id).is_none_or(|d| token.is_some_and(|t| t != d.token)) {
            return;
        }
        let Some(dialog) = session.dialogs.remove(id) else { return };
        let paused = now.saturating_sub(dialog.opened_at_ms);
        for call in session.calls.values_mut().filter(|c| c.context_id == id) {
            call.deadline_ms += paused;
        }
    }
}
