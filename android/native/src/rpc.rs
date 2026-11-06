//! Document messages: handshake, role authorization and method dispatch.
use crate::{
    documents::{Intent, PendingOp},
    host::Host,
    services::{self, ServiceCall},
};
use genesis_contracts::*;
use serde_json::{Value, json};

const FOREGROUND_METHODS: [&str; 12] = [
    "ui.ready",
    "storage.get",
    "storage.list",
    "storage.commit",
    "services.request",
    "website.open",
    "website.close",
    "source.navigate",
    "source.intent",
    "back.handled",
    "back.leave",
    "navigation.save",
];
const SOURCE_METHODS: [&str; 2] = ["source.publish", "source.intentResult"];
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
        if view.role == Role::Website || self.surfaces.session.as_ref().is_none_or(|s| s.applet_id != view.applet_id) {
            return;
        }
        let Ok(message) = serde_json::from_str::<DocumentMessage>(payload) else { return };
        match message {
            DocumentMessage::Hello { url } => self.hello(view, url),
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

    fn hello(&mut self, view: ViewRef, url: String) {
        let Some(manifest) = self.active_manifest().cloned() else { return };
        let session = self.surfaces.session.as_ref().expect("active session");
        let source_id = match &view.role {
            Role::Source(id) if manifest.sources.iter().any(|s| &s.id == id) => Some(id.clone()),
            Role::Source(_) | Role::Website => return,
            Role::Foreground => None,
        };
        let state = match &source_id {
            Some(id) => json!({ "url": session.source_urls.get(id) }),
            None => json!({
                "website": { "open": session.website.is_some(), "url": session.website },
                "snapshots": session.snapshots,
                "sourceUrls": session.source_urls,
                "restored": session.restored,
                "navigation": if session.restored { session.navigation.clone() } else { None },
            }),
        };
        let revision = session.revision;
        let (document_id, retired) = self.documents.bind(&view, &url);
        if let Some(retired) = retired.filter(|_| source_id.is_some()) {
            self.fail_intents_for(&retired, ErrorCode::SourceReplaced);
        }
        // A source's ready deadline stays until it publishes something other than `loading`.
        if let Some(session) = self.surfaces.session.as_mut().filter(|_| source_id.is_none()) {
            session.restored = false;
            session.navigation = None;
        }
        let role = if source_id.is_some() { "source" } else { "foreground" };
        let bound = HostMessage::Bound {
            document_id,
            applet_id: view.applet_id.clone(),
            role: role.into(),
            source_id,
            revision,
            manifest: Box::new(manifest),
            limits: self.limits.clone(),
            state,
        };
        self.post(&view, &bound);
    }

    fn call(&mut self, view: &ViewRef, document_id: &str, request_id: u64, method: &str, params: Value, now: u64) -> Outcome {
        let allowed: &[&str] = if view.role == Role::Foreground { &FOREGROUND_METHODS } else { &SOURCE_METHODS };
        if !allowed.contains(&method) {
            let known = FOREGROUND_METHODS.contains(&method) || SOURCE_METHODS.contains(&method);
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
        let Some(manifest) = self.active_manifest().cloned() else {
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
                if let Some(session) = self.surfaces.session.as_mut().filter(|s| !s.revealed) {
                    session.revealed = true;
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
            Call::WebsiteOpen { url } => match https_url(&url) {
                Some(url) => {
                    self.open_website(url);
                    ok()
                }
                None => error(ErrorCode::InvalidArgument, "website.open needs an https URL"),
            },
            Call::WebsiteClose {} => {
                self.close_website();
                ok()
            }
            Call::SourceNavigate { source_id, url } => {
                if !manifest.sources.iter().any(|s| s.id == source_id) {
                    return error(ErrorCode::NotFound, format!("Unknown source {source_id}"));
                }
                let Some(url) = https_url(&url).filter(|u| declared(&manifest, u)) else {
                    return error(ErrorCode::OriginNotDeclared, "The URL is not on a declared origin");
                };
                let ready_ms = self.limits.document_ready_ms;
                if let Some(session) = self.surfaces.session.as_mut() {
                    session.source_urls.insert(source_id.clone(), url.clone());
                    session.ready_deadlines.insert(source_id.clone(), now + ready_ms);
                }
                let view = self.source_view(&source_id).expect("active session");
                self.retire_document(&view);
                self.out.push(ShellCommand::LoadUrl { view, url });
                ok()
            }
            Call::SourceIntent { source_id, intent } => {
                let Some(source_view) = self.source_view(&source_id) else {
                    return error(ErrorCode::NotFound, format!("Unknown source {source_id}"));
                };
                let Some(source_document) = self.documents.current(&source_view).map(|d| d.id.clone()) else {
                    return error(ErrorCode::NotReady, "The source page is not ready");
                };
                if pending(self) {
                    return error(ErrorCode::QuotaExceeded, "Too many pending requests");
                }
                let intent_id = self.documents.begin_intent(Intent {
                    foreground_document: document_id.into(),
                    source_id,
                    source_document,
                    deadline_ms: now + self.limits.intent_timeout_ms,
                });
                self.event(&source_view, "intent", json!({ "intentId": intent_id, "intent": intent }));
                Outcome::Now(Ok(json!({ "intentId": intent_id })))
            }
            Call::SourcePublish { snapshot } => {
                let Role::Source(source_id) = &view.role else { unreachable!() };
                let size = serde_json::to_vec(&snapshot).map(|b| b.len()).unwrap_or(usize::MAX);
                if size > self.limits.snapshot_max_bytes {
                    return error(ErrorCode::SnapshotTooLarge, "The snapshot is too large");
                }
                let content = snapshot.get("status").and_then(Value::as_str) != Some("loading");
                if let Some(session) = self.surfaces.session.as_mut().filter(|_| content) {
                    session.ready_deadlines.remove(source_id);
                }
                self.publish_snapshot(source_id, snapshot);
                ok()
            }
            Call::SourceIntentResult { intent_id, ok: succeeded, error: failure } => {
                let mine = self.documents.intents.get(&intent_id).is_some_and(|i| i.source_document == document_id);
                if let Some(intent) = mine.then(|| self.documents.intents.remove(&intent_id)).flatten() {
                    debug_assert!(view.role == Role::Source(intent.source_id.clone()));
                    self.intent_result(&intent.foreground_document, intent_id, succeeded, failure);
                }
                ok()
            }
            Call::BackHandled { handled } => {
                self.back_answered(document_id, handled);
                ok()
            }
            Call::NavigationSave { navigation } => {
                if let Some(session) = self.surfaces.session.as_mut() {
                    session.navigation = Some(navigation);
                }
                ok()
            }
            Call::BackLeave {} => {
                // Answer before Home retires the document.
                self.respond(view, document_id, request_id, Ok(json!({})));
                self.home();
                Outcome::Later
            }
        }
    }
}

/// The URL without its fragment, when it is https without credentials.
fn https_url(value: &str) -> Option<String> {
    let mut url = url::Url::parse(value).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() || url.host_str().is_none() {
        return None;
    }
    url.set_fragment(None);
    Some(url.into())
}

fn declared(manifest: &Manifest, url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|u| manifest.origins.contains(&u.origin().ascii_serialization()))
}
