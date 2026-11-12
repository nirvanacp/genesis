//! Installed applets: `files/applets/index.json` and one directory per current revision.
//!
//! An applet built for another Genesis stays in the index with its status and mismatches, so
//! the launcher lists it and refuses to start it. Every load classifies the installed
//! `bundle.json` again, so an upgrade turns old revisions incompatible without touching them.
use crate::{
    compat,
    imports::{IncompatibleBundle, VerifiedFiles},
    source::Source,
};
use genesis_contracts::{
    AppletStatus, Bundle, BundleHeader, Compatibility, Direction, FOREGROUND_ORIGIN, LauncherEntry, Manifest, Mismatch,
    ReleaseCapabilities,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// One line of `index.json`. Entries written before statuses existed have only the id and revision.
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexEntry {
    applet_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    revision: Option<u64>,
    #[serde(default)]
    name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    accent: Option<String>,
    #[serde(default = "current")]
    status: AppletStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    direction: Option<Direction>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    mismatches: Vec<Mismatch>,
    /// Absent on entries written before sources existed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<Source>,
}

/// Bundled applets the user removed, so staging does not bring them back.
const REMOVED_BUNDLED: &str = "removed-bundled.json";

fn current() -> AppletStatus {
    AppletStatus::Current
}

pub enum Installed {
    Current {
        revision: u64,
        manifest: Box<Manifest>,
    },
    /// `revision` names files an older Genesis installed; an import of an incompatible bundle writes none.
    Incompatible {
        revision: Option<u64>,
        name: String,
        accent: Option<String>,
        direction: Direction,
        mismatches: Vec<Mismatch>,
        /// Read from the installed files; empty when there are none.
        origins: Vec<String>,
    },
}

#[derive(Default)]
pub struct Applets {
    root: PathBuf,
    installed: BTreeMap<String, Installed>,
    sources: BTreeMap<String, Source>,
    removed_bundled: BTreeSet<String>,
}

impl Applets {
    /// Reads the index and classifies every installed revision. An entry whose `bundle.json`
    /// cannot be read is dropped from the launcher.
    pub fn load(files_dir: &Path) -> Self {
        let root = files_dir.join("applets");
        let entries: Vec<IndexEntry> = fs::read(root.join("index.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let mut sources = BTreeMap::new();
        let installed = entries
            .into_iter()
            .filter_map(|entry| {
                if let Some(source) = entry.source.clone() {
                    sources.insert(entry.applet_id.clone(), source);
                }
                let installed = match entry.revision {
                    Some(revision) => classify(&root.join(&entry.applet_id).join(revision.to_string()), revision)?,
                    None => Installed::Incompatible {
                        revision: None,
                        name: entry.name,
                        accent: entry.accent,
                        direction: entry.direction.unwrap_or(Direction::Outdated),
                        mismatches: entry.mismatches,
                        origins: Vec::new(),
                    },
                };
                Some((entry.applet_id, installed))
            })
            .collect();
        let removed_bundled = fs::read(root.join(REMOVED_BUNDLED))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let mut applets = Self { root, installed, sources, removed_bundled };
        applets.sources.retain(|id, _| applets.installed.contains_key(id));
        applets
    }

    /// None when the applet is not installed, `Some(None)` for an entry without a source.
    pub fn source(&self, applet_id: &str) -> Option<Option<&Source>> {
        self.installed.contains_key(applet_id).then(|| self.sources.get(applet_id))
    }

    /// Every installed applet with its source.
    pub fn sources(&self) -> impl Iterator<Item = (&String, &Source)> {
        self.sources.iter()
    }

    /// Records a new source for an installed applet without writing a revision.
    pub fn set_source(&mut self, applet_id: &str, source: Source) -> Result<(), String> {
        let previous = self.sources.insert(applet_id.into(), source);
        let written = self.write_index();
        if written.is_err() {
            match previous {
                Some(previous) => self.sources.insert(applet_id.into(), previous),
                None => self.sources.remove(applet_id),
            };
        }
        written
    }

    pub fn removed_bundled(&self, applet_id: &str) -> bool {
        self.removed_bundled.contains(applet_id)
    }

    /// Deletes the applet's entry and files. A bundled applet is remembered as removed.
    pub fn remove(&mut self, applet_id: &str) -> Result<(), String> {
        let Some(installed) = self.installed.remove(applet_id) else { return Err(format!("Applet {applet_id} is not installed")) };
        let source = self.sources.remove(applet_id);
        if let Err(error) = self.write_index() {
            self.installed.insert(applet_id.into(), installed);
            if let Some(source) = source {
                self.sources.insert(applet_id.into(), source);
            }
            return Err(error);
        }
        let _ = fs::remove_dir_all(self.root.join(applet_id));
        if matches!(source, Some(Source::Bundled { .. })) && self.removed_bundled.insert(applet_id.into()) {
            self.write_removed_bundled()?;
        }
        Ok(())
    }

    fn write_removed_bundled(&self) -> Result<(), String> {
        let encoded = serde_json::to_vec(&self.removed_bundled).map_err(|e| e.to_string())?;
        write_atomic(&self.root.join(REMOVED_BUNDLED), &encoded)
    }

    /// The applet's revision and manifest, when it is installed and current.
    pub fn current(&self, applet_id: &str) -> Option<(u64, &Manifest)> {
        match self.installed.get(applet_id)? {
            Installed::Current { revision, manifest } => Some((*revision, manifest)),
            Installed::Incompatible { .. } => None,
        }
    }

    /// The absolute path of the current revision's icon, when its manifest names one that exists.
    pub fn icon(&self, applet_id: &str) -> Option<String> {
        let (revision, manifest) = self.current(applet_id)?;
        let relative = manifest.shell.as_ref()?.icon.as_ref()?;
        let path = self.root.join(applet_id).join(revision.to_string()).join(relative);
        path.is_file().then(|| path.to_string_lossy().into_owned())
    }

    /// The current applets that declare the website `origin`, in id order.
    pub fn for_origin(&self, origin: &str) -> Vec<String> {
        let declares = |manifest: &Manifest| manifest.origins.iter().any(|o| origin_of(o).as_deref() == Some(origin));
        self.installed
            .iter()
            .filter(|(_, installed)| matches!(installed, Installed::Current { manifest, .. } if declares(manifest)))
            .map(|(id, _)| id.clone())
            .collect()
    }

    pub fn launcher(&self) -> Vec<LauncherEntry> {
        self.installed.keys().filter_map(|id| self.entry(id)).collect()
    }

    /// The launcher entry with the source's details and the install time.
    pub fn entry(&self, applet_id: &str) -> Option<LauncherEntry> {
        let installed = self.installed.get(applet_id)?;
        let mut entry = entry(applet_id, installed);
        entry.icon = self.icon(applet_id);
        entry.installed_at = revision_of(installed).and_then(|revision| self.installed_at(applet_id, revision));
        if let Some(source) = self.sources.get(applet_id) {
            entry.version = source.version().map(String::from);
            entry.source = Some(source.label());
            entry.source_kind = Some(source.kind());
            entry.bundle_sha256 = Some(source.bundle_sha256().into());
            if let Source::Github { full_name, path, .. } = source {
                entry.publisher = full_name.split_once('/').map(|(owner, _)| owner.to_string());
                entry.repository = Some(full_name.clone());
                entry.path = Some(path.clone());
            }
        }
        Some(entry)
    }

    /// The modified time of the revision directory, written once when the revision was installed.
    fn installed_at(&self, applet_id: &str, revision: u64) -> Option<u64> {
        let modified = fs::metadata(self.root.join(applet_id).join(revision.to_string())).ok()?.modified().ok()?;
        modified.duration_since(UNIX_EPOCH).ok().map(|d| d.as_millis() as u64)
    }

    pub fn foreground_url(&self, applet_id: &str, revision: u64) -> String {
        format!("{FOREGROUND_ORIGIN}/genesis/{applet_id}/{revision}/index.html")
    }

    pub fn read_text(&self, applet_id: &str, revision: u64, path: &str) -> Result<String, String> {
        fs::read_to_string(self.root.join(applet_id).join(revision.to_string()).join(path))
            .map_err(|e| format!("Cannot read {path}: {e}"))
    }

    /// Writes the next revision and switches the index to it, with its source. Returns the new
    /// revision and the previous one, whose files the caller removes once no view uses them.
    /// Installing from any source but the APK forgets that a bundled applet was removed.
    pub fn install(&mut self, bundle: &Bundle, files: VerifiedFiles, source: Source) -> Result<(u64, Option<u64>), String> {
        let id = bundle.manifest.id.clone();
        if !matches!(source, Source::Bundled { .. }) && self.removed_bundled.remove(&id) {
            self.write_removed_bundled()?;
        }
        let previous = self.installed.get(&id).and_then(revision_of);
        let revision = previous.unwrap_or(0) + 1;
        let directory = self.root.join(&id).join(revision.to_string());
        if let Err(error) = write_revision(&directory, bundle, files) {
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
        // The index written by `replace` carries the source, so it changes only now.
        let previous_source = self.sources.insert(id.clone(), source);
        let installed = Installed::Current { revision, manifest: Box::new(bundle.manifest.clone()) };
        if let Err(error) = self.replace(&id, installed) {
            match previous_source {
                Some(previous) => self.sources.insert(id.clone(), previous),
                None => self.sources.remove(&id),
            };
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
        Ok((revision, previous))
    }

    /// Lists an incompatible bundle in place of any installed revision of the same applet.
    /// Returns the replaced revision, whose files the caller removes once no view uses them.
    pub fn record_incompatible(&mut self, bundle: IncompatibleBundle) -> Result<Option<u64>, String> {
        let previous = self.installed.get(&bundle.id).and_then(revision_of);
        let installed = Installed::Incompatible {
            revision: None,
            name: bundle.name,
            accent: None,
            direction: bundle.direction,
            mismatches: bundle.mismatches,
            origins: Vec::new(),
        };
        self.replace(&bundle.id, installed)?;
        Ok(previous)
    }

    /// Deletes a revision's files that the index no longer lists.
    pub fn remove_revision(&self, applet_id: &str, revision: u64) {
        let _ = fs::remove_dir_all(self.root.join(applet_id).join(revision.to_string()));
    }

    /// Replaces the entry and writes the index; on a write failure memory keeps agreeing with disk.
    fn replace(&mut self, id: &str, installed: Installed) -> Result<(), String> {
        let replaced = self.installed.insert(id.into(), installed);
        let written = self.write_index();
        if written.is_err() {
            match replaced {
                Some(previous) => self.installed.insert(id.into(), previous),
                None => self.installed.remove(id),
            };
        }
        written
    }

    fn write_index(&self) -> Result<(), String> {
        let entries: Vec<IndexEntry> = self
            .installed
            .iter()
            .map(|(id, installed)| {
                let entry = entry(id, installed);
                IndexEntry {
                    applet_id: entry.applet_id,
                    revision: revision_of(installed),
                    name: entry.name,
                    accent: entry.accent,
                    status: entry.status,
                    direction: entry.direction,
                    mismatches: entry.mismatches,
                    source: self.sources.get(id).cloned(),
                }
            })
            .collect();
        let encoded = serde_json::to_vec(&entries).map_err(|e| e.to_string())?;
        write_atomic(&self.root.join("index.json"), &encoded)
    }
}

/// Reads a revision's `bundle.json` without assuming its format, then parses it fully when current.
fn classify(directory: &Path, revision: u64) -> Option<Installed> {
    let bytes = fs::read(directory.join("bundle.json")).ok()?;
    let header: BundleHeader = serde_json::from_slice(&bytes).ok()?;
    let accent = || header.manifest.rest.get("shell")?.get("accent")?.as_str().map(String::from);
    let origins = || -> Vec<String> {
        let listed = header.manifest.rest.get("origins").and_then(|o| o.as_array());
        listed.into_iter().flatten().filter_map(|o| o.as_str().map(String::from)).collect()
    };
    let incompatible = |direction, mismatches| Installed::Incompatible {
        revision: Some(revision),
        name: header.manifest.name.clone(),
        accent: accent(),
        direction,
        mismatches,
        origins: origins(),
    };
    match compat::evaluate(&header) {
        Compatibility::Incompatible { direction, mismatches } => Some(incompatible(direction, mismatches)),
        Compatibility::Current => match serde_json::from_slice::<Bundle>(&bytes) {
            Ok(bundle) => Some(Installed::Current { revision, manifest: Box::new(bundle.manifest) }),
            Err(_) => None,
        },
    }
}

fn revision_of(installed: &Installed) -> Option<u64> {
    match installed {
        Installed::Current { revision, .. } => Some(*revision),
        Installed::Incompatible { revision, .. } => *revision,
    }
}

/// The entry the installed revision describes, without source details.
fn entry(applet_id: &str, installed: &Installed) -> LauncherEntry {
    let blank = |name: &str, accent: Option<String>, status| LauncherEntry {
        applet_id: applet_id.into(),
        name: name.into(),
        accent,
        icon: None,
        status,
        direction: None,
        mismatches: Vec::new(),
        version: None,
        source: None,
        source_kind: None,
        update: None,
        origins: Vec::new(),
        services: Vec::new(),
        storage: false,
        publisher: None,
        repository: None,
        path: None,
        installed_at: None,
        bundle_sha256: None,
    };
    match installed {
        Installed::Current { manifest, .. } => {
            let accent = manifest.shell.as_ref().and_then(|s| s.accent.clone());
            let capabilities = capabilities(manifest);
            LauncherEntry {
                origins: manifest.origins.clone(),
                services: capabilities.services,
                storage: capabilities.storage,
                ..blank(&manifest.name, accent, AppletStatus::Current)
            }
        }
        Installed::Incompatible { name, accent, direction, mismatches, origins, .. } => LauncherEntry {
            direction: Some(*direction),
            mismatches: mismatches.clone(),
            origins: origins.clone(),
            ..blank(name, accent.clone(), AppletStatus::Incompatible)
        },
    }
}

/// The storage and services a manifest declares, as a release record lists them.
pub fn capabilities(manifest: &Manifest) -> ReleaseCapabilities {
    ReleaseCapabilities {
        storage: manifest.capabilities.storage.unwrap_or(false),
        services: manifest.capabilities.services.iter().flatten().map(|s| s.id.clone()).collect(),
    }
}

fn write_revision(directory: &Path, bundle: &Bundle, files: VerifiedFiles) -> Result<(), String> {
    let _ = fs::remove_dir_all(directory);
    for (path, bytes) in files.0 {
        let target = directory.join(&path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Cannot create {path}: {e}"))?;
        }
        fs::write(&target, bytes).map_err(|e| format!("Cannot write {path}: {e}"))?;
    }
    let metadata = serde_json::to_vec(bundle).map_err(|e| e.to_string())?;
    fs::write(directory.join("bundle.json"), metadata).map_err(|e| format!("Cannot write bundle.json: {e}"))
}

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    fs::rename(&temporary, path).map_err(|e| e.to_string())
}

/// The ASCII origin of a URL, such as `https://news.ycombinator.com`.
pub fn origin_of(url: &str) -> Option<String> {
    url::Url::parse(url).ok().map(|u| u.origin().ascii_serialization())
}
