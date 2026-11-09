//! Installed applets: `files/applets/index.json` and one directory per current revision.
//!
//! An applet built for another Genesis stays in the index with its status and mismatches, so
//! the launcher lists it and refuses to start it. Every load classifies the installed
//! `bundle.json` again, so an upgrade turns old revisions incompatible without touching them.
use crate::{
    compat,
    imports::{IncompatibleBundle, VerifiedFiles},
};
use genesis_contracts::{
    AppletStatus, Bundle, BundleHeader, Compatibility, Direction, FOREGROUND_ORIGIN, LauncherEntry, Manifest, Mismatch,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
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
}

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
    },
}

#[derive(Default)]
pub struct Applets {
    root: PathBuf,
    installed: BTreeMap<String, Installed>,
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
        let installed = entries
            .into_iter()
            .filter_map(|entry| {
                let installed = match entry.revision {
                    Some(revision) => classify(&root.join(&entry.applet_id).join(revision.to_string()), revision)?,
                    None => Installed::Incompatible {
                        revision: None,
                        name: entry.name,
                        accent: entry.accent,
                        direction: entry.direction.unwrap_or(Direction::Outdated),
                        mismatches: entry.mismatches,
                    },
                };
                Some((entry.applet_id, installed))
            })
            .collect();
        Self { root, installed }
    }

    /// The applet's revision and manifest, when it is installed and current.
    pub fn current(&self, applet_id: &str) -> Option<(u64, &Manifest)> {
        match self.installed.get(applet_id)? {
            Installed::Current { revision, manifest } => Some((*revision, manifest)),
            Installed::Incompatible { .. } => None,
        }
    }

    pub fn launcher(&self) -> Vec<LauncherEntry> {
        self.installed.iter().map(|(id, installed)| entry(id, installed)).collect()
    }

    pub fn entry(&self, applet_id: &str) -> Option<LauncherEntry> {
        self.installed.get(applet_id).map(|installed| entry(applet_id, installed))
    }

    pub fn foreground_url(&self, applet_id: &str, revision: u64) -> String {
        format!("{FOREGROUND_ORIGIN}/genesis/{applet_id}/{revision}/index.html")
    }

    pub fn read_text(&self, applet_id: &str, revision: u64, path: &str) -> Result<String, String> {
        fs::read_to_string(self.root.join(applet_id).join(revision.to_string()).join(path))
            .map_err(|e| format!("Cannot read {path}: {e}"))
    }

    /// Writes the next revision and switches the index to it. Returns the new revision and the
    /// previous one, whose files the caller removes once no view uses them.
    pub fn install(&mut self, bundle: &Bundle, files: VerifiedFiles) -> Result<(u64, Option<u64>), String> {
        let id = bundle.manifest.id.clone();
        let previous = self.installed.get(&id).and_then(revision_of);
        let revision = previous.unwrap_or(0) + 1;
        let directory = self.root.join(&id).join(revision.to_string());
        if let Err(error) = write_revision(&directory, bundle, files) {
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
        let installed = Installed::Current { revision, manifest: Box::new(bundle.manifest.clone()) };
        if let Err(error) = self.replace(&id, installed) {
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
    let incompatible = |direction, mismatches| Installed::Incompatible {
        revision: Some(revision),
        name: header.manifest.name.clone(),
        accent: accent(),
        direction,
        mismatches,
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

fn entry(applet_id: &str, installed: &Installed) -> LauncherEntry {
    match installed {
        Installed::Current { manifest, .. } => LauncherEntry {
            applet_id: applet_id.into(),
            name: manifest.name.clone(),
            accent: manifest.shell.as_ref().and_then(|s| s.accent.clone()),
            status: AppletStatus::Current,
            direction: None,
            mismatches: Vec::new(),
            version: None,
            source: None,
            update: None,
        },
        Installed::Incompatible { name, accent, direction, mismatches, .. } => LauncherEntry {
            applet_id: applet_id.into(),
            name: name.clone(),
            accent: accent.clone(),
            status: AppletStatus::Incompatible,
            direction: Some(*direction),
            mismatches: mismatches.clone(),
            version: None,
            source: None,
            update: None,
        },
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
