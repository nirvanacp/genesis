//! Document messages: handshake, role authorization and method dispatch.
use crate::{
    contexts::{CallHandle, InputBudget, PACED_OPS},
    documents::PendingOp,
    host::Host,
    services::{self, ServiceCall},
};
use genesis_contracts::*;
use serde_json::{Value, json};

const FOREGROUND_METHODS: [&str; 26] = [
    "ui.ready",
    "storage.get",
    "storage.list",
    "storage.commit",
    "services.request",
    "notifications.post",
    "context.navigate",
    "context.back",
    "context.forward",
    "context.reload",
    "context.reveal",
    "context.cover",
    "session.save",
    "back.handled",
    "back.leave",
    "page.call",
    "page.cancel",
    "context.dialog.claim",
    "context.dialog.answer",
    "context.grant",
    "files.pick",
    "files.release",
    "downloads.save",
    "share.open",
    "links.openExternal",
    "notifications.enable",
];
const CONTEXT_METHODS: [&str; 5] = ["page.result", "page.progress", "page.emit", "page.input", "page.files"];
/// Events in one `page.input`.
const INPUT_EVENTS_MAX: usize = 64;
/// Characters of `text` in one `page.input`, all its text events together. The shell types each
/// character as key events on the UI thread, so a long text would freeze it. Mirrors
/// `Input.TEXT_MAX` in the shell.
const INPUT_TEXT_MAX: usize = 2000;
const LIST_LIMIT: usize = 100;

/// What a call produced: an answer now, or one sent later (or already sent) by the call itself.
enum Outcome {
    Now(Result<Value, ErrorBody>),
    Later,
}

fn error(code: ErrorCode, message: impl Into<String>) -> Outcome {
    Outcome::Now(Err(ErrorBody::new(code, message)))
}

fn ok() -> Outcome {
    Outcome::Now(Ok(json!({})))
}

impl Host {
    pub fn document_message(&mut self, view: ViewRef, payload: &str, now: u64) {
        if !self.is_live(&view.applet_id) {
            return;
        }
        let Ok(message) = serde_json::from_str::<DocumentMessage>(payload) else { return };
        match message {
            DocumentMessage::Hello { protocol, url } => self.hello(view, protocol, url),
            DocumentMessage::Request { document_id, request_id, method, params } => {
                let Some(current) = self.documents.current(&view).map(|d| d.id.clone()) else { return };
                if document_id.is_some_and(|id| id != current) {
                    return; // From a retired document.
                }
                let outcome = if payload.len() > self.limits.message_max_bytes {
                    error(ErrorCode::MessageTooLarge, "The message is too large")
                } else {
                    self.call(&view, &current, request_id, &method, params, now)
                };
                if let Outcome::Now(result) = outcome {
                    self.respond(&view, &current, request_id, result);
                }
            }
        }
    }

    /// Binds a new document. A context document takes the context's next generation and
    /// replaces the context's previous document.
    fn hello(&mut self, view: ViewRef, protocol: u32, url: String) {
        let Some((revision, manifest)) = self.active_manifest(&view.applet_id).map(|(r, m)| (r, m.clone())) else { return };
        let context_id = match &view.role {
            Role::Context(id) if manifest.contexts.iter().any(|c| &c.id == id) => Some(id.clone()),
            Role::Context(_) => return,
            Role::Foreground => None,
        };
        if protocol != compat::PROTOCOL {
            let message = format!("The page speaks protocol {protocol}; this Genesis speaks {}", compat::PROTOCOL);
            self.post(&view, &HostMessage::Refused { error: ErrorBody::new(ErrorCode::ProtocolMismatch, &message) });
            if let Some(id) = context_id {
                // Reported gone now, so the unbound-document deadline must not report it again.
                if let Some(context) = self.context_mut(&view.applet_id, &id) {
                    context.navigating_since = None;
                }
                self.foreground_event(&view.applet_id, "context.gone", json!({ "id": id, "code": ErrorCode::ProtocolMismatch, "message": message }));
            }
            return;
        }
        self.retire_document(&view);
        // When the document's DocumentStarted came first, it is waiting for this hello.
        let started = match &context_id {
            Some(id) => self.context_mut(&view.applet_id, id).and_then(|c| c.navigating_since.take()).is_some(),
            None => true,
        };
        let Some(session) = self.contexts.sessions.get_mut(&view.applet_id) else { return };
        let saved = match (&context_id, session.restored) {
            (None, true) => {
                session.restored = false;
                session.saved.clone()
            }
            _ => None,
        };
        let document = self.documents.bind(&view, &url, context_id.is_some(), started);
        let document_generation = document.generation;
        let bound = HostMessage::Bound {
            protocol: compat::PROTOCOL,
            compat: HostCompat::default(),
            document_id: document.id.clone(),
            applet_id: view.applet_id.clone(),
            revision,
            role: if context_id.is_some() { DocumentRole::Context } else { DocumentRole::Foreground },
            context_id,
            generation: document.generation,
            manifest: Box::new(manifest),
            limits: self.limits.clone(),
            session: saved,
        };
        self.post(&view, &bound);
        match &view.role {
            // The client learns that the context's page agent now accepts calls.
            Role::Context(id) => {
                let data = json!({ "id": id, "generation": document_generation, "url": url });
                self.foreground_event(&view.applet_id, "context.bound", data);
            }
            // A new foreground knows none of the old one's watches and calls; the pages drop them.
            Role::Foreground => {
                self.reset_contexts(&view.applet_id);
                self.resend_dialogs(&view.applet_id, crate::host::now_ms());
            }
        }
        // An opened link started the applet; the foreground shows that context once bound, and
        // its routes decide between the applet's screen and the website.
        if view.role == Role::Foreground
            && let Some(id) = self.session_mut(&view.applet_id).and_then(|s| s.open_context.take())
        {
            self.foreground_event(&view.applet_id, "user.showContext", json!({ "id": id }));
        }
    }

