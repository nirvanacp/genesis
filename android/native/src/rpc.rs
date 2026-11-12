//! Document messages: handshake, role authorization and method dispatch.
use crate::{
    contexts::ActionHandle,
    documents::PendingOp,
    host::Host,
    services::{self, ServiceCall},
};
use genesis_contracts::*;
use serde_json::{Map, Value, json};

const FOREGROUND_METHODS: [&str; 19] = [
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
    "context.resync",
    "context.act",
    "context.cancel",
    "context.ping",
    "session.save",
    "back.handled",
    "back.leave",
];
const CONTEXT_METHODS: [&str; 2] = ["context.publish", "context.actionResult"];
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
        let pending = |host: &Host| {
            let actions = host.session(applet_id).map_or(0, |s| {
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
            Call::ContextResync { id } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
                if self.documents.current(&target).is_none() {
                    return error(ErrorCode::NotReady, "The context has no adapted page");
                }
                self.event(&target, "resync", json!({}));
                ok()
            }
            Call::ContextAct { id, generation, action } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
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
                let Some(session) = self.session_mut(applet_id) else {
                    return error(ErrorCode::Retired, "The applet is not active");
                };
                let action_id = session.begin_action(handle);
                let mut data: Map<String, Value> = action;
                data.insert("actionId".into(), json!(action_id));
                self.event(&target, "act", Value::Object(data));
                Outcome::Now(Ok(json!({ "actionId": action_id })))
            }
            Call::ContextCancel { action_id } => {
                let Some(session) = self.session(applet_id) else {
                    return error(ErrorCode::Retired, "The applet is not active");
                };
                let handle = session.actions.get(&action_id).filter(|a| a.foreground_document == document_id && !a.dispatched);
                if let Some(target) = handle.and_then(|a| self.context_view(applet_id, &a.context_id)) {
                    self.event(&target, "cancel", json!({ "actionId": action_id }));
                }
                ok()
            }
            Call::ContextPing { id } => {
                let Some(target) = self.context_view(applet_id, &id) else { return unknown_context(&id) };
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
                if let Some(session) = self.session_mut(applet_id) {
                    session.saved = Some(json!({ "version": version, "state": state }));
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
                self.foreground_event(applet_id, name, json!({ "id": id, "generation": generation, name: body }));
                ok()
            }
            Call::ContextActionResult { action_id, state, navigating, expect, result } => {
                let Some(session) = self.session_mut(applet_id) else {
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
                self.action_update(applet_id, &foreground_document, update);
                ok()
            }
        }
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
