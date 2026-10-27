use genesis_contracts::{HostCommand, HostEvent, LauncherEntry, PackageIndex};
use std::collections::HashMap;
use url::Url;

#[derive(Default)]
pub struct HostState {
    index: Option<PackageIndex>,
    generation: u64,
    active: Option<(String, String)>,
    last_urls: HashMap<(String, String), String>,
}

impl HostState {
    pub fn dispatch(&mut self, event: HostEvent) -> Result<Vec<HostCommand>, String> {
        use HostCommand as C;
        use HostEvent as E;
        let mut commands = Vec::new();
        match event {
            E::Attach { index } => {
                super::packages::validate(&index)?;
                self.retire(&mut commands);
                self.index = Some(index);
                commands.push(self.launcher());
            }
            E::Open {
                applet_id,
                source_id,
            } => {
                let source = self
                    .index
                    .as_ref()
                    .and_then(|i| i.packages.iter().find(|p| p.manifest.id == applet_id))
                    .and_then(|p| p.manifest.sources.iter().find(|s| s.id == source_id))
                    .ok_or("Unknown applet/source ID")?;
                let key = (applet_id, source_id);
                let url = self
                    .last_urls
                    .get(&key)
                    .cloned()
                    .unwrap_or_else(|| source.start_url.clone());
                self.retire(&mut commands);
                self.generation = self
                    .generation
                    .checked_add(1)
                    .filter(|g| *g <= 9_007_199_254_740_991)
                    .ok_or("View generation exhausted")?;
                self.active = Some(key);
                commands.push(C::CreateView {
                    generation: self.generation,
                });
                commands.push(C::LoadUrl {
                    generation: self.generation,
                    url,
                });
            }
            E::Home => {
                self.retire(&mut commands);
                commands.push(self.launcher());
            }
            E::Back { can_go_back } => {
                if self.active.is_some() {
                    if can_go_back {
                        commands.push(C::GoBack {
                            generation: self.generation,
                        });
                    } else {
                        self.retire(&mut commands);
                        commands.push(self.launcher());
                    }
                } else {
                    commands.push(C::FinishActivity);
                }
            }
            E::Reload if self.active.is_some() => commands.push(C::Reload {
                generation: self.generation,
            }),
            E::Navigated { generation, url } if self.is_current(generation) => {
                if let Ok(parsed) = Url::parse(&url)
                    && matches!(parsed.scheme(), "https" | "http")
                {
                    self.last_urls
                        .insert(self.active.clone().expect("current view"), url);
                }
            }
            E::LoadFailed {
                generation,
                message,
            } if self.is_current(generation) => commands.push(C::ShowError { message }),
            E::RendererGone { generation } if self.is_current(generation) => {
                self.retire(&mut commands);
                commands.push(self.launcher());
                commands.push(C::ShowError {
                    message: "Browser renderer stopped. Reopen a site to retry ordinary browsing."
                        .into(),
                });
            }
            E::Detach => self.retire(&mut commands),
            _ => {}
        }
        Ok(commands)
    }

    fn is_current(&self, generation: u64) -> bool {
        self.active.is_some() && generation == self.generation
    }

    fn retire(&mut self, commands: &mut Vec<HostCommand>) {
        if self.active.take().is_some() {
            commands.push(HostCommand::DestroyView {
                generation: self.generation,
            });
        }
    }

    fn launcher(&self) -> HostCommand {
        let entries = self
            .index
            .iter()
            .flat_map(|i| &i.packages)
            .flat_map(|p| {
                p.manifest.sources.iter().map(|s| LauncherEntry {
                    applet_id: p.manifest.id.clone(),
                    source_id: s.id.clone(),
                    label: if p.manifest.sources.len() == 1 {
                        p.manifest.name.clone()
                    } else {
                        format!("{} / {}", p.manifest.name, s.id)
                    },
                })
            })
            .collect();
        HostCommand::ShowLauncher { entries,
            status: "MVP-01 · Rust host active · Ordinary browsing only. Applet customization is not implemented.".into() }
    }
}
