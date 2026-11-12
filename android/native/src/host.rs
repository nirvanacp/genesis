//! The host core: turns shell events into shell commands.
use crate::{
    applets::{self, Applets},
    contexts::{BackSlot, CallHandle, ContextView, Contexts, Resume, Session},
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
/// At most this many applets stay live. Starting another retires the one suspended longest.
const LIVE_APPLETS_MAX: usize = 3;
/// `ComponentCallbacks2.TRIM_MEMORY_BACKGROUND`: the process is in the background list.
const TRIM_MEMORY_BACKGROUND: u32 = 40;

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
                self.end_flow();
                self.contexts = Contexts::default();
                self.documents = Documents::default();
                self.applets = Applets::load(Path::new(&files_dir));
                self.files_dir = Some(files_dir.into());
                self.debuggable = debuggable;
                self.load_updates();
            }
            ShellEvent::ManagerAttached => {
                // A new manager window has none of the old flow's screens.
                self.end_flow();
                self.show_launcher();
            }
            ShellEvent::Resumed { applet_id: Some(applet_id) } => self.window_resumed(&applet_id, now),
            ShellEvent::Resumed { applet_id: None } => {
                if self.flow.is_none() {
                    self.show_launcher();
                }
            }
            ShellEvent::Suspended { applet_id } => self.window_suspended(applet_id.as_deref(), now),
            ShellEvent::Back { applet_id } => self.back(applet_id, now),
            ShellEvent::WebsiteDone { applet_id } => {
                if let Some(id) = applet_id.filter(|id| self.is_live(id)) {
                    self.website_done(&id);
                }
            }
            ShellEvent::OpenApplet { applet_id } => self.start_window(&applet_id, None),
            ShellEvent::AppletWindowCreated { applet_id, restored } => self.window_created(&applet_id, restored),
            ShellEvent::AppletWindowClosed { applet_id, finished } => self.window_closed(&applet_id, finished),
            ShellEvent::OpenUrl { url, applet_id, external } => self.open_url(&url, applet_id, external),
            ShellEvent::Home => self.show_launcher(),
            ShellEvent::Menu { applet_id, action } => {
                if let Some(id) = applet_id.filter(|id| self.is_live(id)) {
                    self.menu(&id, action);
                }
            }
            ShellEvent::DocumentStarted { view, url } => self.document_started(view, url, now),
            ShellEvent::DocumentMessage { view, payload } => self.document_message(view, &payload, now),
            ShellEvent::ContextNavigated { view, url, index, size, can_go_back, can_go_forward, same_document, reload } => {
                let reported = ContextView { url, index, size, can_go_back, can_go_forward, navigating_since: None };
                self.context_navigated(view, reported, same_document, reload);
            }
            ShellEvent::RendererGone { view } => self.renderer_gone(&view),
            ShellEvent::HistoryUnmoved { view } => self.history_unmoved(&view),
            ShellEvent::InputDone { view, token, ok, message } => self.input_done(&view, token, ok, message),
            ShellEvent::WindowRequested { view, url } => self.window_requested(view, &url),
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
            ShellEvent::TrimMemory { level } => self.trim_memory(level),
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

    pub fn session(&self, applet_id: &str) -> Option<&Session> {
        self.contexts.sessions.get(applet_id)
    }

    pub fn session_mut(&mut self, applet_id: &str) -> Option<&mut Session> {
        self.contexts.sessions.get_mut(applet_id)
    }

    /// Whether the applet is live: its views exist.
    pub fn is_live(&self, applet_id: &str) -> bool {
        self.contexts.sessions.contains_key(applet_id)
    }

    pub fn foreground_view(&self, applet_id: &str) -> Option<ViewRef> {
        self.is_live(applet_id).then(|| ViewRef { applet_id: applet_id.into(), role: Role::Foreground })
    }

    /// The view of a context the live applet declares.
    pub fn context_view(&self, applet_id: &str, context_id: &str) -> Option<ViewRef> {
        let session = self.session(applet_id)?;
        session.contexts.contains_key(context_id).then(|| ViewRef {
            applet_id: applet_id.into(),
            role: Role::Context(context_id.into()),
        })
    }

    pub fn context_mut(&mut self, applet_id: &str, context_id: &str) -> Option<&mut ContextView> {
        self.session_mut(applet_id)?.contexts.get_mut(context_id)
    }

    pub fn foreground_event(&mut self, applet_id: &str, name: &str, data: Value) {
        if let Some(view) = self.foreground_view(applet_id) {
            self.event(&view, name, data);
        }
    }

    fn broadcast(&mut self, applet_id: &str, name: &str, data: Value) {
        let Some(session) = self.session(applet_id) else { return };
        let ids: Vec<String> = session.contexts.keys().cloned().collect();
        self.foreground_event(applet_id, name, data.clone());
        for id in ids {
            if let Some(view) = self.context_view(applet_id, &id) {
                self.event(&view, name, data.clone());
            }
        }
    }

    /// The live applet's revision and manifest.
    pub fn active_manifest(&self, applet_id: &str) -> Option<(u64, &Manifest)> {
        self.session(applet_id)?;
        self.applets.current(applet_id)
    }

    // -----------------------------------------------------------------------------------------
    // Applet lifecycle

    pub fn show_launcher(&mut self) {
        let updates_checked_at = self.updates_checked_at();
        self.out.push(ShellCommand::ShowLauncher { applets: self.launcher_entries(), updates_checked_at });
    }

    // -----------------------------------------------------------------------------------------
    // Applet windows

    /// Starts or brings forward an applet's window. The applet starts when the window resumes,
    /// with `opening`, a `(context, url)` link, loaded in place of where it was.
    fn start_window(&mut self, applet_id: &str, opening: Option<(String, String)>) {
        let url = opening.as_ref().map(|(_, url)| url.clone());
        let opens_link = opening.is_some();
        self.contexts.pending_open.insert(applet_id.into(), opening);
        self.out.push(ShellCommand::StartAppletWindow { applet_id: applet_id.into(), url });
        // A window already on screen does not resume again: a link, or a Reload after the
        // pages stopped, starts the applet now.
        let resumed = self.contexts.resumed_window.as_deref() == Some(applet_id);
        if resumed && (opens_link || !self.is_live(applet_id)) {
            self.window_resumed(applet_id, now_ms());
        }
    }

    /// An applet's window resumed. A live applet continues where it was; otherwise it starts,
    /// from where it was when it has a resume target. Other live applets are left as they are.
    fn window_resumed(&mut self, applet_id: &str, now: u64) {
        self.contexts.resumed_window = Some(applet_id.into());
        let opening = self.contexts.pending_open.remove(applet_id).flatten();
        self.retire_if_long_suspended(applet_id, now);
        if let Some(session) = self.session_mut(applet_id) {
            let suspended = session.suspended_at_ms.take().is_some();
            if opening.is_none() {
                if suspended {
                    self.broadcast(applet_id, "resumed", json!({}));
                }
                return;
            }
            // A link starts the applet again with a fresh history, so its first Back leaves the
            // applet, and the shell's events reach a foreground that binds after the commands below.
            self.retire_for_resume(applet_id);
        }
        let resume = self.take_resume(applet_id);
        let open_context = opening.as_ref().map(|(context, _)| context.clone());
        self.activate(applet_id, resume, opening);
        if let Some(session) = self.session_mut(applet_id) {
            session.open_context = open_context;
        }
    }

    /// An applet's window suspends its live applet. Where it is gets saved, so its Recents card
    /// restores it if the process ends in the background.
    fn window_suspended(&mut self, applet_id: Option<&str>, now: u64) {
        let Some(applet_id) = applet_id else { return };
        if self.contexts.resumed_window.as_deref() == Some(applet_id) {
            self.contexts.resumed_window = None;
        }
        let Some(session) = self.session_mut(applet_id) else { return };
        session.suspended_at_ms = Some(now);
        let resume = Self::resume_of(session);
        self.save_resume(applet_id, &resume);
        self.broadcast(applet_id, "suspended", json!({}));
    }

    /// A window Android created anew (not from its Recents card) starts its applet fresh.
    /// The window gets the launcher entries its menu and info pages read, which a process
    /// started from a Recents card has not sent to any window yet.
    fn window_created(&mut self, applet_id: &str, restored: bool) {
        let updates_checked_at = self.updates_checked_at();
        self.out.push(ShellCommand::UpdateApplets { applets: self.launcher_entries(), updates_checked_at });
        if !restored {
            self.retire_session(applet_id);
            self.forget_resume(applet_id);
        }
    }

    /// A destroyed window takes its applet's views with it. The applet keeps where it was
    /// unless the user closed the window.
    fn window_closed(&mut self, applet_id: &str, finished: bool) {
        if self.contexts.resumed_window.as_deref() == Some(applet_id) {
            self.contexts.resumed_window = None;
        }
        self.contexts.pending_open.remove(applet_id);
        self.retire_for_resume(applet_id);
        if finished {
            self.forget_resume(applet_id);
        }
    }

    fn resume_path(&self, applet_id: &str) -> Option<PathBuf> {
        Some(self.files_dir.as_ref()?.join("applets").join(applet_id).join("resume.json"))
    }

    fn resume_of(session: &Session) -> Resume {
        Resume {
            urls: session.contexts.iter().map(|(id, c)| (id.clone(), c.url.clone())).collect::<BTreeMap<_, _>>(),
            saved: session.saved.clone(),
        }
    }

    fn save_resume(&self, applet_id: &str, resume: &Resume) {
        let (Some(path), Ok(bytes)) = (self.resume_path(applet_id), serde_json::to_vec(resume)) else { return };
        let _ = applets::write_atomic(&path, &bytes);
    }

    /// Where the applet was: kept in memory, else saved before the process last ended.
    fn take_resume(&mut self, applet_id: &str) -> Option<Resume> {
        self.contexts.resumes.remove(applet_id).or_else(|| {
            let bytes = std::fs::read(self.resume_path(applet_id)?).ok()?;
            serde_json::from_slice(&bytes).ok()
        })
    }

    pub fn forget_resume(&mut self, applet_id: &str) {
        self.contexts.resumes.remove(applet_id);
        if let Some(path) = self.resume_path(applet_id) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Opens a website link. Without a picked applet the user chooses first: one of the applets
    /// that declare its site, or a new applet. The picked applet's window opens and the applet
    /// starts again, its other contexts at their last URLs, with the link in the context that
    /// starts on its site (or the first), and its routes decide whether the link shows the
    /// applet's screen or the website.
    fn open_url(&mut self, url: &str, chosen: Option<String>, external: bool) {
        // A link from an applet's page explains itself there.
        let window = self.contexts.resumed_window.clone();
        let info = |message: String| ShellCommand::ShowInfo { applet_id: window.clone(), title: "Genesis".into(), message };
        let Some(parsed) = url::Url::parse(url.trim()).ok().filter(|u| matches!(u.scheme(), "http" | "https")) else {
            return self.out.push(info("Genesis opens only website links".into()));
        };
        // Genesis blocks cleartext traffic, so an http page could not load.
        if parsed.scheme() == "http" {
            return self.out.push(info("Genesis opens only secure https links".into()));
        }
        let origin = parsed.origin().ascii_serialization();
        let url = parsed.to_string();
        let candidates: Vec<String> =
            self.applets.for_origin(&origin).into_iter().filter(|id| !self.erasing(id)).collect();
        let applet_id = match chosen {
            Some(id) if candidates.contains(&id) => id,
            Some(_) => return self.out.push(info("That applet no longer uses this website".into())),
            None => {
                let applets = candidates.iter().filter_map(|id| self.applets.entry(id)).collect();
                return self.out.push(ShellCommand::ChooseApplet { url, applets, external });
            }
        };
        let Some((_, manifest)) = self.applets.current(&applet_id) else { return };
        let starts_here = manifest.contexts.iter().find(|c| applets::origin_of(&c.start_url).as_deref() == Some(&origin));
        let Some(context) = starts_here.or(manifest.contexts.first()).map(|c| c.id.clone()) else { return };
        self.start_window(&applet_id, Some((context, url)));
    }

    /// A context's window the shell did not open as a popup. A page on the applet's own sites
    /// loads in place, where its routes decide what shows; a site another applet uses opens in
    /// that applet; any other site shows in a website sheet over the applet.
    fn window_requested(&mut self, view: ViewRef, url: &str) {
        let Role::Context(_) = &view.role else { return };
        let Some((_, manifest)) = self.active_manifest(&view.applet_id).filter(|_| self.context_view_matches(&view)) else { return };
        // An http window is dropped: Genesis blocks cleartext traffic.
        let Some(origin) = url::Url::parse(url).ok().filter(|u| u.scheme() == "https").map(|u| u.origin().ascii_serialization()) else {
            return;
        };
        if manifest.origins.iter().any(|o| applets::origin_of(o).as_deref() == Some(&origin)) {
            return self.out.push(ShellCommand::LoadUrl { view, url: url.into(), mode: NavigateMode::Push });
        }
        let others: Vec<String> = self
            .applets
            .for_origin(&origin)
            .into_iter()
            .filter(|id| *id != view.applet_id && !self.erasing(id))
            .collect();
        match others.as_slice() {
            [] => self.out.push(ShellCommand::ShowWindow { view, url: url.into() }),
            [only] => {
                let only = only.clone();
                self.open_url(url, Some(only), false)
            }
            _ => self.open_url(url, None, false),
        }
    }

    /// Whether `view` is a context of its live applet.
    fn context_view_matches(&self, view: &ViewRef) -> bool {
        let Role::Context(id) = &view.role else { return false };
        self.session(&view.applet_id).is_some_and(|s| s.contexts.contains_key(id))
    }

    /// A Back that leaves the applet moves its window behind the previous task, as an app's
    /// does. The applet stays where it was and suspends.
    pub fn leave_on_back(&mut self, applet_id: &str) {
        if self.is_live(applet_id) {
            self.out.push(ShellCommand::MoveTaskToBack { applet_id: Some(applet_id.into()) });
        }
    }

    /// Starts an applet in its window, or recreates it from `resume` at its contexts' last
    /// committed URLs. `opening` loads one context at a shared link instead. An applet that
    /// cannot start explains why in its window, which closes after.
    pub fn activate(&mut self, applet_id: &str, resume: Option<Resume>, opening: Option<(String, String)>) {
        let window = Some(applet_id.to_string());
        if self.erasing(applet_id) {
            return self.out.push(ShellCommand::ShowError { applet_id: window, message: erasing_message(applet_id) });
        }
        let Some((revision, manifest)) = self.applets.current(applet_id).map(|(r, m)| (r, m.clone())) else {
            return match self.applets.entry(applet_id) {
                Some(entry) => self.out.push(ShellCommand::ShowStatus {
                    applet_id: window,
                    kind: StatusKind::Incompatible,
                    details: incompatible_details(&entry),
                    applet: Some(entry),
                }),
                None => self.out.push(ShellCommand::ShowError { applet_id: window, message: format!("Applet {applet_id} is not installed") }),
            };
        };
        let script = match self.applets.read_text(applet_id, revision, "page.js") {
            Ok(script) => script,
            Err(message) => return self.out.push(ShellCommand::ShowError { applet_id: window, message }),
        };
        self.make_room(applet_id);
        let mut session = Session::new(applet_id.into(), revision, resume.is_some());
        let (mut urls, saved) = resume.map(|r| (r.urls, r.saved)).unwrap_or_default();
        urls.extend(opening);
        session.saved = saved;
        self.out.push(ShellCommand::ShowApplet {
            applet_id: applet_id.into(),
            name: manifest.name.clone(),
            accent: manifest.shell.as_ref().and_then(|s| s.accent.clone()),
            icon: self.applets.icon(applet_id),
        });
        self.out.push(ShellCommand::CreateView {
            view: ViewRef { applet_id: applet_id.into(), role: Role::Foreground },
            url: self.applets.foreground_url(applet_id, revision, &manifest.foreground.entry),
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
        self.contexts.sessions.insert(applet_id.into(), session);
    }

    /// Keeps the live applets under `LIVE_APPLETS_MAX` before `applet_id` starts: the applet
    /// suspended longest retires for resume. A resumed applet is never retired for room.
    fn make_room(&mut self, applet_id: &str) {
        let others = self.contexts.sessions.keys().filter(|id| *id != applet_id).count();
        if others < LIVE_APPLETS_MAX {
            return;
        }
        let oldest = self
            .contexts
            .sessions
            .values()
            .filter(|s| s.applet_id != applet_id)
            .filter_map(|s| s.suspended_at_ms.map(|at| (at, s.applet_id.clone())))
            .min();
        if let Some((_, id)) = oldest {
            self.retire_for_resume(&id);
        }
    }

    /// Destroys the applet's views. Documents receive `retired` first.
    pub fn retire_session(&mut self, applet_id: &str) {
        let Some(session) = self.contexts.sessions.remove(applet_id) else { return };
        let views = self.documents.retire_applet(&session.applet_id);
        for (view, document_id) in &views {
            let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
            self.post(view, &message);
        }
        if session.revealed.is_some() {
            self.out.push(ShellCommand::CoverContext { applet_id: Some(session.applet_id.clone()) });
        }
        let mut roles = vec![Role::Foreground];
        roles.extend(session.contexts.keys().map(|id| Role::Context(id.clone())));
        for role in roles {
            self.out.push(ShellCommand::DestroyView { view: ViewRef { applet_id: session.applet_id.clone(), role } });
        }
    }

    /// Retires the live applet and keeps what recreating it needs, in memory and on disk. Its
    /// window recreates it when it resumes.
    fn retire_for_resume(&mut self, applet_id: &str) {
        let Some(session) = self.session(applet_id) else { return };
        let resume = Self::resume_of(session);
        self.save_resume(applet_id, &resume);
        self.contexts.resumes.insert(applet_id.into(), resume);
        self.retire_session(applet_id);
    }

    fn retire_if_long_suspended(&mut self, applet_id: &str, now: u64) {
        let Some(session) = self.session(applet_id) else { return };
        // `revealed` does not change while suspended, so this is the state the user left in.
        let limit = if session.revealed.is_some() { REVEALED_RETIRE_MS } else { SUSPEND_RETIRE_MS };
        if session.suspended_at_ms.is_some_and(|at| now.saturating_sub(at) >= limit) {
            self.retire_for_resume(applet_id);
        }
    }

    /// Under memory pressure in the background, every applet whose window is not resumed retires
    /// to its resume target, freeing its WebViews.
    fn trim_memory(&mut self, level: u32) {
        if level < TRIM_MEMORY_BACKGROUND {
            return;
        }
        let suspended: Vec<String> =
            self.contexts.sessions.values().filter(|s| s.suspended_at_ms.is_some()).map(|s| s.applet_id.clone()).collect();
        for applet_id in suspended {
            self.retire_for_resume(&applet_id);
        }
    }

    fn menu(&mut self, applet_id: &str, action: MenuAction) {
        let Some(session) = self.session(applet_id) else { return };
        let (revision, revealed) = (session.revision, session.revealed.clone());
        match action {
            // "Open Genesis" leaves the applet as it is.
            MenuAction::Home => self.out.push(ShellCommand::OpenManager),
            MenuAction::Reload => {
                self.retire_session(applet_id);
                self.forget_resume(applet_id);
                self.activate(applet_id, None, None);
            }
            // The foreground pins its active context when `id` is null.
            MenuAction::ViewWebsite => self.foreground_event(applet_id, "user.viewWebsite", json!({ "id": revealed })),
            MenuAction::Info => {
                let Some((_, manifest)) = self.active_manifest(applet_id) else { return };
                let message = format!("{applet_id}, revision {revision}\nWebsites: {}", manifest.origins.join(", "));
                let title = manifest.name.clone();
                self.out.push(ShellCommand::ShowInfo { applet_id: Some(applet_id.into()), title, message });
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // Reveal and Back

    pub fn reveal(&mut self, context_id: &str, view: ViewRef, title: &str) {
        let Some(session) = self.contexts.sessions.get_mut(&view.applet_id) else { return };
        if session.revealed.as_deref() == Some(context_id) {
            return;
        }
        if session.revealed.replace(context_id.into()).is_some() {
            let applet_id = Some(session.applet_id.clone());
            self.out.push(ShellCommand::CoverContext { applet_id });
        }
        self.out.push(ShellCommand::RevealContext { view, title: title.into() });
    }

    pub fn cover(&mut self, applet_id: &str) {
        let Some(session) = self.session_mut(applet_id) else { return };
        if session.revealed.take().is_some() {
            let applet_id = Some(session.applet_id.clone());
            self.out.push(ShellCommand::CoverContext { applet_id });
        }
    }

    /// Done on the website bar. The foreground decides the presentation; without one, cover.
    fn website_done(&mut self, applet_id: &str) {
        let Some(view) = self.foreground_view(applet_id) else { return };
        if self.documents.current(&view).is_none() {
            return self.cover(applet_id);
        }
        let revealed = self.session(applet_id).and_then(|s| s.revealed.clone());
        self.foreground_event(applet_id, "user.done", json!({ "id": revealed }));
    }

    /// Back in a window. The manager's, and an applet window's without its live applet, moves
    /// the window's task back.
    fn back(&mut self, applet_id: Option<String>, now: u64) {
        let applet_id = match applet_id {
            Some(id) if self.is_live(&id) => id,
            window => return self.out.push(ShellCommand::MoveTaskToBack { applet_id: window }),
        };
        if self.session(&applet_id).is_some_and(|s| s.back.is_some()) {
            return; // A second Back while the foreground decides is ignored.
        }
        let Some(view) = self.foreground_view(&applet_id) else { return };
        let Some(document_id) = self.documents.current(&view).map(|d| d.id.clone()) else {
            return self.back_fallback(&applet_id, true);
        };
        let delay_ms = self.limits.back_answer_ms;
        if let Some(session) = self.session_mut(&applet_id) {
            session.back = Some(BackSlot { document_id, deadline_ms: now + delay_ms });
        }
        self.event(&view, "back", json!({}));
        self.out.push(ShellCommand::Wake { delay_ms });
    }

    pub fn back_answered(&mut self, applet_id: &str, document_id: &str, handled: bool) {
        let Some(session) = self.session_mut(applet_id) else { return };
        if session.back.as_ref().is_some_and(|slot| slot.document_id == document_id) {
            session.back = None;
            if !handled {
                self.back_fallback(applet_id, false);
            }
        }
    }

    /// Back the foreground did not take: a step back in the revealed context's history, else Home.
    /// A Back the foreground could not answer (`unanswered`) steps back in the first context, in
    /// manifest order, that has history when none is revealed, so a stalled screen does not leave
    /// the applet. The shell reports `HistoryUnmoved` when the step does nothing, and Home follows.
    fn back_fallback(&mut self, applet_id: &str, unanswered: bool) {
        let Some(session) = self.session(applet_id) else { return };
        let candidates: Vec<String> = match (&session.revealed, unanswered) {
            (Some(id), _) => vec![id.clone()],
            (None, true) => self.active_manifest(applet_id).map(|(_, m)| m.contexts.iter().map(|c| c.id.clone()).collect()).unwrap_or_default(),
            (None, false) => Vec::new(),
        };
        let target = candidates.into_iter().find(|id| session.contexts.get(id).is_some_and(|c| c.can_go_back));
        let Some((id, view)) = target.and_then(|id| self.context_view(applet_id, &id).map(|view| (id, view))) else {
            return self.leave_on_back(applet_id);
        };
        if let Some(session) = self.session_mut(applet_id) {
            session.back_history = Some(id);
        }
        self.out.push(ShellCommand::HistoryGo { view, delta: -1 });
    }

    /// A history step did not move the context. A Back that fell through to it leaves the applet.
    fn history_unmoved(&mut self, view: &ViewRef) {
        let Role::Context(id) = &view.role else { return };
        let Some(session) = self.contexts.sessions.get_mut(&view.applet_id) else { return };
        if session.back_history.as_ref() == Some(id) {
            session.back_history = None;
            self.leave_on_back(&view.applet_id);
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
        if !self.is_live(&view.applet_id) {
            return;
        }
        let origin = |u: &str| url::Url::parse(u).map(|u| u.origin().ascii_serialization()).ok();
        match self.documents.current_mut(&view) {
            Some(document) if !document.started && origin(&document.url).is_some_and(|o| Some(o) == origin(&url)) => {
                document.started = true;
            }
            _ => {
                self.documents.reserve_generation(&view);
                if let Some(context) = self.context_mut(&view.applet_id, id) {
                    context.navigating_since = Some(now);
                }
            }
        }
        self.foreground_event(&view.applet_id, "context.started", json!({ "id": id, "url": url }));
    }

    /// A committed navigation. A cross-document one that has not bound yet retires the previous
    /// document and is stamped with the generation reserved for its document.
    fn context_navigated(&mut self, view: ViewRef, reported: ContextView, same_document: bool, reload: bool) {
        let Role::Context(id) = &view.role else { return };
        let Some(session) = self.contexts.sessions.get_mut(&view.applet_id) else { return };
        if session.back_history.as_ref() == Some(id) {
            session.back_history = None; // The Back step moved.
        }
        let Some(context) = self.context_mut(&view.applet_id, id) else { return };
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
            &view.applet_id,
            "context.navigated",
            json!({
                "id": id, "url": reported.url, "generation": generation,
                "index": reported.index, "size": reported.size,
                "canGoBack": reported.can_go_back, "canGoForward": reported.can_go_forward,
                "sameDocument": same_document, "reload": reload,
            }),
        );
    }

    /// An applet's views share one renderer, so any loss is total for it: retire the applet once,
    /// keep what Reload needs, and explain. A view whose renderer may be dead is never revealed.
    fn renderer_gone(&mut self, view: &ViewRef) {
        if !self.is_live(&view.applet_id) {
            return; // Another view of the same burst, after the applet was retired.
        }
        let entry = self.applets.entry(&view.applet_id);
        self.retire_for_resume(&view.applet_id);
        self.out.push(ShellCommand::ShowStatus {
            applet_id: Some(view.applet_id.clone()),
            kind: StatusKind::RendererLost,
            applet: entry,
            details: "The pages stopped. Reload opens the applet again where it was.".into(),
        });
    }

    /// Retires a context's or the foreground's document: it receives `retired`, and its page calls
    /// are dropped. Each open call of a retired context document fails with `CONTEXT_REPLACED` and
    /// how far it got. Calls a retired foreground document asked for are only forgotten.
    pub fn retire_document(&mut self, view: &ViewRef) {
        let Some(document_id) = self.documents.retire(view) else { return };
        let message = HostMessage::Event { document_id: document_id.clone(), name: "retired".into(), data: json!({}) };
        self.post(view, &message);
        let Some(session) = self.contexts.sessions.get_mut(&view.applet_id) else { return };
        session.take_calls(|c| c.foreground_document == document_id);
        let calls = session.take_calls(|c| c.context_document == document_id);
        for (_, handle) in calls {
            self.fail_call(&view.applet_id, &handle, ErrorBody::new(ErrorCode::ContextReplaced, "The page changed before the call finished"));
        }
    }

    /// Answers the foreground request behind a page call, if the document that asked is still current.
    pub fn answer_call(&mut self, applet_id: &str, handle: &CallHandle, outcome: Result<Value, ErrorBody>) {
        let Some(view) = self.foreground_view(applet_id) else { return };
        if self.documents.is_current(&view, &handle.foreground_document) {
            self.respond(&view, &handle.foreground_document, handle.request_id, outcome);
        }
    }

    /// Ends a page call the context did not answer, with how far it got as the error's `details`.
    pub fn fail_call(&mut self, applet_id: &str, handle: &CallHandle, error: ErrorBody) {
        let error = error.with_details(handle.details());
        self.answer_call(applet_id, handle, Err(error));
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
        if self.is_live(&completion.applet_id) && !completion.changed.is_empty() {
            self.foreground_event(&completion.applet_id, "storage.changed", json!({ "changes": completion.changed, "namespaceRevision": namespace_revision }));
        }
        Ok(())
    }

    fn tick(&mut self, now: u64) {
        for op in self.documents.expired_ops(now) {
            let error = ErrorBody::new(ErrorCode::Deadline, "The request took too long");
            self.respond(&op.view, &op.document_id, op.request_id, Err(error));
        }
        let live: Vec<String> = self.contexts.sessions.keys().cloned().collect();
        for applet_id in live {
            self.tick_session(&applet_id, now);
        }
    }

    /// One live applet's deadlines: its page calls, its Back slot, its unbound documents and its suspension.
    fn tick_session(&mut self, applet_id: &str, now: u64) {
        let Some(session) = self.session_mut(applet_id) else { return };
        let expired = session.take_calls(|c| c.deadline_ms <= now);
        for (_, handle) in expired {
            self.fail_call(applet_id, &handle, ErrorBody::new(ErrorCode::Deadline, "The page did not answer the call in time"));
        }
        let Some(session) = self.session_mut(applet_id) else { return };
        if session.back.as_ref().is_some_and(|slot| slot.deadline_ms <= now) {
            session.back = None;
            return self.back_fallback(applet_id, true);
        }
        self.expire_unbound_documents(applet_id, now);
        self.retire_if_long_suspended(applet_id, now);
    }

    /// A context page on a declared origin that committed and never said hello within
    /// `documentReadyMs` is reported gone. Undeclared origins never bind, and are left alone.
    fn expire_unbound_documents(&mut self, applet_id: &str, now: u64) {
        let ready_ms = self.limits.document_ready_ms;
        let Some(origins) = self.active_manifest(applet_id).map(|(_, m)| m.origins.clone()) else { return };
        let Some(session) = self.session_mut(applet_id) else { return };
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
            self.foreground_event(applet_id, "context.gone", json!({ "id": id, "code": ErrorCode::NotReady, "message": "The page did not load in time" }));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Imports

    /// After an install: a live applet restarts on the new revision, now when its window is
    /// on screen and otherwise when it resumes; the previous revision's files go, and an
    /// incompatible import explains itself once, in the applet's window when it is on screen.
    /// `restart` restarts the applet even though it was retired first.
    pub fn after_install(&mut self, applet_id: &str, previous: Option<u64>, restart: bool) {
        let incompatible = self.applets.entry(applet_id).filter(|e| e.status == AppletStatus::Incompatible);
        let on_screen = self.contexts.resumed_window.as_deref() == Some(applet_id);
        if restart || self.is_live(applet_id) {
            self.retire_session(applet_id);
            self.forget_resume(applet_id);
            // An incompatible import cannot start; the notice below explains it, once.
            if incompatible.is_none() && on_screen {
                self.activate(applet_id, None, None);
            }
        }
        self.show_launcher();
        if let Some(previous) = previous {
            self.applets.remove_revision(applet_id, previous);
        }
        if let Some(entry) = incompatible {
            let details = match entry.direction {
                Some(Direction::Newer) => "Needs a newer Genesis",
                _ => "Needs update",
            };
            let window = on_screen.then(|| applet_id.to_string());
            self.out.push(ShellCommand::ShowStatus { applet_id: window, kind: StatusKind::ImportReceived, details: details.into(), applet: Some(entry) });
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
