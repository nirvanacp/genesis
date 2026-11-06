//! The host core: turns shell events into shell commands.
use crate::{
    applets::{self, Applets},
    documents::Documents,
    imports, storage_worker,
    surfaces::{BackSlot, Session, Surfaces},
};
use genesis_contracts::*;
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// An applet in the background longer than this is retired and recreated on resume.
const SUSPEND_RETIRE_MS: u64 = 30_000;

#[derive(Default)]
pub struct Host {
    pub files_dir: Option<PathBuf>,
    pub limits: Limits,
    pub applets: Applets,
    pub documents: Documents,
    pub surfaces: Surfaces,
    pub out: Vec<ShellCommand>,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl Host {
    pub fn dispatch(&mut self, event: ShellEvent) -> Result<Vec<ShellCommand>, String> {
        let now = now_ms();
        match event {
            ShellEvent::Attach { files_dir } => {
                self.surfaces = Surfaces::default();
                self.documents = Documents::default();
                self.applets = Applets::load(Path::new(&files_dir));
                self.files_dir = Some(files_dir.into());
                self.show_launcher();
            }
            ShellEvent::Resumed => self.resumed(now),
            ShellEvent::Suspended => {
                self.surfaces.suspended_at_ms = Some(now);
                self.broadcast("suspended", json!({}));
            }
            ShellEvent::Back { website_can_go_back } => self.back(website_can_go_back, now),
            ShellEvent::WebsiteReturn => self.close_website(),
            ShellEvent::OpenApplet { applet_id } => {
                self.retire_active();
                self.activate(&applet_id, false, now);
            }
            ShellEvent::Home => self.home(),
            ShellEvent::Menu { action } => self.menu(action, now),
            ShellEvent::DocumentLoaded { view, url } => self.document_loaded(view, url, now),
            ShellEvent::DocumentMessage { view, payload } => self.document_message(view, &payload, now),
            ShellEvent::WebsiteUrlChanged { url } => {
                if let Some(session) = self.surfaces.session.as_mut().filter(|s| s.website.is_some()) {
                    session.website = Some(url.clone());
                    self.foreground_event("website", json!({ "open": true, "url": url }));
                }
            }
            ShellEvent::ImportFound { kind: ImportKind::Bundle, path, payload } => self.import_bundle(&path, &payload, now),
            ShellEvent::ServiceResponse { request_id, status, body } => {
                self.finish_op(request_id, None, Ok(crate::services::result(status, body)));
            }
            ShellEvent::ServiceFailed { request_id, code, message } => {
                self.finish_op(request_id, None, Err(ErrorBody::new(code, message)));
            }
            ShellEvent::StorageCompleted { payload } => self.storage_completed(&payload)?,
            ShellEvent::Tick => self.tick(now),
        }
        Ok(std::mem::take(&mut self.out))
    }

    // -----------------------------------------------------------------------------------------
    // Messages to documents

    pub fn post(&mut self, view: &ViewRef, message: &HostMessage) {
        if let Ok(payload) = serde_json::to_string(message) {
            self.out.push(ShellCommand::PostMessage { view: view.clone(), payload });
        }
    }

    pub fn respond(&mut self, view: &ViewRef, document_id: &str, request_id: u64, outcome: Result<Value, ErrorBody>) {
        let (result, error) = match outcome {
            Ok(value) => (Some(value), None),
            Err(error) => (None, Some(error)),
        };
        let message = HostMessage::Response { document_id: document_id.into(), request_id, result, error };
        self.post(view, &message);
    }

    pub fn event(&mut self, view: &ViewRef, name: &str, data: Value) {
        let Some(document) = self.documents.current(view) else { return };
        let message = HostMessage::Event { document_id: document.id.clone(), name: name.into(), data };
        self.post(view, &message);
    }

    pub fn foreground_view(&self) -> Option<ViewRef> {
        let session = self.surfaces.session.as_ref()?;
        Some(ViewRef { applet_id: session.applet_id.clone(), role: Role::Foreground })
    }

    pub fn source_view(&self, source_id: &str) -> Option<ViewRef> {
        let session = self.surfaces.session.as_ref()?;
        Some(ViewRef { applet_id: session.applet_id.clone(), role: Role::Source(source_id.into()) })
    }

    pub fn foreground_event(&mut self, name: &str, data: Value) {
        if let Some(view) = self.foreground_view() {
            self.event(&view, name, data);
        }
    }

    fn broadcast(&mut self, name: &str, data: Value) {
        let Some(manifest) = self.active_manifest().cloned() else { return };
        self.foreground_event(name, data.clone());
        for source in &manifest.sources {
            if let Some(view) = self.source_view(&source.id) {
                self.event(&view, name, data.clone());
            }
        }
    }

    pub fn active_manifest(&self) -> Option<&Manifest> {
        let session = self.surfaces.session.as_ref()?;
        self.applets.get(&session.applet_id).map(|i| &i.manifest)
    }

    // -----------------------------------------------------------------------------------------
    // Applet lifecycle

    fn show_launcher(&mut self) {
        self.out.push(ShellCommand::ShowLauncher { applets: self.applets.launcher() });
    }

    pub fn home(&mut self) {
        self.retire_active();
        self.show_launcher();
    }

    pub fn activate(&mut self, applet_id: &str, restored: bool, now: u64) {
        let Some(installed) = self.applets.get(applet_id) else {
            self.out.push(ShellCommand::ShowError { message: format!("Applet {applet_id} is not installed") });
            return self.show_launcher();
        };
        let (revision, manifest) = (installed.revision, installed.manifest.clone());
        let mut scripts = Vec::new();
        for source in &manifest.sources {
            match self.applets.read_text(applet_id, revision, &format!("sources/{}.js", source.id)) {
                Ok(script) => scripts.push(script),
                Err(message) => {
                    self.out.push(ShellCommand::ShowError { message });
                    return self.show_launcher();
                }
            }
        }
        let mut session = Session::new(applet_id.into(), revision, restored);
        self.out.push(ShellCommand::ShowApplet {
            applet_id: applet_id.into(),
            name: manifest.name.clone(),
            accent: manifest.shell.as_ref().and_then(|s| s.accent.clone()),
        });
        self.out.push(ShellCommand::CreateView {
            view: ViewRef { applet_id: applet_id.into(), role: Role::Foreground },
            url: self.applets.foreground_url(applet_id, revision),
            origins: vec![FOREGROUND_ORIGIN.into()],
            start_script: None,
        });
        for (source, script) in manifest.sources.iter().zip(scripts) {
            session.source_urls.insert(source.id.clone(), source.start_url.clone());
            session.ready_deadlines.insert(source.id.clone(), now + self.limits.document_ready_ms);
            self.out.push(ShellCommand::CreateView {
                view: ViewRef { applet_id: applet_id.into(), role: Role::Source(source.id.clone()) },
                url: source.start_url.clone(),
                origins: manifest.origins.clone(),
                start_script: Some(script),
            });
        }
        self.surfaces.session = Some(session);
        self.surfaces.suspended_at_ms = None;
    }

    /// Destroys the active applet's views. Documents receive `retired` first.
    pub fn retire_active(&mut self) {
        let Some(session) = self.surfaces.session.take() else { return };
        let views = self.documents.retire_applet(&session.applet_id);
        for (view, document_id) in &views {
            let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
            self.post(view, &message);
        }
        if session.website.is_some() {
            self.out.push(ShellCommand::HideWebsite);
        }
        let mut roles = vec![Role::Foreground];
        roles.extend(session.source_urls.keys().map(|id| Role::Source(id.clone())));
        for role in roles {
            self.out.push(ShellCommand::DestroyView { view: ViewRef { applet_id: session.applet_id.clone(), role } });
        }
    }

    fn resumed(&mut self, now: u64) {
        self.retire_if_long_suspended(now);
        self.surfaces.suspended_at_ms = None;
        if let Some(applet_id) = self.surfaces.resume_applet.take() {
            self.activate(&applet_id, true, now);
        } else if self.surfaces.session.is_some() {
            self.broadcast("resumed", json!({}));
        }
    }

    fn retire_if_long_suspended(&mut self, now: u64) {
        let long = self.surfaces.suspended_at_ms.is_some_and(|at| now.saturating_sub(at) >= SUSPEND_RETIRE_MS);
        if let (true, Some(session)) = (long, self.surfaces.session.as_ref()) {
            self.surfaces.resume_applet = Some(session.applet_id.clone());
            self.retire_active();
        }
    }

    fn menu(&mut self, action: MenuAction, now: u64) {
        let Some(session) = self.surfaces.session.as_ref() else { return };
        let applet_id = session.applet_id.clone();
        let revision = session.revision;
        let first_source = session.source_urls.values().next().cloned();
        match action {
            MenuAction::Home => self.home(),
            MenuAction::Reload => {
                self.retire_active();
                self.activate(&applet_id, false, now);
            }
            MenuAction::OpenWebsite => {
                let url = first_source.or_else(|| self.active_manifest().and_then(|m| m.origins.first().cloned()));
                if let Some(url) = url {
                    self.open_website(url);
                }
            }
            MenuAction::Info => {
                let Some(manifest) = self.active_manifest() else { return };
                let message = format!("{applet_id}, revision {revision}\nWebsites: {}", manifest.origins.join(", "));
                let title = manifest.name.clone();
                self.out.push(ShellCommand::ShowInfo { title, message });
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // Website sheet and Back

    /// Opens the sheet. It stays on the declared origins plus the origin it was opened at.
    pub fn open_website(&mut self, url: String) {
        let Some(manifest) = self.active_manifest() else { return };
        let (title, mut origins) = (manifest.name.clone(), manifest.origins.clone());
        if let Ok(parsed) = url::Url::parse(&url) {
            let origin = parsed.origin().ascii_serialization();
            if !origins.contains(&origin) {
                origins.push(origin);
            }
        }
        if let Some(session) = self.surfaces.session.as_mut() {
            session.website = Some(url.clone());
        }
        self.out.push(ShellCommand::ShowWebsite { url: url.clone(), title, origins });
        self.foreground_event("website", json!({ "open": true, "url": url }));
    }

    pub fn close_website(&mut self) {
        let Some(session) = self.surfaces.session.as_mut() else { return };
        if session.website.take().is_some() {
            self.out.push(ShellCommand::HideWebsite);
            self.foreground_event("website", json!({ "open": false, "url": null }));
        }
    }

    fn back(&mut self, website_can_go_back: bool, now: u64) {
        let Some(session) = self.surfaces.session.as_mut() else {
            return self.out.push(ShellCommand::MoveTaskToBack);
        };
        if session.website.is_some() {
            if website_can_go_back {
                self.out.push(ShellCommand::WebsiteBack);
            } else {
                self.close_website();
            }
            return;
        }
        if session.back.is_some() {
            return; // A second Back while the foreground decides is ignored.
        }
        let Some(view) = self.foreground_view() else { return };
        let Some(document_id) = self.documents.current(&view).map(|d| d.id.clone()) else {
            return self.home();
        };
        let delay_ms = self.limits.back_answer_ms;
        if let Some(session) = self.surfaces.session.as_mut() {
            session.back = Some(BackSlot { document_id, deadline_ms: now + delay_ms });
        }
        self.event(&view, "back", json!({}));
        self.out.push(ShellCommand::Wake { delay_ms });
    }

    pub fn back_answered(&mut self, document_id: &str, handled: bool) {
        let Some(session) = self.surfaces.session.as_mut() else { return };
        if session.back.as_ref().is_some_and(|slot| slot.document_id == document_id) {
            session.back = None;
            if !handled {
                self.home();
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // Sources

    fn document_loaded(&mut self, view: ViewRef, url: String, now: u64) {
        let Role::Source(source_id) = &view.role else { return };
        // The new document's hello may arrive before this event; then it already holds the deadline
        // or has published, and a deadline set now could overwrite its content with NOT_READY.
        let without_fragment = |u: &str| u.split('#').next().unwrap_or_default().to_owned();
        if self.documents.current(&view).is_some_and(|d| without_fragment(&d.url) == without_fragment(&url)) {
            return;
        }
        let ready_ms = self.limits.document_ready_ms;
        if let Some(session) = self.surfaces.session.as_mut().filter(|s| s.applet_id == view.applet_id) {
            session.ready_deadlines.insert(source_id.clone(), now + ready_ms);
        }
    }

    /// Retires a source's document before it loads a new URL. Until the next document says
    /// hello, the source publishes nothing and takes no intents, so every snapshot labeled with the
    /// requested URL comes from the document that loaded it.
    pub fn retire_document(&mut self, view: &ViewRef) {
        let Some(document_id) = self.documents.retire(view) else { return };
        let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
        self.post(view, &message);
        self.fail_intents_for(&document_id, ErrorCode::SourceReplaced);
    }

    /// Records a snapshot for the source and forwards it to the foreground.
    pub fn publish_snapshot(&mut self, source_id: &str, snapshot: Value) {
        let Some(session) = self.surfaces.session.as_mut() else { return };
        let requested_url = session.source_urls.get(source_id).cloned();
        let data = json!({ "sourceId": source_id, "requestedUrl": requested_url, "snapshot": snapshot });
        session.snapshots.insert(source_id.into(), data.clone());
        self.foreground_event("snapshot", data);
    }

    /// Fails every intent sent to `source_document`, which a new document replaced.
    pub fn fail_intents_for(&mut self, source_document: &str, code: ErrorCode) {
        let intents = self.documents.take_intents(|i| i.source_document == source_document);
        for (intent_id, intent) in intents {
            self.intent_result(&intent.foreground_document, intent_id, false, Some(json!(ErrorBody::new(code, "The source page changed"))));
        }
    }

    pub fn intent_result(&mut self, foreground_document: &str, intent_id: u64, ok: bool, error: Option<Value>) {
        let Some(view) = self.foreground_view() else { return };
        if self.documents.is_current(&view, foreground_document) {
            self.event(&view, "intent.result", json!({ "intentId": intent_id, "ok": ok, "error": error }));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Pending operations and deadlines

    pub fn finish_op(&mut self, op_id: u64, applet_id: Option<&str>, outcome: Result<Value, ErrorBody>) {
        if let Some(op) = self.documents.finish_op(op_id, applet_id) {
            self.respond(&op.view, &op.document_id, op.request_id, outcome);
        }
    }

    pub fn submit_storage(&mut self, op_id: u64, applet_id: &str, operation: StorageOperation) {
        let job = StorageJob { job_id: op_id, applet_id: applet_id.into(), operation };
        if !storage_worker::submit(job) {
            self.finish_op(op_id, None, Err(ErrorBody::new(ErrorCode::StorageFailure, "Storage is busy or unavailable")));
        }
    }

    fn storage_completed(&mut self, payload: &str) -> Result<(), String> {
        let completion: StorageCompletion = serde_json::from_str(payload).map_err(|e| e.to_string())?;
        let outcome = match (completion.result, completion.error) {
            (Some(result), None) => Ok(result),
            (_, error) => Err(error.unwrap_or_else(|| ErrorBody::new(ErrorCode::StorageFailure, "Empty storage result"))),
        };
        let namespace_revision = outcome.as_ref().ok().and_then(|r| r.get("namespaceRevision").cloned());
        self.finish_op(completion.job_id, Some(&completion.applet_id), outcome);
        let active = self.surfaces.session.as_ref().is_some_and(|s| s.applet_id == completion.applet_id);
        if active && !completion.changed.is_empty() {
            self.foreground_event("storage.changed", json!({ "changes": completion.changed, "namespaceRevision": namespace_revision }));
        }
        Ok(())
    }

    fn tick(&mut self, now: u64) {
        for op in self.documents.expired_ops(now) {
            let error = ErrorBody::new(ErrorCode::Deadline, "The request took too long");
            self.respond(&op.view, &op.document_id, op.request_id, Err(error));
        }
        for (intent_id, intent) in self.documents.take_intents(|i| i.deadline_ms <= now) {
            let error = json!(ErrorBody::new(ErrorCode::Deadline, "The page did not finish the action in time"));
            self.intent_result(&intent.foreground_document, intent_id, false, Some(error));
        }
        let Some(session) = self.surfaces.session.as_mut() else { return };
        if session.back.as_ref().is_some_and(|slot| slot.deadline_ms <= now) {
            session.back = None;
            return self.home();
        }
        let late: Vec<String> = session.ready_deadlines.iter().filter(|(_, d)| **d <= now).map(|(id, _)| id.clone()).collect();
        for source_id in late {
            if let Some(session) = self.surfaces.session.as_mut() {
                session.ready_deadlines.remove(&source_id);
            }
            let url = self.surfaces.session.as_ref().and_then(|s| s.source_urls.get(&source_id).cloned());
            let snapshot = json!({
                "documentId": null, "url": url, "routeId": null, "params": {}, "status": "error",
                "error": { "code": ErrorCode::NotReady, "message": "The page did not load in time" },
            });
            self.publish_snapshot(&source_id, snapshot);
        }
        self.retire_if_long_suspended(now);
    }

    // -----------------------------------------------------------------------------------------
    // Imports

    fn import_bundle(&mut self, path: &str, payload: &str, now: u64) {
        let outcome = serde_json::from_str::<BundleImport>(payload)
            .map_err(|e| format!("Invalid bundle import: {e}"))
            .and_then(|import| {
                let files = imports::verify(&import)?;
                let revision = self.applets.install(&import.bundle, files)?;
                Ok((import.bundle.manifest.id, revision))
            });
        let receipt = match &outcome {
            Ok((applet_id, revision)) => json!({ "ok": true, "appletId": applet_id, "revision": revision }),
            Err(error) => json!({ "ok": false, "error": error }),
        };
        let receipt_path = path.strip_suffix(".json").unwrap_or(path).to_owned() + ".receipt.json";
        let _ = applets::write_atomic(Path::new(&receipt_path), receipt.to_string().as_bytes());
        let _ = std::fs::remove_file(path);
        match outcome {
            Ok((applet_id, _)) => {
                let active = self.surfaces.session.as_ref().map(|s| s.applet_id.clone());
                if active.as_deref() == Some(applet_id.as_str()) {
                    self.retire_active();
                    self.activate(&applet_id, false, now);
                } else if active.is_none() {
                    self.show_launcher();
                }
            }
            Err(message) => self.out.push(ShellCommand::ShowError { message }),
        }
    }
}