    fn call(&mut self, view: &ViewRef, document_id: &str, request_id: u64, method: &str, params: Value, now: u64) -> Outcome {
        let allowed: &[&str] = if view.role == Role::Foreground { &FOREGROUND_METHODS } else { &CONTEXT_METHODS };
        if !allowed.contains(&method) {
            let known = FOREGROUND_METHODS.contains(&method) || CONTEXT_METHODS.contains(&method);
            return match known {
                true => error(ErrorCode::InvalidArgument, format!("{method} is not available to this document")),
                false => error(ErrorCode::UnknownMethod, format!("Unknown method {method}")),
            };
        }
        let params = if params.is_null() { json!({}) } else { params };
        let call = match serde_json::from_value::<Call>(json!({ "method": method, "params": params })) {
            Ok(call) => call,
            Err(e) => return error(ErrorCode::InvalidArgument, format!("Invalid {method} parameters: {e}")),
        };
        let applet_id = view.applet_id.as_str();
        let Some(manifest) = self.active_manifest(applet_id).map(|(_, m)| m.clone()) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        let pending = |host: &Host| host.documents.pending_count(document_id) >= host.limits.pending_requests_max;
        let begin = |host: &mut Host| {
            let op = PendingOp {
                view: view.clone(),
                document_id: document_id.into(),
                request_id,
                deadline_ms: now + host.limits.rpc_deadline_ms,
            };
            host.documents.begin_op(op)
        };
        match call {
            Call::UiReady {} => {
                if let Some(session) = self.session_mut(applet_id).filter(|s| !s.foreground_shown) {
                    session.foreground_shown = true;
                    self.out.push(ShellCommand::RevealForeground { applet_id: Some(applet_id.into()) });
                }
                ok()
            }
            Call::StorageGet { .. } | Call::StorageList { .. } | Call::StorageCommit(_) => {
                if manifest.capabilities.storage != Some(true) {
                    return error(ErrorCode::ConfigurationRequired, "Storage is not declared in applet.json");
                }
                if pending(self) {
                    return error(ErrorCode::QuotaExceeded, "Too many pending requests");
                }
                let operation = match call {
                    Call::StorageGet { collection, key } => StorageOperation::Get(StorageKey { collection, key }),
                    Call::StorageList { collection, after_key, limit } => StorageOperation::List(StorageList {
                        collection,
                        after_key,
                        limit: limit.unwrap_or(LIST_LIMIT),
                    }),
                    Call::StorageCommit(batch) => StorageOperation::Commit(batch),
                    _ => unreachable!(),
                };
                let op_id = begin(self);
                self.submit_storage(op_id, &manifest.id, operation);
                Outcome::Later
            }
            Call::ServicesRequest { service_id, path, method, body } => {
                if pending(self) {
                    return error(ErrorCode::QuotaExceeded, "Too many pending requests");
                }
                let op_id = begin(self);
                match services::command(&manifest, op_id, ServiceCall { service_id, path, method, body }) {
                    Ok(command) => {
                        self.out.push(command);
                        Outcome::Later
                    }
                    Err(failure) => {
                        self.documents.finish_op(op_id, None);
                        Outcome::Now(Err(failure))
                    }
                }
            }
            Call::NotificationsPost { id, title, body, url } => {
                if manifest.capabilities.notifications.is_none() {
                    return error(ErrorCode::ConfigurationRequired, "Notifications are not declared in applet.json");
                }
                if let Err(message) = notification_problem(&manifest, &id, &title, body.as_deref(), url.as_deref()) {
                    return error(ErrorCode::InvalidArgument, message);
                }
                // `posted` means accepted: only the shell knows whether the user turned them on.
                let applet_id = manifest.id.clone();
                self.out.push(ShellCommand::PostNotification { applet_id, id, title, body, url });
                Outcome::Now(Ok(json!({ "posted": true })))
            }
            Call::ContextNavigate { id, url, mode } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                // Any http or https origin: an undeclared one presents as website.
                let Some(url) = web_url(&url) else {
                    return error(ErrorCode::InvalidArgument, "context.navigate needs an http or https URL");
                };
                self.out.push(ShellCommand::LoadUrl { view: target, url, mode });
                ok()
            }
            Call::ContextBack { id, steps } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                let steps = steps.unwrap_or(1).clamp(1, i32::MAX as u32) as i32;
                self.out.push(ShellCommand::HistoryGo { view: target, delta: -steps });
                ok()
            }
            Call::ContextForward { id } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                self.out.push(ShellCommand::HistoryGo { view: target, delta: 1 });
                ok()
            }
            Call::ContextReload { id } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                self.out.push(ShellCommand::Reload { view: target });
                ok()
            }
            Call::ContextReveal { id } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                self.reveal(&id, target, &manifest.name);
                ok()
            }
            Call::ContextCover {} => {
                self.cover(applet_id);
                ok()
            }
            Call::SessionSave { version, state } => {
                if version != compat::SESSION_STATE {
                    return error(ErrorCode::InvalidArgument, format!("session.save version must be {}", compat::SESSION_STATE));
                }
                let Some(session) = self.session_mut(applet_id) else { return ok() };
                session.saved = Some(json!({ "version": version, "state": state }));
                // A suspended applet flushes its last saves after `suspended`, so its Recents card
                // restores them if the process ends in the background.
                if session.suspended_at_ms.is_some() {
                    let resume = Self::resume_of(session);
                    self.save_resume(applet_id, &resume);
                }
                ok()
            }
            Call::BackHandled { handled } => {
                self.back_answered(applet_id, document_id, handled);
                ok()
            }
            Call::BackLeave {} => {
                self.respond(view, document_id, request_id, Ok(json!({})));
                self.leave_on_back(applet_id);
                Outcome::Later
            }
            Call::PageCall { context, generation, op, args, timeout_ms } => {
                self.page_call(applet_id, document_id, request_id, context, generation, op, args, timeout_ms, now)
            }
            Call::PageCancel { context, call_id } => self.page_cancel(applet_id, document_id, context, call_id),
            Call::PageResult { call_id, ok, value, error } => self.page_result(applet_id, document_id, call_id, ok, value, error),
            Call::PageProgress { call_id, state, completed_steps } => self.page_progress(applet_id, document_id, call_id, state, completed_steps),
            Call::PageEmit { stream, kind, seq, view: page_view, url, data } => {
                self.page_emit(view, stream, kind, seq, page_view, url, data)
            }
            Call::PageInput { call_id, events } => self.page_input(view, document_id, request_id, call_id, events),
            Call::DialogClaim { id, dialog_id } => Outcome::Now(self.claim_dialog(applet_id, &id, dialog_id)),
            Call::DialogAnswer { id, dialog_id, accept, value } => {
                Outcome::Now(self.answer_dialog(applet_id, &id, dialog_id, accept, value, now))
            }
            Call::FilesPick { accept, multiple } => {
                let accept = accept.into_iter().map(|a| a.trim().to_ascii_lowercase()).collect();
                self.user_action(view, document_id, request_id, None, UserAction::PickFiles { accept, multiple }, now)
            }
            Call::FilesRelease { ids } => {
                self.release_files(applet_id, ids);
                ok()
            }
            Call::DownloadsSave { context, url, filename } => {
                let Some(target) = self.context_view(applet_id, &context) else { return unknown_context(&context) };
                self.user_action(view, document_id, request_id, Some(target), UserAction::Save { url, filename }, now)
            }
            Call::ShareOpen { title, text, url } => self.user_action(view, document_id, request_id, None, UserAction::Share { title, text, url }, now),
            Call::LinksOpenExternal { url } => self.user_action(view, document_id, request_id, None, UserAction::OpenExternal { url }, now),
            Call::NotificationsEnable {} => {
                if manifest.capabilities.notifications.is_none() {
                    return error(ErrorCode::ConfigurationRequired, "Notifications are not declared in applet.json");
                }
                self.user_action(view, document_id, request_id, None, UserAction::EnableNotifications, now)
            }
            Call::ContextGrant { id, grant } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                if !self.limits.grants {
                    return error(ErrorCode::UnknownMethod, "Grants are not available in this Genesis");
                }
                // The user taps a revealed website itself, so it needs no grant.
                if self.session(applet_id).is_some_and(|s| s.revealed.as_deref() == Some(id.as_str())) {
                    return Outcome::Now(Ok(json!({ "granted": true, "expiresInMs": 0 })));
                }
                self.user_action(view, document_id, request_id, Some(target), UserAction::Grant { grant }, now)
            }
            Call::PageFiles { call_id, ids } => match self.page_files(view, document_id, request_id, call_id, ids) {
                Ok(()) => Outcome::Later,
                Err(failure) => Outcome::Now(Err(failure)),
            },
        }
    }

    fn user_action(&mut self, view: &ViewRef, document_id: &str, request_id: u64, context: Option<ViewRef>, action: UserAction, now: u64) -> Outcome {
        match self.begin_user_action(view, document_id, request_id, context, action, now) {
            Ok(()) => Outcome::Later,
            Err(failure) => Outcome::Now(Err(failure)),
        }
    }

    /// Sends `reset` to every bound context document of the session.
    /// Also tells the new foreground which context documents already accept calls, since it
    /// missed their `context.bound`.
    fn reset_contexts(&mut self, applet_id: &str) {
        let Some(session) = self.session(applet_id) else { return };
        let ids: Vec<String> = session.contexts.keys().cloned().collect();
        for id in ids {
            let Some(view) = self.context_view(applet_id, &id) else { continue };
            self.event(&view, "reset", json!({}));
            if let Some(document) = self.documents.current(&view) {
                let generation = document.generation;
                let data = json!({ "id": id, "generation": document.generation, "url": document.url });
                self.foreground_event(applet_id, "context.bound", data);
                // A new foreground also needs the context's history position, or Back cannot tell
                // that the website has entries to go back to until the next navigation.
                if let Some(context) = self.session(applet_id).and_then(|s| s.contexts.get(&id)) {
                    let data = json!({
                        "id": id, "url": context.url, "generation": generation,
                        "index": context.index, "size": context.size,
                        "canGoBack": context.can_go_back, "canGoForward": context.can_go_forward,
                        "sameDocument": true, "reload": false,
                    });
                    self.foreground_event(applet_id, "context.navigated", data);
                }
            }
        }
    }

    /// Starts a page call: checks the context and its document, then hands the operation to the page.
    #[allow(clippy::too_many_arguments)]
    fn page_call(&mut self, applet_id: &str, document_id: &str, request_id: u64, context: String, generation: u64, op: String, args: Value, timeout_ms: Option<u64>, now: u64) -> Outcome {
        let Some(target) = self.context_view(applet_id, &context) else { return unknown_context(&context) };
        let Some(document) = self.documents.current(&target) else {
            return error(ErrorCode::NotReady, "The context has no bound page");
        };
        if generation < document.generation {
            return error(ErrorCode::ContextReplaced, "The page the call was for has been replaced");
        }
        if generation > document.generation {
            return error(ErrorCode::NotReady, "The page the call is for has not bound yet");
        }
        let context_document = document.id.clone();
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        if session.calls.values().filter(|c| c.context_id == context).count() >= self.limits.pending_requests_max {
            return error(ErrorCode::QuotaExceeded, "Too many open calls in this context");
        }
        if PACED_OPS.contains(&op.as_str()) {
            let (burst, refill_ms) = (self.limits.input_burst, u64::from(self.limits.input_refill_ms));
            let budget = session.input_budgets.entry(context.clone()).or_insert_with(|| InputBudget::full(burst, now));
            if let Err(retry_after_ms) = budget.take(now, burst, refill_ms) {
                let body = ErrorBody::new(ErrorCode::RateLimited, "Too many inputs in this context; wait for the user's next tap")
                    .with_details(json!({ "dispatched": false, "retryAfterMs": retry_after_ms }));
                return Outcome::Now(Err(body));
            }
        }
        let budget_ms = timeout_ms.unwrap_or(self.limits.rpc_deadline_ms).min(self.limits.action_timeout_ms);
        let handle = CallHandle {
            foreground_document: document_id.into(),
            request_id,
            context_id: context,
            context_document,
            dispatched: false,
            navigating: false,
            completed_steps: None,
            deadline_ms: now + budget_ms,
        };
        let call_id = session.begin_call(handle);
        self.event(&target, "call", json!({ "callId": call_id, "op": op, "args": args, "deadlineMs": budget_ms }));
        Outcome::Later
    }

    /// Asks the context to cancel the asking document's calls that have not dispatched input.
    fn page_cancel(&mut self, applet_id: &str, document_id: &str, context: String, call_id: Option<String>) -> Outcome {
        let Some(target) = self.context_view(applet_id, &context) else { return unknown_context(&context) };
        let Some(session) = self.session(applet_id) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        let mine = |id: &String, c: &CallHandle| {
            c.foreground_document == document_id && c.context_id == context && call_id.as_ref().is_none_or(|wanted| wanted == id)
        };
        let open = session.calls.iter().any(|(id, c)| mine(id, c) && !c.dispatched);
        if open {
            let data = match call_id {
                Some(id) => json!({ "callId": id }),
                None => json!({}),
            };
            self.event(&target, "cancel", data);
        }
        ok()
    }

    /// The context's answer to a call. An answer from a document other than the one called is ignored.
    fn page_result(&mut self, applet_id: &str, document_id: &str, call_id: String, succeeded: bool, value: Option<Value>, failure: Option<ErrorBody>) -> Outcome {
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        if session.calls.get(&call_id).is_none_or(|c| c.context_document != document_id) {
            return ok(); // Expired, failed by the host, or not this document's.
        }
        let Some(handle) = session.calls.remove(&call_id) else { return ok() };
        let outcome = match succeeded {
            true => Ok(value.unwrap_or(Value::Null)),
            false => Err(failure.unwrap_or_else(|| ErrorBody::new(ErrorCode::InvalidArgument, "page.result failed without an error"))),
        };
        self.answer_call(applet_id, &handle, outcome);
        ok()
    }

    /// Records how far a call got and tells the foreground document that asked.
    fn page_progress(&mut self, applet_id: &str, document_id: &str, call_id: String, state: CallState, completed_steps: Option<u64>) -> Outcome {
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        let Some(handle) = session.calls.get_mut(&call_id).filter(|c| c.context_document == document_id) else {
            return ok();
        };
        handle.dispatched = true;
        if state == CallState::Navigating {
            handle.navigating = true;
        }
        if completed_steps.is_some() {
            handle.completed_steps = completed_steps;
        }
        let foreground_document = handle.foreground_document.clone();
        let mut data = json!({ "context": handle.context_id, "callId": call_id, "state": state });
        if let Some(steps) = completed_steps {
            data["completedSteps"] = json!(steps);
        }
        if let Some(view) = self.foreground_view(applet_id).filter(|v| self.documents.is_current(v, &foreground_document)) {
            self.event(&view, "page.progress", data);
        }
        ok()
    }

    /// Has the shell dispatch real input to the asking context document's view, for one of its open
    /// calls. The request stays open until the shell reports `InputDone`, the call's deadline passes
    /// or the document is retired. A revealed context gets none: the user is looking at it, and
    /// input from the applet would count as the user's gesture there.
    fn page_input(&mut self, view: &ViewRef, document_id: &str, request_id: u64, call_id: String, events: Vec<InputEvent>) -> Outcome {
        if !self.limits.trusted_input {
            return error(ErrorCode::InputUnavailable, "Trusted input is not available in this Genesis");
        }
        if events.is_empty() || events.len() > INPUT_EVENTS_MAX {
            return error(ErrorCode::InvalidArgument, format!("page.input takes 1 to {INPUT_EVENTS_MAX} events"));
        }
        let text: usize = events.iter().map(|e| if let InputEvent::Text { text } = e { text.chars().count() } else { 0 }).sum();
        if text > INPUT_TEXT_MAX {
            return error(ErrorCode::InvalidArgument, format!("page.input types at most {INPUT_TEXT_MAX} characters"));
        }
        let Role::Context(id) = &view.role else { unreachable!() };
        let Some(session) = self.session(&view.applet_id) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        // The view already committed another document, which this one's input would reach. The
        // shell runs the command within this event, so it sees the same document the host does.
        if session.contexts.get(id).is_some_and(|c| c.navigating_since.is_some()) {
            return error(ErrorCode::ContextReplaced, "The page changed before the input");
        }
        let Some(handle) = session.calls.get(&call_id).filter(|c| c.context_document == document_id) else {
            return error(ErrorCode::NotFound, "page.input needs an open call of this page");
        };
        if session.revealed.as_ref() == Some(id) {
            return error(ErrorCode::InputUnavailable, "Trusted input goes only to a hidden page");
        }
        let op = PendingOp { view: view.clone(), document_id: document_id.into(), request_id, deadline_ms: handle.deadline_ms };
        let token = self.documents.begin_op(op);
        self.out.push(ShellCommand::Input { view: view.clone(), token, events });
        Outcome::Later
    }

    /// The shell's answer to `Input`: ends the `page.input` request it belongs to, if still open.
    pub fn input_done(&mut self, view: &ViewRef, token: u64, succeeded: bool, message: Option<String>) {
        let outcome = match succeeded {
            true => Ok(json!({})),
            false => Err(ErrorBody::new(ErrorCode::InputUnavailable, message.unwrap_or_else(|| "The input could not be dispatched".into()))),
        };
        self.finish_op(token, Some(&view.applet_id), outcome);
    }

    /// Forwards one watch message to the foreground, after the size rule for its kind.
    #[allow(clippy::too_many_arguments)]
    fn page_emit(&mut self, view: &ViewRef, stream: String, kind: EmitKind, seq: u64, page_view: Value, url: String, data: Value) -> Outcome {
        let Role::Context(id) = &view.role else { unreachable!() };
        let size = serde_json::to_vec(&data).map(|b| b.len()).unwrap_or(usize::MAX);
        match kind {
            EmitKind::Snapshot if size > self.limits.page_max_bytes => {
                return error(ErrorCode::PageTooLarge, "The snapshot is too large");
            }
            EmitKind::Patch => {
                let records = match data.get("upsert") {
                    Some(Value::Object(upsert)) => upsert.len(),
                    Some(Value::Array(upsert)) => upsert.len(),
                    _ => 0,
                };
                if size > self.limits.patch_max_bytes || records > self.limits.patch_records_max {
                    return error(ErrorCode::PatchTooLarge, "The patch is too large");
                }
            }
            _ => {}
        }
        let generation = self.documents.current(view).map_or(0, |d| d.generation);
        let message = json!({
            "context": id, "generation": generation, "stream": stream, "kind": kind,
            "seq": seq, "view": page_view, "url": url, "data": data,
        });
        self.foreground_event(&view.applet_id, "page.emit", message);
        ok()
    }
}

