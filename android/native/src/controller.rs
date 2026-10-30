use crate::sources::*;
use genesis_contracts::{HostCommand as C, HostEvent as E, *};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet, VecDeque};
use url::Url;

#[derive(Default)]
pub struct HostState {
    index: Option<PackageIndex>,
    section_destinations: HashMap<String, SectionDestination>,
    pending_back: Option<(u64, u64, bool)>,
    instances: HashMap<InstanceId, AppletInstance>,
    pub(crate) active: Option<LiveView>,
    disabled: HashSet<AppletId>,
    retained: VecDeque<LiveView>,
    pending_opener: Option<Selection>,
    generation: u64,
    serial: u64,
    debug: bool,
    fullscreen: bool,
    modal_open: bool,
    modal_token: u64,
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
fn is_home_url(url: &str, source: &Source) -> bool {
    Url::parse(url).ok().is_some_and(|parsed| {
        source
            .origins
            .contains(&parsed.origin().ascii_serialization())
            && source.home_paths.iter().any(|path| path == parsed.path())
    })
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
            E::ClassifyUrl { url } => {
                let kind = self
                    .active
                    .as_ref()
                    .map(|v| Self::classify_url(v, &url))
                    .unwrap_or("ordinary");
                commands.push(C::ClassifiedUrl { kind: kind.into() });
            }
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
                    let restored_url = snapshot.current_url.clone();
                    self.section_destinations = snapshot.section_destinations.clone();
                    self.pending_opener = snapshot.opener.clone();
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
                        if let Some(url) = restored_url
                            && let Some(view) = self.active.as_mut()
                            && view.selection.page_id.is_none()
                            && Self::safe_website_url(&url)
                            && origin(&url).is_some_and(|o| view.origins.contains(&o))
                        {
                            view.url = url.clone();
                            commands.retain(|c| !matches!(c, C::LoadUrl { .. }));
                            commands.push(C::LoadUrl {
                                generation: view.context.generation.0,
                                url,
                            });
                        }
                    } else {
                        commands.push(self.launcher());
                    }
                } else {
                    commands.push(self.launcher());
                }
            }
            E::Open {
                url,
                applet_id,
                source_id,
                page_id,
                section_id,
            } => {
                self.remember_section();
                let section_id = section_id.or_else(|| {
                    self.index
                        .as_ref()
                        .and_then(|index| {
                            index.packages.iter().find(|p| p.manifest.id == applet_id)
                        })
                        .and_then(|p| p.manifest.shell.as_ref())
                        .and_then(|shell| {
                            shell
                                .sections
                                .iter()
                                .find(|s| s.source_id == source_id && s.page_id == page_id)
                        })
                        .map(|s| s.id.clone())
                });
                if url.is_none()
                    && section_id.is_some()
                    && self.active.as_ref().is_some_and(|v| {
                        v.selection.applet_id.0 == applet_id && v.selection.section_id == section_id
                    })
                {
                    return Ok(commands);
                }
                let remembered = section_id
                    .as_ref()
                    .and_then(|section| {
                        self.section_destinations
                            .get(&format!("{applet_id}/{section}"))
                    })
                    .cloned()
                    .filter(|_| url.is_none());
                let restoring_section = remembered.is_some();
                let (source_id, page_id, url) = if let Some(saved) = remembered {
                    self.pending_opener = saved.opener;
                    let source_url = saved.selection.page_id.is_none().then_some(saved.url);
                    (
                        saved.selection.source_id.0,
                        saved.selection.page_id,
                        source_url,
                    )
                } else {
                    (source_id, page_id, url)
                };
                self.qualification = None;
                if !restoring_section
                    && url.is_some()
                    && let Some(view) = &self.active
                    && view.selection.page_id.is_some()
                {
                    self.pending_opener = Some(view.selection.clone());
                }
                self.open(
                    Selection {
                        section_id,
                        applet_id: AppletId(applet_id),
                        source_id: SourceId(source_id),
                        page_id,
                    },
                    &mut commands,
                )?;
                if let Some(url) = url {
                    if !Self::safe_website_url(&url) {
                        return Err("Unsafe destination".into());
                    }
                    if let Some(view) = self.active.as_mut()
                        && view.url != url
                    {
                        view.url = url.clone();
                        commands.retain(|c| !matches!(c, C::LoadUrl { .. }));
                        commands.push(C::LoadUrl {
                            generation: view.context.generation.0,
                            url,
                        });
                    }
                }
            }
            E::OpenPage { page_id } => {
                if let Some(view) = &self.active {
                    let mut selection = view.selection.clone();
                    selection.page_id = Some(page_id);
                    self.qualification = None;
                    self.open(selection, &mut commands)?;
                }
            }
            E::ActivateDestination {
                generation,
                document_id,
                selection,
                url,
            } if self.current(generation)
                && self
                    .active
                    .as_ref()
                    .and_then(|v| v.document.as_ref())
                    .is_some_and(|d| d.id == document_id) =>
            {
                let temporary_url = url.as_ref().is_some_and(|value| {
                    self.instances
                        .get(&instance_id(&selection.applet_id))
                        .and_then(|i| i.sources.get(&selection.source_id))
                        .is_some_and(|source| !is_home_url(value, &source.definition))
                });
                let previous_url = self
                    .instances
                    .get(&instance_id(&selection.applet_id))
                    .and_then(|i| i.sources.get(&selection.source_id))
                    .map(|source| source.last_url.clone());
                let requested_url = url.clone();
                if let Some(url) = url {
                    let source = self
                        .instances
                        .get_mut(&instance_id(&selection.applet_id))
                        .and_then(|i| i.sources.get_mut(&selection.source_id))
                        .ok_or("Unknown source")?;
                    source.last_url = url;
                }
                if temporary_url
                    && let Some(view) = &self.active
                    && view.selection.page_id.is_some()
                {
                    self.pending_opener = Some(view.selection.clone());
                }
                self.open(selection.clone(), &mut commands)?;
                if let Some(url) = requested_url
                    && let Some(view) = self.active.as_mut()
                {
                    view.url = url.clone();
                    commands.retain(|c| !matches!(c, C::LoadUrl { .. }));
                    commands.push(C::LoadUrl {
                        generation: view.context.generation.0,
                        url,
                    });
                }
                if temporary_url
                    && let Some(previous) = previous_url
                    && let Some(source) = self
                        .instances
                        .get_mut(&instance_id(&selection.applet_id))
                        .and_then(|i| i.sources.get_mut(&selection.source_id))
                {
                    source.last_url = previous;
                }
            }
            E::ModalDeadline {
                generation,
                document_id,
                token,
            } if self.current(generation)
                && self.modal_open
                && self.modal_token == token
                && self
                    .active
                    .as_ref()
                    .and_then(|v| v.document.as_ref())
                    .is_some_and(|d| d.id == document_id) =>
            {
                self.disable_active();
                self.failure(
                    "Modal did not dismiss within 300 ms. Recovering the renderer.",
                    &mut commands,
                );
                commands.push(C::TerminateRenderer { generation });
            }
            E::Home => {
                self.remember_section();
                self.qualification = None;
                self.retire(&mut commands);
                commands.push(self.launcher());
            }
            E::Back { can_go_back } => {
                if let Some(view) = &self.active {
                    if self.modal_open {
                        let generation = view.context.generation.0;
                        if let Some(doc) = &view.document {
                            let document_id = doc.id.clone();
                            self.notify("ui.dismissModal", &mut commands);
                            let token = increment(&mut self.modal_token)?;
                            commands.push(C::ScheduleModalDeadline {
                                generation,
                                document_id,
                                token,
                            });
                        }
                    } else if self.fullscreen {
                        commands.push(C::ExitFullscreen {
                            generation: view.context.generation.0,
                        });
                    } else if view.back_handler
                        && let Some(doc) = &view.document
                    {
                        if self.pending_back.is_none() {
                            let token = increment(&mut self.serial)?;
                            self.pending_back = Some((token, doc.route_revision.0, can_go_back));
                            commands.push(C::ReplyToPage { generation:view.context.generation.0, channel:doc.channel, message:json!({"type":"navigation.back","documentId":doc.id,"token":token}) });
                            commands.push(C::ScheduleBackDeadline {
                                generation: view.context.generation.0,
                                document_id: doc.id.clone(),
                                token,
                            });
                        }
                    } else {
                        self.back_navigation(can_go_back, &mut commands)?;
                    }
                } else {
                    commands.push(C::FinishActivity);
                }
            }
            E::BackDeadline {
                generation,
                document_id,
                token,
            } if self.current(generation)
                && self
                    .active
                    .as_ref()
                    .and_then(|v| v.document.as_ref())
                    .is_some_and(|d| d.id == document_id)
                && self.pending_back.is_some_and(|p| p.0 == token) =>
            {
                let (_, _, can_go_back) = self.pending_back.take().expect("pending Back");
                self.back_navigation(can_go_back, &mut commands)?;
            }
            E::Forward => {
                if let Some(view) = &self.active {
                    commands.push(C::GoForward {
                        generation: view.context.generation.0,
                    });
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
                    self.retire(&mut commands);
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
                    self.source_status(SourceStatus::Blocked);
                    self.present("unsupported", "This WebView provider lacks required customization features. Open the ordinary site or update the provider.", &mut commands);
                }
            }
            E::NavigationStarted {
                generation,
                url,
                same_document,
            } if self.current(generation) => {
                if self.redirect_policy(&url, &mut commands) {
                    return Ok(commands);
                }
                let was_ordinary = self
                    .active
                    .as_ref()
                    .is_some_and(|view| !Self::eligible(view));
                let will_ordinary = self.active.as_ref().is_some_and(|view| {
                    !matches!(Self::classify_url(view, &url), "source" | "page")
                });
                let view = self.active.as_mut().expect("view");
                if !same_document || will_ordinary {
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
                    self.modal_open = false;
                    self.pending_back = None;
                    view.back_handler = false;
                    view.leave_guard = None;
                    commands.push(C::LeaveGuard {
                        generation,
                        message: None,
                    });
                } else if let Some(doc) = &mut view.document {
                    increment(&mut doc.route_revision.0)?;
                    commands.push(C::ReplyToPage {
                        generation,
                        channel: doc.channel,
                        message: json!({"type":"route.changed","documentId":doc.id,"url":url}),
                    });
                }
                view.url = url.clone();
                if same_document && was_ordinary && !will_ordinary {
                    commands.push(C::LoadUrl { generation, url });
                }
                self.navigation_presentation(&mut commands);
            }
            E::Navigated { generation, url } if self.current(generation) => {
                if self.redirect_policy(&url, &mut commands) {
                    return Ok(commands);
                }
                let view = self.active.as_mut().expect("view");
                view.url = url.clone();
                if view.selection.page_id.is_none()
                    && let Some(source) = self
                        .instances
                        .get_mut(&view.context.instance_id)
                        .and_then(|i| i.sources.get_mut(&view.selection.source_id))
                    && is_home_url(&url, &source.definition)
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
            E::SiteFailed {
                generation,
                message,
            } if self.current(generation) => {
                self.present("siteError", &message, &mut commands);
            }
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
            E::StorageCompleted { completion } => {
                if self
                    .completion_target(
                        completion.generation,
                        &completion.document_id,
                        completion.channel,
                        Some(&completion.applet_id),
                    )
                    .is_some()
                {
                    commands.push(C::ReplyToPage {
                        generation: completion.generation,
                        channel: completion.channel,
                        message: completion.response.clone(),
                    });
                }
                if let Some(view) = &self.active
                    && !view.failed
                    && view.context.applet_id.0 == completion.applet_id
                    && let Some(doc) = &view.document
                    && !completion.changed.is_empty()
                {
                    commands.push(C::ReplyToPage { generation:view.context.generation.0,channel:doc.channel,
                        message:json!({"type":"storage.changed","documentId":doc.id,"changes":completion.changed,
                        "namespaceRevision":completion.response["result"]["namespaceRevision"]}) });
                }
            }

            E::ConfigureServices => {
                if let Some(view) = &self.active {
                    commands.push(C::ConfigureServices {
                        generation: view.context.generation.0,
                        applet_id: view.context.applet_id.0.clone(),
                        services: view.package.manifest.services.clone(),
                    });
                }
            }
            E::ServiceCompleted { completion } => {
                if self
                    .completion_target(
                        completion.generation,
                        &completion.document_id,
                        completion.channel,
                        None,
                    )
                    .is_some()
                {
                    commands.push(C::ReplyToPage {
                        generation: completion.generation,
                        channel: completion.channel,
                        message: completion.response,
                    });
                }
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
                for view in self.retained.drain(..) {
                    commands.push(C::DestroyView {
                        generation: view.context.generation.0,
                    });
                }
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
    fn redirect_policy(&mut self, url: &str, commands: &mut Vec<C>) -> bool {
        let Some(view) = &self.active else {
            return false;
        };
        if !view.customized || view.selection.page_id.is_some() {
            return false;
        }
        let source = self
            .instances
            .get(&view.context.instance_id)
            .and_then(|i| i.sources.get(&view.selection.source_id));
        let fallback = Url::parse(url).ok().and_then(|u| {
            source.and_then(|s| {
                if !s
                    .definition
                    .origins
                    .contains(&u.origin().ascii_serialization())
                {
                    return None;
                }
                s.definition
                    .navigation_rules
                    .iter()
                    .find(|r| u.path().starts_with(&r.path_prefix))
                    .map(|r| r.fallback_url.clone())
            })
        });
        if let Some(url) = fallback {
            let generation = view.context.generation.0;
            self.notify("context.retired", commands);
            if let Some(view) = &mut self.active {
                view.document = None;
                view.ready = false;
                self.modal_open = false;
            }
            self.source_status(SourceStatus::Blocked);
            commands.push(C::LoadUrl { generation, url });
            true
        } else {
            false
        }
    }
    fn completion_target(
        &self,
        generation: u64,
        document_id: &DocumentId,
        channel: u64,
        applet_id: Option<&str>,
    ) -> Option<&LiveView> {
        self.active.iter().chain(self.retained.iter()).find(|view| {
            view.context.generation.0 == generation
                && !view.failed
                && view.customized
                && Self::eligible(view)
                && applet_id.is_none_or(|id| view.context.applet_id.0 == id)
                && view
                    .document
                    .as_ref()
                    .is_some_and(|doc| doc.id == *document_id && doc.channel == channel)
        })
    }

    fn eligible(view: &LiveView) -> bool {
        matches!(Self::route_kind(view), "source" | "page")
    }
    fn safe_website_url(url: &str) -> bool {
        Url::parse(url).is_ok_and(|u| {
            u.scheme() == "https"
                && u.host_str() != Some("appassets.androidplatform.net")
                && u.username().is_empty()
                && u.password().is_none()
        })
    }
    fn back_navigation(&mut self, can_go_back: bool, commands: &mut Vec<C>) -> Result<(), String> {
        if let Some(view) = &self.active {
            if can_go_back {
                commands.push(C::GoBack {
                    generation: view.context.generation.0,
                });
            } else if let Some(opener) = view.opener.clone() {
                self.open(opener, commands)?;
            } else if view.selection.page_id.is_some() {
                let mut selection = view.selection.clone();
                selection.page_id = None;
                self.open(selection, commands)?;
            } else {
                self.remember_section();
                self.retire(commands);
                commands.push(self.launcher());
            }
        }
        Ok(())
    }
    fn remember_section(&mut self) {
        if let Some(view) = &self.active
            && let Some(section) = &view.selection.section_id
        {
            self.section_destinations.insert(
                format!("{}/{}", view.selection.applet_id.0, section),
                SectionDestination {
                    selection: view.selection.clone(),
                    url: view.url.clone(),
                    opener: view.opener.clone(),
                },
            );
        }
    }
    fn open(&mut self, selection: Selection, commands: &mut Vec<C>) -> Result<(), String> {
        self.remember_section();
        if self.pending_opener.is_none()
            && self.active.as_ref().is_some_and(|v| {
                v.selection.applet_id == selection.applet_id
                    && v.selection.source_id == selection.source_id
                    && v.selection.page_id == selection.page_id
                    && v.opener.is_none()
                    && !v.failed
                    && v.customized
            })
        {
            return Ok(());
        }
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
        let target = self.retained.iter().position(|v| {
            self.pending_opener.is_none()
                && v.opener.is_none()
                && v.selection.applet_id == selection.applet_id
                && v.selection.source_id == selection.source_id
                && v.selection.page_id == selection.page_id
                && v.customized
        });
        // Retained documents keep their own generation, channels and history.
        let resumed = target.and_then(|i| self.retained.remove(i));
        if let Some(view) = self.active.take() {
            if view.package.manifest.shell.is_some()
                && view.customized
                && view.ready
                && view.opener.is_none()
                && !view.failed
            {
                commands.push(C::ParkView {
                    generation: view.context.generation.0,
                });
                self.retained.push_back(view);
            } else {
                self.active = Some(view);
                self.retire(commands);
            }
        }
        while self.retained.len() > 2 {
            if let Some(view) = self.retained.pop_front() {
                commands.push(C::DestroyView {
                    generation: view.context.generation.0,
                });
            }
        }
        if let Some(view) = resumed {
            commands.push(C::ResumeView {
                generation: view.context.generation.0,
            });
            self.active = Some(view);
            self.notify("host.focused", commands);
            self.navigation_presentation(commands);
            return Ok(());
        }
        let generation = increment(&mut self.generation)?;
        let context = ExecutionContext {
            runtime_api_version: package.runtime_api_version,
            instance_id: instance_id(&selection.applet_id),
            applet_id: selection.applet_id.clone(),
            view_id: ViewId(format!("view-{generation}")),
            generation: ViewGeneration(generation),
            binding,
        };
        let customized =
            selection.page_id.is_some() || !self.disabled.contains(&selection.applet_id);
        let owner_selection = self.pending_opener.take();
        self.active = Some(LiveView {
            back_handler: false,
            leave_guard: None,
            opener: owner_selection.clone(),
            context: context.clone(),
            package: package.clone(),
            selection: selection.clone(),
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
            selection,
            owner_selection,
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
        self.pending_back = None;
        self.modal_open = false;
        self.source_status(SourceStatus::Closed);
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
            && v.selection.page_id.is_none()
            && let Some(s) = self
                .instances
                .get_mut(&v.context.instance_id)
                .and_then(|i| i.sources.get_mut(&v.selection.source_id))
        {
            s.status = status;
        }
    }
    fn route_kind(view: &LiveView) -> &'static str {
        Self::classify_url(view, &view.url)
    }
    fn classify_url(view: &LiveView, destination: &str) -> &'static str {
        if !view.customized {
            return "ordinary";
        }
        let Ok(url) = Url::parse(destination) else {
            return "ordinary";
        };
        if let ContextKind::Page { page_id } = &view.context.binding {
            let expected = format!(
                "/genesis/{}/{}/{}/index.html",
                view.package.manifest.id, view.package.revision, page_id
            );
            return if url.origin().ascii_serialization() == "https://appassets.androidplatform.net"
                && url.path() == expected
            {
                "page"
            } else {
                "ordinary"
            };
        }
        if let Some(source) = view
            .package
            .manifest
            .sources
            .iter()
            .find(|s| s.id == view.selection.source_id.0)
            && source.origins.contains(&url.origin().ascii_serialization())
        {
            if crate::routes::customized(source, url.path()) {
                "source"
            } else {
                "source-ordinary"
            }
        } else {
            "ordinary"
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
            } else if matches!(Self::route_kind(view), "ordinary" | "source-ordinary") {
                self.present("ordinary", "Ordinary external/authentication page. No Genesis bridge is registered for this origin.", commands);
            } else if view.ready {
                self.present("ready", "Genesis · Customization ready.", commands);
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
                epoch: view.epoch,
                document_id: view.document.as_ref().map(|d| d.id.clone()),
                route_kind: Self::route_kind(view).into(),
                detail: view
                    .package
                    .manifest
                    .sources
                    .iter()
                    .find(|s| s.id == view.selection.source_id.0)
                    .is_some_and(|s| {
                        view.selection.page_id.is_none() && !is_home_url(&view.url, s)
                    }),
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
            section_destinations: self.section_destinations.clone(),
            opener: self.active.as_ref().and_then(|v| v.opener.clone()),
            current_url: self.active.as_ref().map(|v| v.url.clone()),
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
                .filter_map(|p| {
                    p.manifest.sources.first().map(|source| LauncherEntry {
                        applet_id: p.manifest.id.clone(),
                        source_id: source.id.clone(),
                        page_id: None,
                        label: p.manifest.name.clone(),
                    })
                })
                .collect(),
            status: "Your customized apps".into(),
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
            || !Self::eligible(view)
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
                    runtime_reported: false,
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
                    Some("runtime.phase") if message["params"]["phase"]=="typescript" => {
                        doc.runtime_reported=true;
                        if self.debug { trace(&mut self.startup_trace, "typescript initialized"); }
                    },
                    Some("runtime.ready") => {
                        let phases=&message["params"]["phases"];
                        if !doc.runtime_reported || !["runtime","creator","style","mount"].iter().all(|p| phases[p]==true) {
                            self.failure("Runtime ready did not include all qualified effects",commands);return Ok(());
                        }
                        if view.ready {return Ok(());} view.ready=true;
                        if self.debug { trace(&mut self.startup_trace, "runtime ready"); }
                        if let Some(seen)=&mut self.qualification {
                            if !seen.insert(doc.id.clone()) {self.failure("Qualification reused a retired document",commands);return Ok(());}
                            if seen.len()<20 {commands.push(C::Reload {generation});}
                            else { self.qualification=None;commands.push(C::Diagnostics {text:"20/20 reload cycles accepted fresh document identities and reached TypeScript/creator/CSS/mount ready.".into()}); }
                        }
                        self.source_status(SourceStatus::Active);
                        self.navigation_presentation(commands);
                    }
                    Some("runtime.error") => {
                        if self.debug { trace(&mut self.startup_trace, "runtime error"); }
                        let reason=message["params"]["message"].as_str().unwrap_or("Unknown creator/runtime error");
                        let bounded:String=reason.chars().take(1024).collect();self.failure(&bounded,commands);
                    }
                    Some("services.request") => {
                        let params = &message["params"];
                        let service = params["serviceId"].as_str().unwrap_or("");
                        let path = params["path"].as_str().unwrap_or("");
                        let method = params["method"].as_str().unwrap_or("");
                        if view.package.manifest.capabilities.iter().any(|c| c == "services")
                            && view.package.manifest.services.iter().any(|s| s == service)
                            && path.starts_with('/') && !path.starts_with("//") && path.len() <= 2048
                            && !path.contains(['\\', '#', '\r', '\n'])
                            && ["GET", "POST", "PUT", "PATCH", "DELETE"].contains(&method)
                            && (method != "GET" || params["body"].is_null()) {
                            commands.push(C::ServiceRequest { job: ServiceJob { generation, document_id: doc.id.clone(), channel,
                                request_id: request.into(), applet_id: view.context.applet_id.0.clone(), service_id: service.into(),
                                path: path.into(), method: method.into(), body: params.get("body").filter(|v| !v.is_null()).cloned() } });
                        } else {
                            commands.push(C::ReplyToPage { generation, channel, message: json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                                "error":{"code":"INVALID_ARGUMENT","message":"Undeclared service or invalid request","retryable":false}}) });
                        }
                    }
                    Some("storage.get") | Some("storage.list") | Some("storage.commit") => {
                        let operation=serde_json::from_value::<StorageOperation>(json!({"method":message["method"],"params":message["params"]}));
                        if !view.package.manifest.capabilities.iter().any(|c|c=="storage") {
                            commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                                "error":{"code":"UNSUPPORTED","message":"Storage capability is not declared","retryable":false}})});
                        } else {
                            match operation.map_err(|e|crate::storage::StorageError{code:"INVALID_ARGUMENT",message:e.to_string()})
                                .and_then(|op| {crate::storage::validate(&op)?;Ok(op)}) {
                                Ok(operation)=>commands.push(C::StorageJob {job:StorageJob {generation,document_id:doc.id.clone(),channel,request_id:request.into(),
                                    applet_id:view.context.applet_id.0.clone(),data_schema_version:view.package.manifest.data_schema_version,operation}}),
                                Err(error)=>commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                                    "error":{"code":error.code,"message":error.message,"retryable":false}})}),
                            }
                        }
                    }
                    Some("route.changed") => {
                        let requested = message["params"]["url"].as_str();
                        if requested.is_some_and(|url| Self::safe_website_url(url) && origin(url)==origin(&view.url)) {
                            increment(&mut doc.route_revision.0)?;
                        }
                        commands.push(C::ReplyToPage { generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null}) });
                    }
                    Some("ui.modalState") if message["params"]["open"].is_boolean() => {
                        self.modal_open = message["params"]["open"]==true;
                        commands.push(C::ModalState { open: self.modal_open });
                        commands.push(C::ReplyToPage { generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null}) });
                    }
                    Some("navigation.backHandler") if view.context.runtime_api_version >= 2 => {
                        view.back_handler = message["params"]["enabled"] == true;
                        commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null})});
                    }
                    Some("navigation.leaveGuard") if view.context.runtime_api_version >= 2 => {
                        view.leave_guard = message["params"]["message"].as_str().map(|s| s.chars().take(160).collect::<String>()).filter(|s| !s.trim().is_empty());
                        commands.push(C::LeaveGuard {generation,message:view.leave_guard.clone()});
                        commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null})});
                    }
                    Some("navigation.backResult") if view.context.runtime_api_version >= 2 => {
                        let pending = self.pending_back.filter(|p| Some(p.0) == message["params"]["token"].as_u64());
                        commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null})});
                        if let Some((_, route_revision, can_go_back)) = pending {
                            self.pending_back = None;
                            if route_revision == doc.route_revision.0 && message["params"]["consumed"] != true { self.back_navigation(can_go_back, commands)?; }
                        }
                    }
                    Some("sources.open") | Some("pages.open") => {
                        let mut selection = view.selection.clone();
                        let mut destination_url = None;
                        let valid = if message["method"] == "pages.open" {
                            let id = message["params"]["pageId"].as_str();
                            selection.page_id = id.map(str::to_owned);
                            id.is_some_and(|id|view.package.manifest.pages.iter().any(|p|p.id==id))
                        } else {
                            let id = message["params"]["sourceId"].as_str();
                            selection.page_id = None;
                            if let Some(source) = view.package.manifest.sources.iter().find(|s|Some(s.id.as_str())==id) {
                                selection.source_id = SourceId(source.id.clone());
                                if message["params"]["url"].is_null() { true }
                                else if let Some(url) = message["params"]["url"].as_str() {
                                    let valid = url.len()<=2048 && Self::safe_website_url(url)
                                        && origin(url).is_some_and(|o|source.origins.contains(&o));
                                    if valid { destination_url = Some(url.to_owned()); }
                                    valid
                                } else { false }
                            } else { false }
                        };
                        if valid {
                            commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":true,"result":null})});
                            commands.push(C::DeferNavigation { generation, document_id:doc.id.clone(),selection,url:destination_url });
                        } else {
                            commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                                "error":{"code":"INVALID_ARGUMENT","message":"Unknown destination or URL outside the declared source origins","retryable":false}})});
                        }
                    }
                    Some("debug.inspection") if self.debug => commands.push(C::Diagnostics {text:format!("{}\n{}",self.diagnostics(),message["params"])}),
                    _ => commands.push(C::ReplyToPage {generation,channel,message:json!({"v":1,"documentId":doc.id,"requestId":request,"ok":false,
                        "error":{"code":"UNSUPPORTED","message":"Method is not exposed in this stage","retryable":false}})}),
                }
            }
        }
        Ok(())
    }
}
