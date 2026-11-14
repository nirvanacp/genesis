//! JavaScript dialogs of hidden context pages. The page waits while one is open, so the host
//! hands it to the foreground, which claims it and answers for the user. A dialog the foreground
//! does not claim within `DIALOG_CLAIM_MS` reveals the website, and the shell shows it there.
use crate::host::Host;
use genesis_contracts::*;
use serde_json::{Value, json};

/// The open dialog of one context. A context has at most one, since its page is blocked by it.
pub struct OpenDialog {
    pub token: u64,
    pub kind: DialogKind,
    pub message: String,
    pub default_value: Option<String>,
    pub origin: String,
    /// The foreground said it shows the dialog itself.
    pub claimed: bool,
    /// The shell shows the dialog over the revealed website; only the user answers it there.
    pub shown: bool,
    /// When the dialog opened. The context's page calls do not count this time against their deadlines.
    pub opened_at_ms: u64,
    /// Without a claim by then, the website is revealed and the shell shows the dialog.
    pub claim_by_ms: u64,
}

fn cut(text: String) -> String {
    match text.char_indices().nth(DIALOG_TEXT_MAX) {
        Some((end, _)) => text[..end].into(),
        None => text,
    }
}

fn not_found(id: &str, dialog_id: u64) -> ErrorBody {
    ErrorBody::new(ErrorCode::NotFound, format!("Context {id} has no open dialog {dialog_id} to answer"))
}

impl Host {
    /// A hidden context's page opened a dialog. A revealed context's dialog, which the shell
    /// normally shows itself, is shown at once.
    #[allow(clippy::too_many_arguments)]
    pub fn js_dialog(&mut self, view: ViewRef, token: u64, kind: DialogKind, message: String, default_value: Option<String>, url: String, now: u64) {
        let (Role::Context(id), Some(session)) = (&view.role, self.session(&view.applet_id)) else {
            return self.out.push(ShellCommand::AnswerDialog { view, token, accept: false, value: None });
        };
        let id = id.clone();
        if session.revealed.as_deref() == Some(id.as_str()) {
            return self.out.push(ShellCommand::ShowDialog { view, token });
        }
        // A page opens one dialog at a time; an older one the shell never closed has ended.
        self.end_dialog(&view.applet_id, &id, None, true, now);
        let origin = url::Url::parse(&url).map(|u| u.origin().ascii_serialization()).unwrap_or_default();
        let dialog = OpenDialog {
            token,
            kind,
            message: cut(message),
            default_value: default_value.map(cut),
            origin,
            claimed: false,
            shown: false,
            opened_at_ms: now,
            claim_by_ms: now + DIALOG_CLAIM_MS,
        };
        let data = Self::dialog_event(&id, &dialog);
        if let Some(session) = self.session_mut(&view.applet_id) {
            session.dialogs.insert(id, dialog);
        }
        self.foreground_event(&view.applet_id, "context.dialog", data);
        self.out.push(ShellCommand::Wake { delay_ms: DIALOG_CLAIM_MS });
    }

    fn dialog_event(id: &str, dialog: &OpenDialog) -> Value {
        let mut data = json!({
            "id": id, "dialogId": dialog.token, "kind": dialog.kind,
            "message": dialog.message, "origin": dialog.origin,
        });
        if let Some(value) = &dialog.default_value {
            data["defaultValue"] = json!(value);
        }
        data
    }

    /// `context.dialog.claim`: the foreground shows the dialog, so the website stays hidden.
    pub fn claim_dialog(&mut self, applet_id: &str, id: &str, dialog_id: u64) -> Result<Value, ErrorBody> {
        let dialog = self.session_mut(applet_id).and_then(|s| s.dialogs.get_mut(id));
        match dialog {
            Some(dialog) if dialog.token == dialog_id && !dialog.shown => {
                dialog.claimed = true;
                Ok(json!({}))
            }
            _ => Err(not_found(id, dialog_id)),
        }
    }

