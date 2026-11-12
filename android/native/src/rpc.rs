//! Document messages: handshake, role authorization and method dispatch.
use crate::{
    contexts::{ActionHandle, CallHandle},
    documents::PendingOp,
    host::Host,
    services::{self, ServiceCall},
};
use genesis_contracts::*;
use serde_json::{Map, Value, json};

const FOREGROUND_METHODS: [&str; 20] = [
    "ui.ready",
    "storage.get",
    "storage.list",
    "storage.commit",
    "services.request",
    "context.navigate",
    "context.back",
    "context.forward",
    "context.reload",
    "context.reveal",
    "context.cover",
    "context.resync",
    "context.act",
    "context.cancel",
    "context.ping",
    "session.save",
    "back.handled",
    "back.leave",
    "page.call",
    "page.cancel",
];
const CONTEXT_METHODS: [&str; 5] = ["context.publish", "context.actionResult", "page.result", "page.progress", "page.emit"];
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
        if self.contexts.session.as_ref().is_none_or(|s| s.applet_id != view.applet_id) {
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
        let Some((revision, manifest)) = self.active_manifest().map(|(r, m)| (r, m.clone())) else { return };
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
                if let Some(context) = self.context_mut(&id) {
                    context.navigating_since = None;
                }
                self.foreground_event("context.gone", json!({ "id": id, "code": ErrorCode::ProtocolMismatch, "message": message }));
            }
            return;
        }
        self.retire_document(&view);
        // When the document's DocumentStarted came first, it is waiting for this hello.
        let started = match &context_id {
            Some(id) => self.context_mut(id).and_then(|c| c.navigating_since.take()).is_some(),
            None => true,
        };
        let Some(session) = self.contexts.session.as_mut() else { return };
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
                self.foreground_event("context.bound", data);
            }
            // A new foreground knows none of the old one's watches and calls; the pages drop them.
            Role::Foreground => self.reset_contexts(),
        }
        // An opened link started the applet; the foreground shows that context once bound, and
        // its routes decide between the applet's screen and the website.
        if view.role == Role::Foreground
            && let Some(id) = self.contexts.session.as_mut().and_then(|s| s.open_context.take())
        {
            self.foreground_event("user.showContext", json!({ "id": id }));
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
        let Some(manifest) = self.active_manifest().map(|(_, m)| m.clone()) else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        let pending = |host: &Host| {
            let actions = host.contexts.session.as_ref().map_or(0, |s| {
                s.actions.values().filter(|a| a.foreground_document == document_id).count()
            });
            host.documents.pending_count(document_id) + actions >= host.limits.pending_requests_max
        };
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
                if let Some(session) = self.contexts.session.as_mut().filter(|s| !s.foreground_shown) {
                    session.foreground_shown = true;
                    self.out.push(ShellCommand::RevealForeground);
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
            Call::ContextNavigate { id, url, mode } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                // Any http or https origin: an undeclared one presents as website.
                let Some(url) = web_url(&url) else {
                    return error(ErrorCode::InvalidArgument, "context.navigate needs an http or https URL");
                };
                self.out.push(ShellCommand::LoadUrl { view: target, url, mode });
                ok()
            }
            Call::ContextBack { id, steps } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                let steps = steps.unwrap_or(1).clamp(1, i32::MAX as u32) as i32;
                self.out.push(ShellCommand::HistoryGo { view: target, delta: -steps });
                ok()
            }
            Call::ContextForward { id } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                self.out.push(ShellCommand::HistoryGo { view: target, delta: 1 });
                ok()
            }
            Call::ContextReload { id } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                self.out.push(ShellCommand::Reload { view: target });
                ok()
            }
            Call::ContextReveal { id } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                self.reveal(&id, target, &manifest.name);
                ok()
            }
            Call::ContextCover {} => {
                self.cover();
                ok()
            }
            Call::ContextResync { id } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                if self.documents.current(&target).is_none() {
                    return error(ErrorCode::NotReady, "The context has no adapted page");
                }
                self.event(&target, "resync", json!({}));
                ok()
            }
            Call::ContextAct { id, generation, action } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                let Some(document) = self.documents.current(&target) else {
                    return error(ErrorCode::ContextReplaced, "The context has no adapted page");
                };
                if document.generation != generation {
                    return error(ErrorCode::ContextReplaced, "The page the action was for has been replaced");
                }
                if pending(self) {
                    return error(ErrorCode::QuotaExceeded, "Too many pending requests");
                }
                let handle = ActionHandle {
                    foreground_document: document_id.into(),
                    context_id: id,
                    context_document: document.id.clone(),
                    dispatched: false,
                    navigating: false,
                    deadline_ms: now + self.limits.action_timeout_ms,
                };
                let Some(session) = self.contexts.session.as_mut() else {
                    return error(ErrorCode::Retired, "The applet is not active");
                };
                let action_id = session.begin_action(handle);
                let mut data: Map<String, Value> = action;
                data.insert("actionId".into(), json!(action_id));
                self.event(&target, "act", Value::Object(data));
                Outcome::Now(Ok(json!({ "actionId": action_id })))
            }
            Call::ContextCancel { action_id } => {
                let Some(session) = self.contexts.session.as_ref() else {
                    return error(ErrorCode::Retired, "The applet is not active");
                };
                let handle = session.actions.get(&action_id).filter(|a| a.foreground_document == document_id && !a.dispatched);
                if let Some(target) = handle.and_then(|a| self.context_view(&a.context_id)) {
                    self.event(&target, "cancel", json!({ "actionId": action_id }));
                }
                ok()
            }
            Call::ContextPing { id } => {
                let Some(target) = self.context_view(&id) else { return unknown_context(&id) };
                // The renderer is shared, so a bound document and a live foreground mean a live context.
                let answer = match self.documents.current(&target) {
                    Some(document) => json!({ "bound": true, "generation": document.generation, "url": document.url }),
                    None => json!({ "bound": false }),
                };
                self.event(&target, "ping", json!({}));
                Outcome::Now(Ok(answer))
            }
            Call::SessionSave { version, state } => {
                if version != compat::SESSION_STATE {
                    return error(ErrorCode::InvalidArgument, format!("session.save version must be {}", compat::SESSION_STATE));
                }
                if let Some(session) = self.contexts.session.as_mut() {
                    session.saved = Some(json!({ "version": version, "state": state }));
                }
                ok()
            }
            Call::BackHandled { handled } => {
                self.back_answered(document_id, handled);
                ok()
            }
            Call::BackLeave {} => {
                // Answer before Home retires the document.
                self.respond(view, document_id, request_id, Ok(json!({})));
                self.home();
                Outcome::Later
            }
            Call::ContextPublish { page, patch } => {
                let Role::Context(id) = &view.role else { unreachable!() };
                let generation = self.documents.current(view).map_or(0, |d| d.generation);
                let (name, body) = match (page, patch) {
                    (Some(page), None) => ("page", page),
                    (None, Some(patch)) => ("patch", patch),
                    _ => return error(ErrorCode::InvalidArgument, "context.publish needs exactly one of page and patch"),
                };
                if let Some(failure) = self.publish_too_large(name, &body) {
                    return Outcome::Now(Err(failure));
                }
                self.foreground_event(name, json!({ "id": id, "generation": generation, name: body }));
                ok()
            }
            Call::ContextActionResult { action_id, state, navigating, expect, result } => {
                let Some(session) = self.contexts.session.as_mut() else {
                    return error(ErrorCode::Retired, "The applet is not active");
                };
                let Some(handle) = session.actions.get_mut(&action_id).filter(|a| a.context_document == document_id) else {
                    return ok(); // Expired or cancelled by the host already.
                };
                let foreground_document = handle.foreground_document.clone();
                // A navigating action's outcome is observed by the foreground, not reported here. Its handle
                // stays until the page goes, so a step that fails after the handoff still reaches the foreground.
                if state != ActionState::Dispatched {
                    session.actions.remove(&action_id);
                } else {
                    handle.dispatched = true;
                    handle.navigating = navigating == Some(true);
                }
                let mut update = json!({ "actionId": action_id, "state": state });
                if let Some(navigating) = navigating {
                    update["navigating"] = json!(navigating);
                }
                if let Some(expect) = expect.filter(|_| navigating == Some(true)) {
                    update["expect"] = expect;
                }
                if let Some(result) = result {
                    update["result"] = result;
                }
                self.action_update(&foreground_document, update);
                ok()
            }
            Call::PageCall { context, generation, op, args, timeout_ms } => {
                self.page_call(document_id, request_id, context, generation, op, args, timeout_ms, now)
            }
            Call::PageCancel { context, call_id } => self.page_cancel(document_id, context, call_id),
            Call::PageResult { call_id, ok, value, error } => self.page_result(document_id, call_id, ok, value, error),
            Call::PageProgress { call_id, state, completed_steps } => self.page_progress(document_id, call_id, state, completed_steps),
            Call::PageEmit { stream, kind, seq, view: page_view, url, data } => {
                self.page_emit(view, stream, kind, seq, page_view, url, data)
            }
        }
    }

    /// Sends `reset` to every bound context document of the session.
    fn reset_contexts(&mut self) {
        let Some(session) = self.contexts.session.as_ref() else { return };
        let ids: Vec<String> = session.contexts.keys().cloned().collect();
        for id in ids {
            if let Some(view) = self.context_view(&id) {
                self.event(&view, "reset", json!({}));
            }
        }
    }

    /// Starts a page call: checks the context and its document, then hands the operation to the page.
    #[allow(clippy::too_many_arguments)]
    fn page_call(&mut self, document_id: &str, request_id: u64, context: String, generation: u64, op: String, args: Value, timeout_ms: Option<u64>, now: u64) -> Outcome {
        let Some(target) = self.context_view(&context) else { return unknown_context(&context) };
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
        let Some(session) = self.contexts.session.as_mut() else {
            return error(ErrorCode::Retired, "The applet is not active");
        };
        if session.calls.values().filter(|c| c.context_id == context).count() >= self.limits.pending_requests_max {
            return error(ErrorCode::QuotaExceeded, "Too many open calls in this context");
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
    fn page_cancel(&mut self, document_id: &str, context: String, call_id: Option<String>) -> Outcome {
        let Some(target) = self.context_view(&context) else { return unknown_context(&context) };
        let Some(session) = self.contexts.session.as_ref() else {
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
    fn page_result(&mut self, document_id: &str, call_id: String, succeeded: bool, value: Option<Value>, failure: Option<ErrorBody>) -> Outcome {
        let Some(session) = self.contexts.session.as_mut() else {
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
        self.answer_call(&handle, outcome);
        ok()
    }

    /// Records how far a call got and tells the foreground document that asked.
    fn page_progress(&mut self, document_id: &str, call_id: String, state: CallState, completed_steps: Option<u64>) -> Outcome {
        let Some(session) = self.contexts.session.as_mut() else {
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
        if let Some(view) = self.foreground_view().filter(|v| self.documents.is_current(v, &foreground_document)) {
            self.event(&view, "page.progress", data);
        }
        ok()
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
        self.foreground_event("page.emit", message);
        ok()
    }

    /// The size check for one publish: bytes per kind, and records upserted by a patch.
    fn publish_too_large(&self, name: &str, body: &Value) -> Option<ErrorBody> {
        let size = serde_json::to_vec(body).map(|b| b.len()).unwrap_or(usize::MAX);
        if name == "page" {
            return (size > self.limits.page_max_bytes).then(|| ErrorBody::new(ErrorCode::PageTooLarge, "The page is too large"));
        }
        let records: usize = body
            .get("regions")
            .and_then(Value::as_object)
            .map(|regions| regions.values().filter_map(|r| r.get("upsert")?.as_array().map(Vec::len)).sum())
            .unwrap_or(0);
        (size > self.limits.patch_max_bytes || records > self.limits.patch_records_max)
            .then(|| ErrorBody::new(ErrorCode::PatchTooLarge, "The patch is too large"))
    }
}

fn unknown_context(id: &str) -> Outcome {
    error(ErrorCode::NotFound, format!("Unknown context {id}"))
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
