//! The host core: turns shell events into shell commands.
use crate::{
    applets::{self, Applets},
    contexts::{BackSlot, ContextView, Contexts, Resume, Session},
    documents::Documents,
    flows::{Deletion, Flow, Updates, erasing_message},
    storage_worker,
};
use genesis_contracts::*;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// An applet in the background longer than this is retired and recreated on resume.
const SUSPEND_RETIRE_MS: u64 = 30_000;
/// The limit while a context is revealed: while the user is on a website, for sign-in codes,
/// file pickers and other apps they return from.
const REVEALED_RETIRE_MS: u64 = 600_000;

#[derive(Default)]
pub struct Host {
    pub files_dir: Option<PathBuf>,
    pub limits: Limits,
    pub applets: Applets,
    pub documents: Documents,
    pub contexts: Contexts,
    pub out: Vec<ShellCommand>,
    /// A debuggable APK accepts development builds from `genesis-import/`.
    pub debuggable: bool,
    /// The running add, review or update flow.
    pub flow: Option<Flow>,
    pub updates: Updates,
    /// Epoch seconds until which GitHub API calls are refused.
    pub rate_reset_s: u64,
    pub next_request: u64,
    /// Storage jobs erasing an applet's data, by job id, with the install or removal that waits for them.
    pub deletions: HashMap<u64, Deletion>,
}

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl Host {
    pub fn dispatch(&mut self, event: ShellEvent) -> Result<Vec<ShellCommand>, String> {
        let now = now_ms();
        match event {
            ShellEvent::Attach { files_dir, debuggable } => {
                // A new Activity has none of the old flow's screens.
                self.end_flow();
                self.contexts = Contexts::default();
                self.documents = Documents::default();
                self.applets = Applets::load(Path::new(&files_dir));
                self.files_dir = Some(files_dir.into());
                self.debuggable = debuggable;
                self.load_updates();
                self.show_launcher();
            }
            ShellEvent::Resumed => self.resumed(now),
            ShellEvent::Suspended => {
                self.contexts.suspended_at_ms = Some(now);
                self.broadcast("suspended", json!({}));
            }
            ShellEvent::Back => self.back(now),
            ShellEvent::WebsiteDone => self.website_done(),
            ShellEvent::OpenApplet { applet_id } => {
                self.retire_active();
                let resume = self.contexts.resume.take().filter(|r| r.applet_id == applet_id);
                self.activate(&applet_id, resume, None);
            }
            ShellEvent::OpenUrl { url, applet_id } => self.open_url(&url, applet_id),
            ShellEvent::Home => self.home(),
            ShellEvent::Menu { action } => self.menu(action),
            ShellEvent::DocumentStarted { view, url } => self.document_started(view, url, now),
            ShellEvent::DocumentMessage { view, payload } => self.document_message(view, &payload, now),
            ShellEvent::ContextNavigated { view, url, index, size, can_go_back, can_go_forward, same_document, reload } => {
                let reported = ContextView { url, index, size, can_go_back, can_go_forward, navigating_since: None };
                self.context_navigated(view, reported, same_document, reload);
            }
            ShellEvent::RendererGone { view } => self.renderer_gone(&view),
            ShellEvent::HistoryUnmoved { view } => self.history_unmoved(&view),
            ShellEvent::ImportFound { kind: ImportKind::Bundle, path, payload, release: _ } => self.import_dev(&path, &payload),
            ShellEvent::ImportFound { kind: ImportKind::Bundled, path, payload, release } => {
                self.import_bundled(&path, &payload, release.as_deref())
            }
            ShellEvent::ServiceResponse { request_id, status, body } => {
                self.finish_op(request_id, None, Ok(crate::services::result(status, body)));
            }
            ShellEvent::ServiceFailed { request_id, code, message } => {
                self.finish_op(request_id, None, Err(ErrorBody::new(code, message)));
            }
            ShellEvent::StorageCompleted { payload } => self.storage_completed(&payload)?,
            ShellEvent::Tick => self.tick(now),
            event @ ShellEvent::FetchCompleted { .. } => self.fetch_completed(event),
            ShellEvent::AddFromRepository { input } => self.add_from_repository(&input),
            ShellEvent::ReviewFile { path, release } => self.review_file(&path, release.as_deref()),
            ShellEvent::ChooseCandidate { applet_id, version } => self.choose_candidate(&applet_id, version.as_deref()),
            ShellEvent::ReviewDecision { review_id, accept, replace } => self.review_decision(&review_id, accept, replace),
            ShellEvent::CheckUpdates { applet_id, manual } => self.check_updates(applet_id, manual),
            ShellEvent::CancelFlow => self.cancel_flow(),
            ShellEvent::RemoveApplet { applet_id } => self.remove_applet(&applet_id),
            ShellEvent::ClearData { applet_id } => self.clear_data(&applet_id),
            ShellEvent::KeepVersion { applet_id } => self.keep_version(&applet_id),
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
        let session = self.contexts.session.as_ref()?;
        Some(ViewRef { applet_id: session.applet_id.clone(), role: Role::Foreground })
    }

    /// The view of a context the active applet declares.
    pub fn context_view(&self, context_id: &str) -> Option<ViewRef> {
        let session = self.contexts.session.as_ref()?;
        session.contexts.contains_key(context_id).then(|| ViewRef {
            applet_id: session.applet_id.clone(),
            role: Role::Context(context_id.into()),
        })
    }

    pub fn context_mut(&mut self, context_id: &str) -> Option<&mut ContextView> {
        self.contexts.session.as_mut()?.contexts.get_mut(context_id)
    }

    pub fn foreground_event(&mut self, name: &str, data: Value) {
        if let Some(view) = self.foreground_view() {
            self.event(&view, name, data);
        }
    }

    fn broadcast(&mut self, name: &str, data: Value) {
        let Some(session) = self.contexts.session.as_ref() else { return };
        let ids: Vec<String> = session.contexts.keys().cloned().collect();
        self.foreground_event(name, data.clone());
        for id in ids {
            if let Some(view) = self.context_view(&id) {
                self.event(&view, name, data.clone());
            }
        }
    }

    /// The active applet's revision and manifest.
    pub fn active_manifest(&self) -> Option<(u64, &Manifest)> {
        let session = self.contexts.session.as_ref()?;
        self.applets.current(&session.applet_id)
    }

    // -----------------------------------------------------------------------------------------
    // Applet lifecycle

    pub fn show_launcher(&mut self) {
        let updates_checked_at = self.updates_checked_at();
        self.out.push(ShellCommand::ShowLauncher { applets: self.launcher_entries(), updates_checked_at });
    }

    /// Sends the launcher entries without leaving the open applet.
    pub fn update_applets(&mut self) {
        let updates_checked_at = self.updates_checked_at();
        self.out.push(ShellCommand::UpdateApplets { applets: self.launcher_entries(), updates_checked_at });
    }

    /// Leaves the applet. A pending recreation is forgotten with it.
    pub fn home(&mut self) {
        self.contexts.resume = None;
        self.retire_active();
        self.show_launcher();
    }

    /// Opens a website link in the applet that declares its site. Several applets ask the user to
    /// pick one; the link opens in the context that starts on its site, or the first context.
    fn open_url(&mut self, url: &str, chosen: Option<String>) {
        let info = |message: String| ShellCommand::ShowInfo { title: "Genesis".into(), message };
        let Some(mut parsed) = url::Url::parse(url.trim()).ok().filter(|u| matches!(u.scheme(), "http" | "https")) else {
            return self.out.push(info("Genesis opens only website links".into()));
        };
        if parsed.scheme() == "http" && parsed.set_scheme("https").is_err() {
            return self.out.push(info("Genesis opens only website links".into()));
        }
        let origin = parsed.origin().ascii_serialization();
        let host = parsed.host_str().unwrap_or_default().to_string();
        let url = parsed.to_string();
        let candidates: Vec<String> =
            self.applets.for_origin(&origin).into_iter().filter(|id| !self.erasing(id)).collect();
        let applet_id = match (chosen, candidates.as_slice()) {
            (Some(id), _) if candidates.contains(&id) => id,
            (_, []) => return self.out.push(info(format!("No applet uses {host}"))),
            (_, [only]) => only.clone(),
            _ => {
                let applets = candidates.iter().filter_map(|id| self.applets.entry(id)).collect();
                return self.out.push(ShellCommand::ChooseApplet { url, applets });
            }
        };
        let Some((_, manifest)) = self.applets.current(&applet_id) else { return };
        let starts_here = manifest.contexts.iter().find(|c| applets::origin_of(&c.start_url).as_deref() == Some(&origin));
        let Some(context) = starts_here.or(manifest.contexts.first()).map(|c| c.id.clone()) else { return };
        let active = self.contexts.session.as_ref().is_some_and(|s| s.applet_id == applet_id);
        if active {
            let view = ViewRef { applet_id, role: Role::Context(context.clone()) };
            self.out.push(ShellCommand::LoadUrl { view, url, mode: NavigateMode::Push });
            return self.foreground_event("user.viewWebsite", json!({ "id": context }));
        }
        self.retire_active();
        let resume = self.contexts.resume.take().filter(|r| r.applet_id == applet_id);
        self.activate(&applet_id, resume, Some((context.clone(), url)));
        if let Some(session) = self.contexts.session.as_mut().filter(|s| s.applet_id == applet_id) {
            session.open_website = Some(context);
        }
    }

    /// Starts an applet, or recreates it from `resume` at its contexts' last committed URLs.
    /// `opening` loads one context at a shared link instead. An incompatible applet answers the
    /// status sheet and does not start.
    pub fn activate(&mut self, applet_id: &str, resume: Option<Resume>, opening: Option<(String, String)>) {
        if self.erasing(applet_id) {
            self.out.push(ShellCommand::ShowError { message: erasing_message(applet_id) });
            return self.show_launcher();
        }
        let Some((revision, manifest)) = self.applets.current(applet_id).map(|(r, m)| (r, m.clone())) else {
            match self.applets.entry(applet_id) {
                Some(entry) => self.out.push(ShellCommand::ShowStatus {
                    kind: StatusKind::Incompatible,
                    details: incompatible_details(&entry),
                    applet: Some(entry),
                }),
                None => self.out.push(ShellCommand::ShowError { message: format!("Applet {applet_id} is not installed") }),
            }
            return self.show_launcher();
        };
        let script = match self.applets.read_text(applet_id, revision, "adapter.js") {
            Ok(script) => script,
            Err(message) => {
                self.out.push(ShellCommand::ShowError { message });
                return self.show_launcher();
            }
        };
        let mut session = Session::new(applet_id.into(), revision, resume.is_some());
        let (mut urls, saved) = resume.map(|r| (r.urls, r.saved)).unwrap_or_default();
        urls.extend(opening);
        session.saved = saved;
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
        for context in &manifest.contexts {
            let url = urls.get(&context.id).cloned().unwrap_or_else(|| context.start_url.clone());
            let view = ContextView { url: url.clone(), index: 0, size: 0, can_go_back: false, can_go_forward: false, navigating_since: None };
            session.contexts.insert(context.id.clone(), view);
            self.out.push(ShellCommand::CreateView {
                view: ViewRef { applet_id: applet_id.into(), role: Role::Context(context.id.clone()) },
                url,
                origins: manifest.origins.clone(),
                start_script: Some(script.clone()),
            });
        }
        self.contexts.session = Some(session);
        self.contexts.suspended_at_ms = None;
    }

    /// Destroys the active applet's views. Documents receive `retired` first.
    pub fn retire_active(&mut self) {
        let Some(session) = self.contexts.session.take() else { return };
        let views = self.documents.retire_applet(&session.applet_id);
        for (view, document_id) in &views {
            let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
            self.post(view, &message);
        }
        if session.revealed.is_some() {
            self.out.push(ShellCommand::CoverContext);
        }
        let mut roles = vec![Role::Foreground];
        roles.extend(session.contexts.keys().map(|id| Role::Context(id.clone())));
        for role in roles {
            self.out.push(ShellCommand::DestroyView { view: ViewRef { applet_id: session.applet_id.clone(), role } });
        }
    }

    /// Retires the active applet and keeps what recreating it needs.
    fn retire_for_resume(&mut self, on_resume: bool) {
        let Some(session) = self.contexts.session.as_ref() else { return };
        self.contexts.resume = Some(Resume {
            applet_id: session.applet_id.clone(),
            urls: session.contexts.iter().map(|(id, c)| (id.clone(), c.url.clone())).collect::<BTreeMap<_, _>>(),
            saved: session.saved.clone(),
            on_resume,
        });
        self.retire_active();
    }

    fn resumed(&mut self, now: u64) {
        self.retire_if_long_suspended(now);
        self.contexts.suspended_at_ms = None;
        if self.contexts.resume.as_ref().is_some_and(|r| r.on_resume) {
            let resume = self.contexts.resume.take().expect("checked above");
            let applet_id = resume.applet_id.clone();
            self.activate(&applet_id, Some(resume), None);
        } else if self.contexts.session.is_some() {
            self.broadcast("resumed", json!({}));
        }
    }

    fn retire_if_long_suspended(&mut self, now: u64) {
        // `revealed` does not change while suspended, so this is the state the user left in.
        let revealed = self.contexts.session.as_ref().is_some_and(|s| s.revealed.is_some());
        let limit = if revealed { REVEALED_RETIRE_MS } else { SUSPEND_RETIRE_MS };
        let long = self.contexts.suspended_at_ms.is_some_and(|at| now.saturating_sub(at) >= limit);
        if long && self.contexts.session.is_some() {
            self.retire_for_resume(true);
        }
    }

    fn menu(&mut self, action: MenuAction) {
        let Some(session) = self.contexts.session.as_ref() else { return };
        let (applet_id, revision, revealed) = (session.applet_id.clone(), session.revision, session.revealed.clone());
        match action {
            MenuAction::Home => self.home(),
            MenuAction::Reload => {
                self.retire_active();
                self.activate(&applet_id, None, None);
            }
            // The foreground pins its active context when `id` is null.
            MenuAction::ViewWebsite => self.foreground_event("user.viewWebsite", json!({ "id": revealed })),
            MenuAction::Info => {
                let Some((_, manifest)) = self.active_manifest() else { return };
                let message = format!("{applet_id}, revision {revision}\nWebsites: {}", manifest.origins.join(", "));
                let title = manifest.name.clone();
                self.out.push(ShellCommand::ShowInfo { title, message });
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // Reveal and Back

    pub fn reveal(&mut self, context_id: &str, view: ViewRef, title: &str) {
        let Some(session) = self.contexts.session.as_mut() else { return };
        if session.revealed.as_deref() == Some(context_id) {
            return;
        }
        if session.revealed.replace(context_id.into()).is_some() {
            self.out.push(ShellCommand::CoverContext);
        }
        self.out.push(ShellCommand::RevealContext { view, title: title.into() });
    }

    pub fn cover(&mut self) {
        if self.contexts.session.as_mut().and_then(|s| s.revealed.take()).is_some() {
            self.out.push(ShellCommand::CoverContext);
        }
    }

    /// Done on the website bar. The foreground decides the presentation; without one, cover.
    fn website_done(&mut self) {
        let Some(view) = self.foreground_view() else { return };
        if self.documents.current(&view).is_none() {
            return self.cover();
        }
        let revealed = self.contexts.session.as_ref().and_then(|s| s.revealed.clone());
        self.foreground_event("user.done", json!({ "id": revealed }));
    }

    fn back(&mut self, now: u64) {
        let Some(session) = self.contexts.session.as_ref() else {
            return self.out.push(ShellCommand::MoveTaskToBack);
        };
        if session.back.is_some() {
            return; // A second Back while the foreground decides is ignored.
        }
        let Some(view) = self.foreground_view() else { return };
        let Some(document_id) = self.documents.current(&view).map(|d| d.id.clone()) else {
            return self.back_fallback(true);
        };
        let delay_ms = self.limits.back_answer_ms;
        if let Some(session) = self.contexts.session.as_mut() {
            session.back = Some(BackSlot { document_id, deadline_ms: now + delay_ms });
        }
        self.event(&view, "back", json!({}));
        self.out.push(ShellCommand::Wake { delay_ms });
    }

    pub fn back_answered(&mut self, document_id: &str, handled: bool) {
        let Some(session) = self.contexts.session.as_mut() else { return };
        if session.back.as_ref().is_some_and(|slot| slot.document_id == document_id) {
            session.back = None;
            if !handled {
                self.back_fallback(false);
            }
        }
    }

    /// Back the foreground did not take: a step back in the revealed context's history, else Home.
    /// A Back the foreground could not answer (`unanswered`) steps back in the first context, in
    /// manifest order, that has history when none is revealed, so a stalled screen does not leave
    /// the applet. The shell reports `HistoryUnmoved` when the step does nothing, and Home follows.
    fn back_fallback(&mut self, unanswered: bool) {
        let Some(session) = self.contexts.session.as_ref() else { return };
        let candidates: Vec<String> = match (&session.revealed, unanswered) {
            (Some(id), _) => vec![id.clone()],
            (None, true) => self.active_manifest().map(|(_, m)| m.contexts.iter().map(|c| c.id.clone()).collect()).unwrap_or_default(),
            (None, false) => Vec::new(),
        };
        let target = candidates.into_iter().find(|id| session.contexts.get(id).is_some_and(|c| c.can_go_back));
        let Some((id, view)) = target.and_then(|id| self.context_view(&id).map(|view| (id, view))) else {
            return self.home();
        };
        if let Some(session) = self.contexts.session.as_mut() {
            session.back_history = Some(id);
        }
        self.out.push(ShellCommand::HistoryGo { view, delta: -1 });
    }

    /// A history step did not move the context. A Back that fell through to it leaves the applet.
    fn history_unmoved(&mut self, view: &ViewRef) {
        let Role::Context(id) = &view.role else { return };
        let Some(session) = self.contexts.session.as_mut().filter(|s| s.applet_id == view.applet_id) else { return };
        if session.back_history.as_ref() == Some(id) {
            session.back_history = None;
            self.home();
        }
    }

    // -----------------------------------------------------------------------------------------
    // Context documents

    /// A new document committed in a context. Its hello may already have arrived: a bound
    /// document not started yet is this one when it is on the same origin, since its URL may have
    /// changed through the history API before the hello. Otherwise the document waits for its hello
    /// under a reserved generation.
    fn document_started(&mut self, view: ViewRef, url: String, now: u64) {
        let Role::Context(id) = &view.role else { return };
        if self.contexts.session.as_ref().is_none_or(|s| s.applet_id != view.applet_id) {
            return;
        }
        let origin = |u: &str| url::Url::parse(u).map(|u| u.origin().ascii_serialization()).ok();
        match self.documents.current_mut(&view) {
            Some(document) if !document.started && origin(&document.url).is_some_and(|o| Some(o) == origin(&url)) => {
                document.started = true;
            }
            _ => {
                self.documents.reserve_generation(&view);
                if let Some(context) = self.context_mut(id) {
                    context.navigating_since = Some(now);
                }
            }
        }
        self.foreground_event("context.started", json!({ "id": id, "url": url }));
    }

    /// A committed navigation. A cross-document one that has not bound yet retires the previous
    /// document and is stamped with the generation reserved for its document.
    fn context_navigated(&mut self, view: ViewRef, reported: ContextView, same_document: bool, reload: bool) {
        let Role::Context(id) = &view.role else { return };
        if self.contexts.session.as_ref().is_none_or(|s| s.applet_id != view.applet_id) {
            return;
        }
        if let Some(session) = self.contexts.session.as_mut().filter(|s| s.back_history.as_ref() == Some(id)) {
            session.back_history = None; // The Back step moved.
        }
        let Some(context) = self.context_mut(id) else { return };
        let waiting = context.navigating_since.is_some();
        context.url = reported.url.clone();
        context.index = reported.index;
        context.size = reported.size;
        context.can_go_back = reported.can_go_back;
        context.can_go_forward = reported.can_go_forward;
        if waiting && !same_document {
            self.retire_document(&view);
        }
        let generation = match self.documents.current(&view) {
            Some(document) if !waiting => document.generation,
            _ => self.documents.next_generation(&view),
        };
        self.foreground_event(
            "context.navigated",
            json!({
                "id": id, "url": reported.url, "generation": generation,
                "index": reported.index, "size": reported.size,
                "canGoBack": reported.can_go_back, "canGoForward": reported.can_go_forward,
                "sameDocument": same_document, "reload": reload,
            }),
        );
    }

    /// Every view shares one renderer, so any loss is total: retire the applet once, keep what
    /// Reload needs, and explain. A view whose renderer may be dead is never revealed.
    fn renderer_gone(&mut self, view: &ViewRef) {
        if self.contexts.session.as_ref().is_none_or(|s| s.applet_id != view.applet_id) {
            return; // Another view of the same burst, after the applet was retired.
        }
        let entry = self.applets.entry(&view.applet_id);
        self.retire_for_resume(false);
        self.show_launcher();
        self.out.push(ShellCommand::ShowStatus {
            kind: StatusKind::RendererLost,
            applet: entry,
            details: "The pages stopped. Reload opens the applet again where it was.".into(),
        });
    }

    /// Retires a context's or the foreground's document: it receives `retired`, and its actions
    /// are dropped. Every action of a retired context document was delivered to it and some of
    /// its steps may have run, so the foreground learns that their outcome is unknown. Actions a
    /// retired foreground document asked for are only forgotten.
    pub fn retire_document(&mut self, view: &ViewRef) {
        let Some(document_id) = self.documents.retire(view) else { return };
        let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
        self.post(view, &message);
        let Some(session) = self.contexts.session.as_mut() else { return };
        session.take_actions(|a| a.foreground_document == document_id);
        let actions = session.take_actions(|a| a.context_document == document_id);
        for (action_id, handle) in actions.into_iter().filter(|(_, a)| !a.navigating) {
            let result = json!({ "outcome": "unknown", "code": ErrorCode::ContextReplaced, "message": "The page changed before the action finished" });
            self.action_update(&handle.foreground_document, json!({ "actionId": action_id, "state": "failed", "result": result }));
        }
    }

    /// Sends `action.update` to the foreground document that asked, if it is still current.
    pub fn action_update(&mut self, foreground_document: &str, update: Value) {
        let Some(view) = self.foreground_view() else { return };
        if self.documents.is_current(&view, foreground_document) {
            self.event(&view, "action.update", update);
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
        if let Some(deletion) = self.deletions.remove(&completion.job_id) {
            self.deletion_completed(deletion, outcome.map(|_| ()).map_err(|e| e.message));
            return Ok(());
        }
        let namespace_revision = outcome.as_ref().ok().and_then(|r| r.get("namespaceRevision").cloned());
        self.finish_op(completion.job_id, Some(&completion.applet_id), outcome);
        let active = self.contexts.session.as_ref().is_some_and(|s| s.applet_id == completion.applet_id);
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
        let Some(session) = self.contexts.session.as_mut() else { return };
        let expired = session.take_actions(|a| a.deadline_ms <= now);
        for (action_id, handle) in expired.into_iter().filter(|(_, a)| !a.navigating) {
            // The document received the action and may have run some of its steps; the outcome is unknown.
            let result = json!({ "outcome": "unknown", "code": ErrorCode::Deadline, "message": "The page did not finish the action in time" });
            self.action_update(&handle.foreground_document, json!({ "actionId": action_id, "state": "failed", "result": result }));
        }
        let Some(session) = self.contexts.session.as_mut() else { return };
        if session.back.as_ref().is_some_and(|slot| slot.deadline_ms <= now) {
            session.back = None;
            return self.back_fallback(true);
        }
        self.expire_unbound_documents(now);
        self.retire_if_long_suspended(now);
    }

    /// A context page on a declared origin that committed and never said hello within
    /// `documentReadyMs` is reported gone. Undeclared origins never bind, and are left alone.
    fn expire_unbound_documents(&mut self, now: u64) {
        let ready_ms = self.limits.document_ready_ms;
        let Some(origins) = self.active_manifest().map(|(_, m)| m.origins.clone()) else { return };
        let Some(session) = self.contexts.session.as_mut() else { return };
        let mut gone = Vec::new();
        for (id, context) in session.contexts.iter_mut() {
            let late = context.navigating_since.is_some_and(|since| now.saturating_sub(since) >= ready_ms);
            if late {
                context.navigating_since = None;
                let declared = url::Url::parse(&context.url).is_ok_and(|u| origins.contains(&u.origin().ascii_serialization()));
                if declared {
                    gone.push(id.clone());
                }
            }
        }
        for id in gone {
            self.foreground_event("context.gone", json!({ "id": id, "code": ErrorCode::NotReady, "message": "The page did not load in time" }));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Imports

    /// After an install: an active applet restarts on the new revision (an incompatible one
    /// returns to the launcher), the previous revision's files go, and an incompatible import
    /// explains itself once. `restart` starts the applet even though it was retired first.
    pub fn after_install(&mut self, applet_id: &str, previous: Option<u64>, restart: bool) {
        let incompatible = self.applets.entry(applet_id).filter(|e| e.status == AppletStatus::Incompatible);
        let active = self.contexts.session.as_ref().map(|s| s.applet_id.clone());
        let restart = restart || active.as_deref() == Some(applet_id);
        if restart {
            self.retire_active();
            // An incompatible import cannot start; the notice below explains it, once.
            match incompatible {
                Some(_) => self.show_launcher(),
                None => {
                    self.update_applets();
                    self.activate(applet_id, None, None);
                }
            }
        } else if active.is_none() {
            self.show_launcher();
        }
        if let Some(previous) = previous {
            self.applets.remove_revision(applet_id, previous);
        }
        if let Some(entry) = incompatible {
            let details = match entry.direction {
                Some(Direction::Newer) => "Needs a newer Genesis",
                _ => "Needs update",
            };
            self.out.push(ShellCommand::ShowStatus { kind: StatusKind::ImportReceived, details: details.into(), applet: Some(entry) });
        }
    }
}

/// The status sheet's text for an applet that cannot start: each mismatch, then what to do.
fn incompatible_details(entry: &LauncherEntry) -> String {
    let lines: Vec<String> = entry.mismatches.iter().map(|m| format!("{}: applet {}, Genesis {}", m.field, m.applet, m.host)).collect();
    let advice = match entry.direction {
        Some(Direction::Newer) => "Update Genesis to open this applet.",
        _ => "Update the applet to the current SDK, then run: genesis-applet build <dir> && genesis-applet dev install <dir>",
    };
    format!("{}\n{advice}", lines.join("\n"))
}
