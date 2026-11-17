//! Writes small state files on a background thread, so a save never holds up the thread that
//! handles the user's touches. The newest content of a path wins, a delete goes through the same
//! queue so an older write cannot land after it, and a read sees what is still waiting.
use crate::applets::write_atomic;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, mpsc},
};

/// What a path should hold: bytes, or nothing (the file is deleted). The number tells a newer
/// request for the same path from the one the thread just carried out.
type Waiting = HashMap<PathBuf, (u64, Option<Vec<u8>>)>;

pub struct Writer {
    waiting: Arc<Mutex<Waiting>>,
    wake: Option<mpsc::Sender<()>>,
    next: u64,
}

impl Default for Writer {
    fn default() -> Self {
        let waiting: Arc<Mutex<Waiting>> = Arc::default();
        let (wake, woken) = mpsc::channel::<()>();
        let queue = waiting.clone();
        let thread = std::thread::Builder::new().name("genesis-writer".into()).spawn(move || {
            while woken.recv().is_ok() {
                while let Some((path, number, bytes)) = first(&queue) {
                    let _ = match &bytes {
                        Some(bytes) => write_atomic(&path, bytes),
                        None => std::fs::remove_file(&path).map_err(|e| e.to_string()),
                    };
                    let mut waiting = queue.lock().unwrap_or_else(|e| e.into_inner());
                    if waiting.get(&path).is_some_and(|(latest, _)| *latest == number) {
                        waiting.remove(&path);
                    }
                }
            }
        });
        // Without a thread every request is carried out at once, as before.
        Self { waiting, wake: thread.ok().map(|_| wake), next: 0 }
    }
}

fn first(queue: &Mutex<Waiting>) -> Option<(PathBuf, u64, Option<Vec<u8>>)> {
    let waiting = queue.lock().unwrap_or_else(|e| e.into_inner());
    waiting.iter().next().map(|(path, (number, bytes))| (path.clone(), *number, bytes.clone()))
}

impl Writer {
    pub fn write(&mut self, path: PathBuf, bytes: Vec<u8>) {
        self.request(path, Some(bytes));
    }

    pub fn delete(&mut self, path: PathBuf) {
        self.request(path, None);
    }

    /// The path's content as the last request left it, whether or not it reached the disk.
    pub fn read(&self, path: &Path) -> Option<Vec<u8>> {
        let waiting = self.waiting.lock().unwrap_or_else(|e| e.into_inner());
        match waiting.get(path) {
            Some((_, bytes)) => bytes.clone(),
            None => {
                drop(waiting);
                std::fs::read(path).ok()
            }
        }
    }

    fn request(&mut self, path: PathBuf, bytes: Option<Vec<u8>>) {
        let Some(wake) = &self.wake else {
            let _ = match &bytes {
                Some(bytes) => write_atomic(&path, bytes),
                None => std::fs::remove_file(&path).map_err(|e| e.to_string()),
            };
            return;
        };
        self.next += 1;
        self.waiting.lock().unwrap_or_else(|e| e.into_inner()).insert(path, (self.next, bytes));
        let _ = wake.send(());
    }
}
