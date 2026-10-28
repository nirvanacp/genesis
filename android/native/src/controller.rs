use crate::sources::*;
use genesis_contracts::{HostCommand as C, HostEvent as E, *};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use url::Url;

#[derive(Default)]
pub struct HostState {
    index: Option<PackageIndex>,
    instances: HashMap<InstanceId, AppletInstance>,
    pub(crate) active: Option<LiveView>,
    disabled: HashSet<AppletId>,
    generation: u64,
    serial: u64,
    debug: bool,
    fullscreen: bool,
    details: String,
    qualification: Option<HashSet<DocumentId>>,
    // Debug labels only: never retain page messages, URLs, nonces or credentials.
    startup_trace: VecDeque<&'static str>,
}

pub(crate) fn increment(value: &mut u64) -> Result<u64, String> {
    *value = value
        .checked_add(1)
        .filter(|v| *v <= 9_007_199_254_740_991)
        .ok_or("Identity counter exhausted")?;
    Ok(*value)
}

fn source_key(applet: &AppletId, source: &SourceId) -> String {
    format!("{}/{}", applet.0, source.0)
}
fn instance_id(applet: &AppletId) -> InstanceId {
    InstanceId(format!("local:{}", applet.0))
}
fn origin(url: &str) -> Option<String> {
    Url::parse(url)
        .ok()
        .map(|u| u.origin().ascii_serialization())
}

fn trace(events: &mut VecDeque<&'static str>, label: &'static str) {
    if events.len() == 48 {
        events.pop_front();
    }
    events.push_back(label);
}