fn unknown_context(id: &str) -> Outcome {
    error(ErrorCode::NotFound, format!("Unknown context {id}"))
}

/// Why a notification is refused: an `id` of 1 to 64 `[A-Za-z0-9._-]`, a title of 1 to 120
/// characters, a body of at most 500, and a `url` that is https on one of the applet's origins.
fn notification_problem(manifest: &Manifest, id: &str, title: &str, body: Option<&str>, url: Option<&str>) -> Result<(), String> {
    let id_ok = (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if !id_ok {
        return Err("notifications.post needs an id of 1 to 64 letters, digits, '.', '_' or '-'".into());
    }
    if title.trim().is_empty() || title.chars().count() > 120 {
        return Err("notifications.post needs a title of 1 to 120 characters".into());
    }
    if body.is_some_and(|b| b.chars().count() > 500) {
        return Err("notifications.post takes a body of at most 500 characters".into());
    }
    if let Some(url) = url {
        let origin = url::Url::parse(url).ok().filter(|u| u.scheme() == "https").map(|u| u.origin().ascii_serialization());
        let declared = origin.is_some_and(|o| manifest.origins.iter().any(|d| crate::applets::origin_of(d).as_deref() == Some(o.as_str())));
        if !declared {
            return Err("notifications.post takes only an https url on one of the applet's origins".into());
        }
    }
    Ok(())
}

/// An http or https URL with a host and no credentials.
fn web_url(value: &str) -> Option<String> {
    let url = url::Url::parse(value).ok()?;
    let web = matches!(url.scheme(), "https" | "http");
    if !web || !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
        return None;
    }
    Some(url.into())
}
