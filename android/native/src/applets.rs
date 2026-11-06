//! Installed applets: `files/applets/index.json` and one directory per revision.
use crate::imports::VerifiedFiles;
use genesis_contracts::{Bundle, FOREGROUND_ORIGIN, LauncherEntry, Manifest};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexEntry {
    applet_id: String,
    revision: u64,
}

pub struct Installed {
    pub revision: u64,
    pub manifest: Manifest,
}

#[derive(Default)]
pub struct Applets {
    root: PathBuf,
    pub installed: BTreeMap<String, Installed>,
}

impl Applets {
    /// Reads the index. An entry whose `bundle.json` cannot be read is dropped from the launcher.
    pub fn load(files_dir: &Path) -> Self {
        let root = files_dir.join("applets");
        let entries: Vec<IndexEntry> = fs::read(root.join("index.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        let installed = entries
            .into_iter()
            .filter_map(|entry| {
                let path = root.join(&entry.applet_id).join(entry.revision.to_string()).join("bundle.json");
                let bundle: Bundle = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
                Some((entry.applet_id, Installed { revision: entry.revision, manifest: bundle.manifest }))
            })
            .collect();
        Self { root, installed }
    }

    pub fn get(&self, applet_id: &str) -> Option<&Installed> {
        self.installed.get(applet_id)
    }

    pub fn launcher(&self) -> Vec<LauncherEntry> {
        self.installed
            .iter()
            .map(|(id, installed)| LauncherEntry {
                applet_id: id.clone(),
                name: installed.manifest.name.clone(),
                accent: installed.manifest.shell.as_ref().and_then(|s| s.accent.clone()),
            })
            .collect()
    }

    pub fn foreground_url(&self, applet_id: &str, revision: u64) -> String {
        format!("{FOREGROUND_ORIGIN}/genesis/{applet_id}/{revision}/index.html")
    }

    pub fn read_text(&self, applet_id: &str, revision: u64, path: &str) -> Result<String, String> {
        fs::read_to_string(self.root.join(applet_id).join(revision.to_string()).join(path))
            .map_err(|e| format!("Cannot read {path}: {e}"))
    }

    /// Writes the next revision, switches the index to it and deletes the previous revision.
    pub fn install(&mut self, bundle: &Bundle, files: VerifiedFiles) -> Result<u64, String> {
        let id = bundle.manifest.id.clone();
        let previous = self.installed.get(&id).map(|i| i.revision);
        let revision = previous.unwrap_or(0) + 1;
        let directory = self.root.join(&id).join(revision.to_string());
        let written = write_revision(&directory, bundle, files);
        if let Err(error) = written {
            let _ = fs::remove_dir_all(&directory);
            return Err(error);
        }
        self.installed.insert(id.clone(), Installed { revision, manifest: bundle.manifest.clone() });
        self.write_index()?;
        if let Some(previous) = previous {
            let _ = fs::remove_dir_all(self.root.join(&id).join(previous.to_string()));
        }
        Ok(revision)
    }

    fn write_index(&self) -> Result<(), String> {
        let entries: Vec<IndexEntry> = self
            .installed
            .iter()
            .map(|(id, i)| IndexEntry { applet_id: id.clone(), revision: i.revision })
            .collect();
        let encoded = serde_json::to_vec(&entries).map_err(|e| e.to_string())?;
        write_atomic(&self.root.join("index.json"), &encoded)
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