impl HostState {
    pub fn dispatch(&mut self, event: E) -> Result<Vec<C>, String> {
        let mut commands = Vec::new();
        if self.debug {
            let label = match &event {
                E::NavigationStarted { .. } => Some("navigation started"),
                E::Navigated { .. } => Some("navigation committed"),
                E::PageMessage { .. } => Some("page message received"),
                E::Deadline { .. } => Some("deadline checked"),
                _ => None,
            };
            if let Some(label) = label {
                trace(&mut self.startup_trace, label);
            }
        }
        match event {
            E::Attach {
                index,
                debug,
                restore,
            } => {
                super::packages::validate(&index)?;
                self.retire(&mut commands);
                self.debug = debug;
                self.instances.clear();
                for p in &index.packages {
                    let applet_id = AppletId(p.manifest.id.clone());
                    let sources = p
                        .manifest
                        .sources
                        .iter()
                        .map(|s| {
                            (
                                SourceId(s.id.clone()),
                                SourceSession {
                                    definition: s.clone(),
                                    last_url: s.start_url.clone(),
                                    status: SourceStatus::Dormant,
                                },
                            )
                        })
                        .collect();
                    self.instances.insert(
                        instance_id(&applet_id),
                        AppletInstance { applet_id, sources },
                    );
                }
                self.index = Some(index);
                if let Some(snapshot) = restore {
                    self.disabled.extend(snapshot.disabled);
                    for instance in self.instances.values_mut() {
                        for (id, source) in &mut instance.sources {
                            if let Some(url) = snapshot
                                .source_urls
                                .get(&source_key(&instance.applet_id, id))
                                && Self::safe_website_url(url)
                            {
                                source.last_url = url.clone();
                            }
                        }
                    }
                    // An APK may retire a bundled applet while its old Activity state survives.
                    // Restore only destinations still declared by the current package index.
                    let selection = snapshot.selection.filter(|selection| {
                        self.index.as_ref().is_some_and(|index| {
                            index.packages.iter().any(|package| {
                                package.manifest.id == selection.applet_id.0
                                    && package
                                        .manifest
                                        .sources
                                        .iter()
                                        .any(|source| source.id == selection.source_id.0)
                                    && selection.page_id.as_ref().is_none_or(|page_id| {
                                        package
                                            .manifest
                                            .pages
                                            .iter()
                                            .any(|page| &page.id == page_id)
                                    })
                            })
                        })
                    });
                    if let Some(selection) = selection {
                        self.open(selection, &mut commands)?;
                    } else {
                        commands.push(self.launcher());
                    }
                } else {
                    commands.push(self.launcher());
                }
            }
            E::Open {
                applet_id,
                source_id,
            } => {
                self.qualification = None;
                self.open(
                    Selection {
                        applet_id: AppletId(applet_id),
                        source_id: SourceId(source_id),
                        page_id: None,
                    },
                    &mut commands,
                )?;
            }
            E::OpenPage { page_id } => {
                if let Some(view) = &self.active {
                    let mut selection = view.selection.clone();
                    selection.page_id = Some(page_id);
                    self.qualification = None;
                    self.open(selection, &mut commands)?;
                }
            }
            E::Home => {
                self.qualification = None;
                self.retire(&mut commands);
                commands.push(self.launcher());
            }
            E::Back { can_go_back } => {
                if let Some(view) = &self.active {
                    if self.fullscreen {
                        commands.push(C::ExitFullscreen {
                            generation: view.context.generation.0,
                        });
                    } else if view.selection.page_id.is_some() {
                        let mut selection = view.selection.clone();
                        selection.page_id = None;
                        self.open(selection, &mut commands)?;
                    } else if can_go_back {
                        commands.push(C::GoBack {
                            generation: view.context.generation.0,
                        });
                    } else {
                        self.retire(&mut commands);
                        commands.push(self.launcher());
                    }
                } else {
                    commands.push(C::FinishActivity);
                }
            }
            E::Reload => {
                if let Some(view) = &self.active {
                    commands.push(C::Reload {
                        generation: view.context.generation.0,
                    });
                }
            }
            E::Retry | E::Ordinary => {
                if let Some(view) = &self.active {
                    let mut selection = view.selection.clone();
                    if matches!(event, E::Ordinary) {
                        selection.page_id = None;
                        self.disabled.insert(selection.applet_id.clone());
                    } else {
                        self.disabled.remove(&selection.applet_id);
                    }
                    self.qualification = None;
                    self.open(selection, &mut commands)?;
                }
            }
            E::Capabilities {
                generation,
                supported,
                details,
            } if self.current(generation) => {
                self.details = details;
                self.active.as_mut().expect("view").supported = Some(supported);
                if !supported && self.active.as_ref().expect("view").customized {
                    self.present("unsupported", "This WebView provider lacks required customization features. Open the ordinary site or update the provider.", &mut commands);
                }
            }
            E::NavigationStarted {
                generation,
                url,
                same_document,
            } if self.current(generation) => {
                let view = self.active.as_mut().expect("view");
                if !same_document {
                    increment(&mut view.epoch)?;
                    if let Some(doc) = &view.document {
                        commands.push(C::ReplyToPage {
                            generation,
                            channel: doc.channel,
                            message: json!({"type":"context.retired","documentId":doc.id}),
                        });
                    }
                    view.document = None;
                    view.challenge = None;
                    view.ready = false;
                    view.failed = false;
                } else if let Some(doc) = &mut view.document {
                    increment(&mut doc.route_revision.0)?;
                }
                view.url = url;
                self.navigation_presentation(&mut commands);
            }
            E::Navigated { generation, url } if self.current(generation) => {
                let view = self.active.as_mut().expect("view");
                view.url = url.clone();
                if view.selection.page_id.is_none()
                    && Self::safe_website_url(&url)
                    && let Some(source) = self
                        .instances
                        .get_mut(&view.context.instance_id)
                        .and_then(|i| i.sources.get_mut(&view.selection.source_id))
                {
                    source.last_url = url;
                }
                if view.customized
                    && view.supported == Some(true)
                    && !view.ready
                    && !view.failed
                    && Self::eligible(view)
                {
                    commands.push(C::ScheduleDeadline {
                        generation,
                        epoch: view.epoch,
                    });
                }
                self.navigation_presentation(&mut commands);
            }
            E::PageMessage {
                generation,
                channel,
                origin: callback_origin,
                main_frame,
                message,
            } if self.current(generation) => {
                self.message(
                    generation,
                    channel,
                    &callback_origin,
                    main_frame,
                    &message,
                    &mut commands,
                )?;
            }
            E::Deadline { generation, epoch } if self.current(generation) => {
                let view = self.active.as_ref().expect("view");
                if view.epoch == epoch
                    && view.customized
                    && view.supported == Some(true)
                    && !view.ready
                    && !view.failed
                    && Self::eligible(view)
                {
                    self.failure("Startup timed out after five seconds. No current-document ready result was accepted.", &mut commands);
                }
            }
            E::LoadFailed {
                generation,
                message,
            } if self.current(generation) => self.failure(&message, &mut commands),
            E::RendererUnresponsive { generation } if self.current(generation) => {
                self.disable_active();
                self.qualification = None;
                self.failure("Renderer unresponsive. Customization disabled; terminating the renderer before recovery.", &mut commands);
                commands.push(C::TerminateRenderer { generation });
            }
            E::RendererGone { generation } if self.current(generation) => {
                self.disable_active();
                self.qualification = None;
                let mut selection = self.active.as_ref().expect("view").selection.clone();
                selection.page_id = None;
                self.open(selection, &mut commands)?;
                self.present("ordinary", "Renderer stopped. Customization is disabled for this applet; ordinary browsing was recreated.", &mut commands);
            }
            E::FullscreenRequested { generation } if self.current(generation) => {
                self.fullscreen = true;
                commands.push(C::ShowFullscreen { generation });
            }
            E::FullscreenClosed { generation } if self.current(generation) => {
                self.fullscreen = false
            }
            E::SaveSession => commands.push(C::RetainSession {
                snapshot: self.snapshot(),
            }),
            E::Suspended => {
                self.notify("host.suspended", &mut commands);
                self.source_status(SourceStatus::Suspended);
            }
            E::Resumed => {
                self.notify("host.resumed", &mut commands);
            }
            E::Inspect if self.debug => {
                commands.push(C::Diagnostics {
                    text: self.diagnostics(),
                });
                self.notify("debug.inspect", &mut commands);
            }
            E::DebugFailure if self.debug => self.notify("debug.fail", &mut commands),
            E::DebugTerminate if self.debug => {
                if let Some(view) = &self.active {
                    commands.push(C::TerminateRenderer {
                        generation: view.context.generation.0,
                    });
                    self.disable_active();
                }
            }
            E::Qualify if self.debug => {
                if self.active.as_ref().is_some_and(|v| v.ready) {
                    self.qualification = Some(HashSet::new());
                    commands.push(C::Reload {
                        generation: self.active.as_ref().expect("view").context.generation.0,
                    });
                } else {
                    commands.push(C::Diagnostics {
                        text: "Reach a qualified ready document before starting 20 reload cycles."
                            .into(),
                    });
                }
            }
            E::Detach => {
                self.retire(&mut commands);
            }
            _ => {}
        }
        Ok(commands)
    }