    /// `context.dialog.answer`: the user's answer reaches the page and the dialog ends.
    pub fn answer_dialog(&mut self, applet_id: &str, id: &str, dialog_id: u64, accept: bool, value: Option<String>, now: u64) -> Result<Value, ErrorBody> {
        let kind = match self.session(applet_id).and_then(|s| s.dialogs.get(id)) {
            Some(dialog) if dialog.token == dialog_id && !dialog.shown => dialog.kind,
            _ => return Err(not_found(id, dialog_id)),
        };
        if value.is_some() && kind != DialogKind::Prompt {
            return Err(ErrorBody::new(ErrorCode::InvalidArgument, "Only a prompt dialog takes a value"));
        }
        if value.as_ref().is_some_and(|v| v.chars().count() > DIALOG_TEXT_MAX) {
            return Err(ErrorBody::new(ErrorCode::InvalidArgument, format!("A prompt's value has at most {DIALOG_TEXT_MAX} characters")));
        }
        let Some(view) = self.context_view(applet_id, id) else { return Err(not_found(id, dialog_id)) };
        self.out.push(ShellCommand::AnswerDialog { view, token: dialog_id, accept, value });
        self.end_dialog(applet_id, id, Some(dialog_id), false, now);
        Ok(json!({}))
    }

    /// The shell ended dialog `token` itself: the user answered it over the website, or its page
    /// navigated or was destroyed.
    pub fn js_dialog_closed(&mut self, view: &ViewRef, token: u64, now: u64) {
        if let Role::Context(id) = &view.role {
            self.end_dialog(&view.applet_id, id, Some(token), true, now);
        }
    }

    /// Clears the context's dialog slot when it holds `token` (any dialog for `None`), gives the
    /// context's page calls back the time the dialog was open, and with `notify` tells the
    /// foreground with `context.dialogClosed`.
    pub fn end_dialog(&mut self, applet_id: &str, id: &str, token: Option<u64>, notify: bool, now: u64) {
        let Some(session) = self.session_mut(applet_id) else { return };
        if session.dialogs.get(id).is_none_or(|d| token.is_some_and(|t| t != d.token)) {
            return;
        }
        let Some(dialog) = session.dialogs.remove(id) else { return };
        let paused = now.saturating_sub(dialog.opened_at_ms);
        for call in session.calls.values_mut().filter(|c| c.context_id == id) {
            call.deadline_ms += paused;
        }
        if notify {
            self.foreground_event(applet_id, "context.dialogClosed", json!({ "id": id, "dialogId": dialog.token }));
        }
    }

    /// Dialogs the foreground did not claim in time: reveal the website and let the shell show them.
    pub fn expire_dialog_claims(&mut self, applet_id: &str, now: u64) {
        let Some(session) = self.session(applet_id) else { return };
        let due: Vec<(String, u64)> = session
            .dialogs
            .iter()
            .filter(|(_, d)| !d.claimed && !d.shown && d.claim_by_ms <= now)
            .map(|(id, d)| (id.clone(), d.token))
            .collect();
        let Some(name) = self.active_manifest(applet_id).map(|(_, m)| m.name.clone()) else { return };
        for (id, token) in due {
            let Some(view) = self.context_view(applet_id, &id) else { continue };
            if let Some(dialog) = self.session_mut(applet_id).and_then(|s| s.dialogs.get_mut(&id)) {
                dialog.shown = true;
            }
            self.reveal(&id, view.clone(), &name);
            // The foreground's presentation follows, as for a link opened in a context.
            self.foreground_event(applet_id, "user.showContext", json!({ "id": id }));
            self.out.push(ShellCommand::ShowDialog { view, token });
        }
    }

    /// A new foreground knows none of the old one's dialogs: it gets each one not yet shown over
    /// the website, with a new claim window.
    pub fn resend_dialogs(&mut self, applet_id: &str, now: u64) {
        let Some(session) = self.session_mut(applet_id) else { return };
        let mut events = Vec::new();
        for (id, dialog) in session.dialogs.iter_mut().filter(|(_, d)| !d.shown) {
            dialog.claimed = false;
            dialog.claim_by_ms = now + DIALOG_CLAIM_MS;
            events.push(Self::dialog_event(id, dialog));
        }
        if events.is_empty() {
            return;
        }
        for data in events {
            self.foreground_event(applet_id, "context.dialog", data);
        }
        self.out.push(ShellCommand::Wake { delay_ms: DIALOG_CLAIM_MS });
    }
}