    fn current(&self, generation: u64) -> bool {
        self.active
            .as_ref()
            .is_some_and(|v| v.context.generation.0 == generation)
    }
    fn eligible(view: &LiveView) -> bool {
        origin(&view.url).is_some_and(|o| view.origins.contains(&o))
    }
    fn safe_website_url(url: &str) -> bool {
        Url::parse(url).is_ok_and(|u| {
            u.scheme() == "https"
                && u.host_str() != Some("appassets.androidplatform.net")
                && u.username().is_empty()
                && u.password().is_none()
        })
    }
    fn open(&mut self, selection: Selection, commands: &mut Vec<C>) -> Result<(), String> {
        let package = self
            .index
            .as_ref()
            .and_then(|i| {
                i.packages
                    .iter()
                    .find(|p| p.manifest.id == selection.applet_id.0)
            })
            .cloned()
            .ok_or("Unknown applet")?;
        let source = self
            .instances
            .get(&instance_id(&selection.applet_id))
            .and_then(|i| i.sources.get(&selection.source_id))
            .ok_or("Unknown source")?;
        let mut url = source.last_url.clone();
        let (binding, origins, entry, local_assets) = if let Some(page_id) = &selection.page_id {
            let page = package
                .manifest
                .pages
                .iter()
                .find(|p| &p.id == page_id)
                .ok_or("Unknown local page")?;
            let compiled = format!("pages/{page_id}/index.html");
            let asset = package
                .assets
                .iter()
                .find(|a| a.path == compiled)
                .ok_or("Missing declared local page HTML")?;
            let url_path = format!(
                "/genesis/{}/{}/{}/index.html",
                package.manifest.id, package.revision, page_id
            );
            url = format!("https://appassets.androidplatform.net{url_path}");
            (
                ContextKind::Page {
                    page_id: page_id.clone(),
                },
                vec!["https://appassets.androidplatform.net".into()],
                page.entry.clone(),
                vec![LocalAsset {
                    url_path,
                    asset_path: format!(
                        "packages/{}/{}/{}",
                        package.manifest.id, package.revision, compiled
                    ),
                    sha256: asset.sha256.clone(),
                }],
            )
        } else {
            (
                ContextKind::Source {
                    source_id: selection.source_id.clone(),
                },
                source.definition.origins.clone(),
                source.definition.entry.clone(),
                Vec::new(),
            )
        };
        self.retire(commands);
        let generation = increment(&mut self.generation)?;
        let context = ExecutionContext {
            instance_id: instance_id(&selection.applet_id),
            applet_id: selection.applet_id.clone(),
            view_id: ViewId(format!("view-{generation}")),
            generation: ViewGeneration(generation),
            binding,
        };
        let customized =
            selection.page_id.is_some() || !self.disabled.contains(&selection.applet_id);
        self.active = Some(LiveView {
            context: context.clone(),
            package: package.clone(),
            selection,
            url: url.clone(),
            origins: origins.clone(),
            customized,
            supported: None,
            epoch: 0,
            ready: false,
            failed: false,
            document: None,
            challenge: None,
        });
        self.source_status(SourceStatus::Loading);
        commands.push(C::CreateView {
            generation,
            package: Box::new(package),
            context,
            origins,
            entry,
            customized,
            local_assets,
        });
        self.present(
            if customized { "loading" } else { "ordinary" },
            if customized {
                "Qualifying this document…"
            } else {
                "Ordinary browsing. Customization disabled."
            },
            commands,
        );
        commands.push(C::LoadUrl { generation, url });
        Ok(())
    }
    fn retire(&mut self, commands: &mut Vec<C>) {
        if let Some(view) = self.active.take() {
            let generation = view.context.generation.0;
            if self.fullscreen {
                commands.push(C::ExitFullscreen { generation });
                self.fullscreen = false;
            }
            if let Some(doc) = view.document {
                commands.push(C::ReplyToPage {
                    generation,
                    channel: doc.channel,
                    message: json!({"type":"context.retired","documentId":doc.id}),
                });
            }
            commands.push(C::DestroyView { generation });
        }
    }
    fn disable_active(&mut self) {
        if let Some(view) = &self.active {
            self.disabled.insert(view.context.applet_id.clone());
        }
    }
    fn source_status(&mut self, status: SourceStatus) {
        if let Some(v) = &self.active
            && let Some(s) = self
                .instances
                .get_mut(&v.context.instance_id)
                .and_then(|i| i.sources.get_mut(&v.selection.source_id))
        {
            s.status = status;
        }
    }
    fn navigation_presentation(&self, commands: &mut Vec<C>) {
        if let Some(view) = &self.active {
            if !view.customized {
                self.present(
                    "ordinary",
                    "Ordinary browsing. Customization disabled.",
                    commands,
                );
            } else if view.supported == Some(false) || view.failed {
                // Preserve the explicit unsupported/failure presentation until recovery.
            } else if !Self::eligible(view) {
                self.present("ordinary", "Ordinary external/authentication page. No Genesis bridge is registered for this origin.", commands);
            } else if view.ready {
                self.present("ready", "MVP-02 · Wasm, creator, CSS and owned UI ready. Feature applets remain incomplete.", commands);
            } else {
                self.present(
                    "loading",
                    "Waiting for current-document runtime qualification…",
                    commands,
                );
            }
        }
    }
    pub(crate) fn present(&self, state: &str, message: &str, commands: &mut Vec<C>) {
        if let Some(view) = &self.active {
            commands.push(C::Presentation {
                generation: view.context.generation.0,
                state: state.into(),
                message: message.into(),
                actions: view.package.manifest.actions.clone(),
            });
        }
    }
    pub(crate) fn failure(&mut self, message: &str, commands: &mut Vec<C>) {
        if self.qualification.take().is_some() {
            commands.push(C::Diagnostics {
                text: format!("20-cycle qualification failed: {message}"),
            });
        }
        if let Some(view) = &mut self.active {
            view.ready = false;
            view.failed = true;
        }
        self.notify("context.retired", commands);
        if let Some(view) = &mut self.active {
            view.document = None;
            view.challenge = None;
        }
        self.source_status(SourceStatus::Failed);
        self.present("failed", message, commands);
    }
    fn notify(&self, kind: &str, commands: &mut Vec<C>) {
        if let Some(view) = &self.active
            && let Some(doc) = &view.document
        {
            commands.push(C::ReplyToPage {
                generation: view.context.generation.0,
                channel: doc.channel,
                message: json!({"type":kind,"documentId":doc.id}),
            });
        }
    }
    fn snapshot(&self) -> SessionSnapshot {
        SessionSnapshot {
            selection: self.active.as_ref().map(|v| v.selection.clone()),
            disabled: self.disabled.iter().cloned().collect(),
            source_urls: self
                .instances
                .values()
                .flat_map(|i| {
                    i.sources
                        .iter()
                        .map(|(id, s)| (source_key(&i.applet_id, id), s.last_url.clone()))
                })
                .collect(),
        }
    }
    pub(crate) fn diagnostics(&self) -> String {
        let current = self.active.as_ref().map(|v| json!({"context":v.context,"revision":v.package.revision,
            "url": Url::parse(&v.url).ok().map(|u| format!("{}{}",u.origin().ascii_serialization(),u.path())),
            "documentId":v.document.as_ref().map(|d| &d.id), "nonceBound":v.document.as_ref().is_some_and(|d| !d.nonce.0.is_empty()),
            "ready":v.ready,"customized":v.customized,"epoch":v.epoch}));
        format!(
            "{}\n{}\nStartup: {:?}",
            self.details,
            serde_json::to_string_pretty(&current).unwrap_or_default(),
            self.startup_trace
        )
    }
    fn launcher(&self) -> C {
        C::ShowLauncher {
            entries: self
                .index
                .iter()
                .flat_map(|i| &i.packages)
                .flat_map(|p| {
                    p.manifest.sources.iter().map(|s| LauncherEntry {
                        applet_id: p.manifest.id.clone(),
                        source_id: s.id.clone(),
                        label: p.manifest.name.clone(),
                    })
                })
                .collect(),
            status: "MVP-02 · Browser qualification. Website features are not implemented yet."
                .into(),
        }
    }

    fn message(
        &mut self,
        generation: u64,
        channel: u64,
        callback_origin: &str,
        main_frame: bool,
        raw: &str,
        commands: &mut Vec<C>,
    ) -> Result<(), String> {
        let view = self.active.as_mut().expect("view");
        if !main_frame
            || raw.len() > 262_144
            || view.failed
            || !view.customized
            || view.supported != Some(true)
            || !view.origins.iter().any(|o| o == callback_origin)
            || origin(&view.url).as_deref() != Some(callback_origin)
        {
            return Ok(());
        }
        let Ok(message) = serde_json::from_str::<Value>(raw) else {
            return Ok(());
        };
        if message["v"] != 1 {
            return Ok(());
        }
        match message["type"].as_str() {
            Some("hello") => {
                if self.debug {
                    trace(&mut self.startup_trace, "hello accepted");
                }
                let nonce = message["nonce"]
                    .as_str()
                    .filter(|s| s.len() == 36)
                    .ok_or("Invalid document nonce")?;
                if message["revision"].as_str() != Some(view.package.revision.as_str()) {
                    self.failure("Package revision mismatch", commands);
                    return Ok(());
                }
                increment(&mut view.epoch)?;
                view.ready = false;
                view.document = None;
                let challenge =
                    format!("challenge-{}-{}", generation, increment(&mut self.serial)?);
                let nonce = DocumentNonce(nonce.into());
                view.challenge = Some(ChallengeBinding {
                    channel,
                    nonce: nonce.clone(),
                    challenge: challenge.clone(),
                });
                commands.push(C::Challenge {
                    generation,
                    channel,
                    nonce,
                    challenge,
                });
                commands.push(C::ScheduleDeadline {
                    generation,
                    epoch: view.epoch,
                });
            }
            Some("challengeAck") => {
                if self.debug {
                    trace(
                        &mut self.startup_trace,
                        "challenge acknowledgement received",
                    );
                }
                let Some(pending) = view.challenge.as_ref() else {
                    return Ok(());
                };
                if pending.channel != channel
                    || message["nonce"].as_str() != Some(&pending.nonce.0)
                    || message["challenge"].as_str() != Some(&pending.challenge)
                {
                    return Ok(());
                }
                let id = DocumentId(format!("doc-{}", increment(&mut self.serial)?));
                let nonce = pending.nonce.clone();
                view.document = Some(DocumentBinding {
                    id: id.clone(),
                    channel,
                    nonce: nonce.clone(),
                    wasm_reported: false,
                    route_revision: RouteRevision(0),
                });
                view.challenge = None;
                if self.debug {
                    trace(&mut self.startup_trace, "document bound");
                }
                commands.push(C::ReplyToPage {generation,channel,message:json!({"type":"bound","documentId":id,"nonce":nonce,"context":view.context})});
            }
            _ => {
                let Some(doc) = &mut view.document else {
                    return Ok(());
                };
                if doc.channel != channel || message["documentId"].as_str() != Some(&doc.id.0) {
                    if self.debug {
                        trace(&mut self.startup_trace, "bound envelope rejected");
                    }
                    return Ok(());
                }
                let request = message["requestId"]
                    .as_str()
                    .filter(|r| r.len() <= 128)
                    .ok_or("Missing request ID")?;
                match message["method"].as_str() {
                    Some("runtime.phase") if message["params"]["phase"]=="wasm" => {
                        doc.wasm_reported=true;
                        if self.debug { trace(&mut self.startup_trace, "wasm initialized"); }
                    },
                    Some("runtime.ready") => {
                        let phases=&message["params"]["phases"];
                        if !doc.wasm_reported || !["wasm","creator","style","mount"].iter().all(|p| phases[p]==true) {
                            self.failure("Runtime ready did not include all qualified effects",commands);return Ok(());
                        }
                        if view.ready {return Ok(());} view.ready=true;
                        if self.debug { trace(&mut self.startup_trace, "runtime ready"); }
                        if let Some(seen)=&mut self.qualification {
                            if !seen.insert(doc.id.clone()) {self.failure("Qualification reused a retired document",commands);return Ok(());}
                            if seen.len()<20 {commands.push(C::Reload {generation});}
                            else { self.qualification=None;commands.push(C::Diagnostics {text:"20/20 reload cycles accepted fresh document identities and reached Wasm/creator/CSS/mount ready.".into()}); }
                        }
                        self.source_status(SourceStatus::Active);
                        self.navigation_presentation(commands);
                    }
                    Some("runtime.error") => {
                        if self.debug { trace(&mut self.startup_trace, "runtime error"); }
                        let reason=message["params"]["message"].as_str().unwrap_or("Unknown creator/runtime error");
                        let bounded:String=reason.chars().take(1024).collect();self.failure(&bounded,commands);
                    }
                    Some("debug.inspection") if self.debug => commands.push(C::Diagnostics {text:format!("{}\n{}",self.diagnostics(),message["params"])}),
                    _ => commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                        "error":{"code":"UNSUPPORTED","message":"Method is not exposed in MVP-02","retryable":false}})}),
                }
            }
        }
        Ok(())
    }
}
