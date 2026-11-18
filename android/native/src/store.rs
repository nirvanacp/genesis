//! The watch store: the last value of each subscribed watch stream, kept off the UI thread so a
//! subscription can show it before the page has read anything.
//!
//! One thread, `genesis-store`, owns every value. The UI thread only clones a watch message and
//! sends it here; the thread applies snapshots and patches in stream order, and answers a lookup
//! with a `StoreCached` shell event. A message it cannot place, because one before it never
//! arrived, drops the value and sends `StoreResync`, so the host asks the page for a snapshot. A
//! value is never served once a message of its stream went missing.
//!
//! The values of watches subscribed with `persist` are also written to
//! `<files>/applets/<applet>/store/<hash>.json`, at most once per `WRITE_INTERVAL_MS` per value
//! and `PERSISTED_MAX_BYTES` per applet, and read back the first time the applet asks for one
//! after a start. A file older than `PERSISTED_MAX_AGE_MS` is deleted unread.
use crate::debug_log;
use genesis_contracts::{EmitKind, ShellEvent};
use jni::{JavaVM, objects::{Global, JClass}};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::{HashMap, HashSet},
    panic::{AssertUnwindSafe, catch_unwind},
    path::PathBuf,
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
        mpsc::{Receiver, RecvTimeoutError, Sender, channel},
    },
    time::{Duration, Instant},
};

/// Watch messages waiting for the thread, at most; past it the host drops the stream's value.
const QUEUED_MAX: usize = 256;
/// Values kept per applet; another drops the least recently used.
const VALUES_MAX: usize = 64;
/// The largest value kept, as JSON. A larger one is followed but not kept.
const VALUE_MAX_BYTES: usize = 256 * 1024;
/// A persisted value is written at most this often.
const WRITE_INTERVAL_MS: u64 = 2_000;
/// The persisted values of one applet, at most; past it the least recently used are deleted.
const PERSISTED_MAX_BYTES: u64 = 4 * 1024 * 1024;
/// A persisted value older than this is deleted when the applet's values are read.
const PERSISTED_MAX_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000;
/// The position of a value whose stream position is unknown: read from a file, or after the page
/// reported an error. Only a snapshot continues it.
const NO_POSITION: u64 = u64::MAX;

/// One value: the applet's watch `stream` in `context`, read from `url` without its fragment.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Key {
    pub applet_id: String,
    pub context: String,
    pub stream: String,
    pub url: String,
}

impl Key {
    pub fn new(applet_id: &str, context: &str, stream: &str, url: &str) -> Self {
        Self { applet_id: applet_id.into(), context: context.into(), stream: stream.into(), url: without_fragment(url).into() }
    }
}

/// One watch message of a subscribed stream. `spec` is the subscription's fingerprint, so a
/// value read with another specification is never served.
pub struct Emit {
    pub key: Key,
    pub spec: u64,
    pub kind: EmitKind,
    pub generation: u64,
    pub n: u64,
    pub seq: u64,
    pub data: Value,
    /// The value is also written to the phone.
    pub persist: bool,
}

enum Message {
    Emit(Emit),
    /// Answers `StoreCached` when a value of `spec` is kept for the key.
    Get { key: Key, spec: u64, serial: u64 },
    /// Drops the values of one stream, at every URL: a message of it was not queued.
    Drop { applet_id: String, context: String, stream: String },
    /// Forgets the applet's values, of one context or all, in memory and on the phone.
    Forget { applet_id: String, context: Option<String> },
    /// Deletes the values of one applet, or of every applet.
    Erase(Option<String>),
}

/// What became of a watch message.
#[derive(Debug, PartialEq, Eq)]
pub enum Sent {
    Queued,
    /// The queue is full: the message is lost, so the stream's value must be dropped.
    Full,
    /// The thread never started.
    Off,
}

// Process lifetime, like the servelet worker. Control messages are never refused, so the
// channel is unbounded and `QUEUED` bounds the watch messages alone.
static MESSAGES: OnceLock<Sender<Message>> = OnceLock::new();
static QUEUED: AtomicUsize = AtomicUsize::new(0);

pub fn initialized() -> bool {
    MESSAGES.get().is_some()
}

/// Starts the thread; `root` is `<files>/applets`.
pub fn start(root: PathBuf, vm: JavaVM, callback: Global<JClass<'static>>) -> Result<(), String> {
    if initialized() {
        return Ok(());
    }
    let (sender, receiver) = channel::<Message>();
    std::thread::Builder::new()
        .name("genesis-store".into())
        .spawn(move || {
            let mut store = Store { root, values: HashMap::new(), loaded: HashSet::new(), clock: 0, started: Instant::now() };
            while let Some(message) = next(&receiver, store.next_write()) {
                let event = catch_unwind(AssertUnwindSafe(|| match message {
                    None => None,
                    Some(Message::Emit(emit)) => {
                        QUEUED.fetch_sub(1, Ordering::SeqCst);
                        store.apply(emit)
                    }
                    Some(Message::Get { key, spec, serial }) => store.get(key, spec, serial),
                    Some(Message::Drop { applet_id, context, stream }) => {
                        store.load(&applet_id);
                        store.retain(&applet_id, |k| !(k.context == context && k.stream == stream));
                        None
                    }
                    Some(Message::Forget { applet_id, context }) => {
                        store.load(&applet_id);
                        store.retain(&applet_id, |k| context.as_ref().is_some_and(|c| *c != k.context));
                        None
                    }
                    Some(Message::Erase(applet_id)) => {
                        store.erase(applet_id.as_deref());
                        None
                    }
                }));
                // A value that broke the thread midway may be half applied: memory starts over
                // from the files, which hold only whole values.
                let event = event.unwrap_or_else(|_| {
                    store.values.clear();
                    store.loaded.clear();
                    None
                });
                store.write_due();
                if let Some(event) = event {
                    crate::servelets::deliver(&vm, &callback, &event);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    MESSAGES.set(sender).map_err(|_| "Store already configured".into())
}

/// The next message, `Some(None)` once a write is due, or `None` when the channel closed.
fn next(receiver: &Receiver<Message>, write_in: Option<Duration>) -> Option<Option<Message>> {
    match write_in {
        None => receiver.recv().ok().map(Some),
        Some(wait) => match receiver.recv_timeout(wait) {
            Ok(message) => Some(Some(message)),
            Err(RecvTimeoutError::Timeout) => Some(None),
            Err(RecvTimeoutError::Disconnected) => None,
        },
    }
}

/// Queues a watch message.
pub fn emit(emit: Emit) -> Sent {
    let Some(messages) = MESSAGES.get() else { return Sent::Off };
    if QUEUED.fetch_add(1, Ordering::SeqCst) >= QUEUED_MAX {
        QUEUED.fetch_sub(1, Ordering::SeqCst);
        return Sent::Full;
    }
    if messages.send(Message::Emit(emit)).is_err() {
        QUEUED.fetch_sub(1, Ordering::SeqCst);
        return Sent::Off;
    }
    Sent::Queued
}

/// Asks for the value kept for `key`, for subscription `serial`.
pub fn get(key: Key, spec: u64, serial: u64) {
    send(Message::Get { key, spec, serial });
}

/// Drops the stream's values after the messages already queued.
pub fn drop_stream(applet_id: &str, context: &str, stream: &str) {
    send(Message::Drop { applet_id: applet_id.into(), context: context.into(), stream: stream.into() });
}

/// Forgets the applet's values of `context`, or of every context, after the messages already queued.
pub fn forget(applet_id: &str, context: Option<String>) {
    send(Message::Forget { applet_id: applet_id.into(), context });
}

/// Deletes the values of `applet_id`, or of every applet, after the messages already queued.
pub fn erase(applet_id: Option<&str>) {
    send(Message::Erase(applet_id.map(Into::into)));
}

fn send(message: Message) {
    if let Some(messages) = MESSAGES.get() {
        let _ = messages.send(message);
    }
}

/// The URL without its fragment: a fragment change shows the same page.
pub fn without_fragment(url: &str) -> &str {
    url.split('#').next().unwrap_or(url)
}

/// A 64-bit FNV-1a hash of the value's JSON.
pub fn fingerprint(value: &Value) -> u64 {
    fnv(value.to_string().as_bytes())
}

fn fnv(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x0100_0000_01b3))
}

/// The stream position and value of one key.
struct Entry {
    spec: u64,
    generation: u64,
    n: u64,
    seq: u64,
    /// The `ready` snapshot with every patch since applied; `None` while it is too large to keep.
    snapshot: Option<Value>,
    /// Epoch milliseconds of the last change.
    at: u64,
    /// When the entry was last used, for least-recently-used eviction.
    used: u64,
    persist: bool,
    /// The value changed since it was last written.
    unsaved: bool,
    /// When it was last written (milliseconds of the thread's clock), and the file's size.
    written_ms: Option<u64>,
    saved_bytes: u64,
}

/// One persisted value, as written to its file.
#[derive(Deserialize, Serialize)]
struct Saved {
    context: String,
    stream: String,
    url: String,
    spec: u64,
    at: u64,
    snapshot: Value,
}

struct Store {
    root: PathBuf,
    values: HashMap<Key, Entry>,
    /// Applets whose persisted values were read since the start.
    loaded: HashSet<String>,
    clock: u64,
    started: Instant,
}

impl Store {
    fn apply(&mut self, emit: Emit) -> Option<ShellEvent> {
        let Emit { key, spec, kind, generation, n, seq, data, persist } = emit;
        self.load(&key.applet_id);
        self.clock += 1;
        if kind == EmitKind::Snapshot {
            if data.get("status").and_then(Value::as_str) != Some("ready") {
                // The page could not read: the kept value stays, but only a snapshot continues it.
                if let Some(entry) = self.values.get_mut(&key) {
                    entry.generation = NO_POSITION;
                }
                return None;
            }
            let snapshot = (json_len(&data) <= VALUE_MAX_BYTES).then_some(data);
            let (written_ms, saved_bytes) = self.values.get(&key).map_or((None, 0), |e| (e.written_ms, e.saved_bytes));
            let at = crate::host::now_ms();
            let entry = Entry { spec, generation, n, seq, snapshot, at, used: self.clock, persist, unsaved: true, written_ms, saved_bytes };
            self.values.insert(key.clone(), entry);
            self.unpersist_if(&key, !persist);
            self.evict(&key.applet_id);
            return None;
        }
        let entry = self.values.get_mut(&key)?;
        if entry.spec != spec || entry.generation != generation || entry.n != n || seq != entry.seq + 1 {
            if entry.generation == NO_POSITION && kind == EmitKind::Status {
                return None;
            }
            self.remove(&key);
            if debug_log::on(&key.applet_id) {
                debug_log::host(&key.applet_id, "store.gap", json!({ "context": key.context, "watch": key.stream, "seq": seq }));
            }
            return Some(ShellEvent::StoreResync { applet_id: key.applet_id, context: key.context, stream: key.stream });
        }
        entry.seq = seq;
        entry.used = self.clock;
        if kind == EmitKind::Status {
            if data.get("status").and_then(Value::as_str) == Some("error") {
                entry.generation = NO_POSITION;
            }
            return None;
        }
        if let Some(snapshot) = &mut entry.snapshot {
            patch(snapshot, &data);
            if json_len(snapshot) > VALUE_MAX_BYTES {
                entry.snapshot = None;
            }
        }
        entry.at = crate::host::now_ms();
        entry.unsaved = true;
        entry.persist = persist;
        self.unpersist_if(&key, !persist);
        None
    }

    fn get(&mut self, key: Key, spec: u64, serial: u64) -> Option<ShellEvent> {
        self.load(&key.applet_id);
        self.clock += 1;
        let entry = self.values.get_mut(&key).filter(|e| e.spec == spec)?;
        entry.used = self.clock;
        let snapshot = entry.snapshot.clone()?;
        let Key { applet_id, context, stream, url } = key;
        Some(ShellEvent::StoreCached { applet_id, context, stream, serial, url, at: entry.at, snapshot })
    }

    /// Keeps only the applet's values whose key passes `keep`.
    fn retain(&mut self, applet_id: &str, keep: impl Fn(&Key) -> bool) {
        let gone: Vec<Key> = self.values.keys().filter(|k| k.applet_id == applet_id && !keep(k)).cloned().collect();
        for key in gone {
            self.remove(&key);
        }
    }

    /// Drops a value and deletes its file.
    fn remove(&mut self, key: &Key) {
        if self.values.remove(key).is_some_and(|e| e.written_ms.is_some()) {
            let _ = std::fs::remove_file(self.file(key));
        }
    }

    /// Deletes the file of a value that is no longer persisted.
    fn unpersist_if(&mut self, key: &Key, gone: bool) {
        let Some(entry) = self.values.get_mut(key).filter(|e| gone && e.written_ms.is_some()) else { return };
        entry.written_ms = None;
        entry.saved_bytes = 0;
        let _ = std::fs::remove_file(self.file(key));
    }

    fn erase(&mut self, applet_id: Option<&str>) {
        self.values.retain(|k, _| applet_id.is_some_and(|a| k.applet_id != a));
        let applets: Vec<String> = match applet_id {
            Some(applet_id) => vec![applet_id.into()],
            None => std::fs::read_dir(&self.root)
                .map(|entries| entries.filter_map(|e| e.ok()?.file_name().into_string().ok()).collect())
                .unwrap_or_default(),
        };
        for applet_id in applets {
            let _ = std::fs::remove_dir_all(self.root.join(&applet_id).join("store"));
            self.loaded.remove(&applet_id);
        }
    }

    /// Drops the applet's least recently used values past `VALUES_MAX`.
    fn evict(&mut self, applet_id: &str) {
        loop {
            let mut kept = self.values.iter().filter(|(k, _)| k.applet_id == applet_id);
            if kept.clone().count() <= VALUES_MAX {
                return;
            }
            let Some(oldest) = kept.by_ref().min_by_key(|(_, e)| e.used).map(|(k, _)| k.clone()) else { return };
            self.remove(&oldest);
        }
    }

    // ---- Persistence -------------------------------------------------------------------------

    fn file(&self, key: &Key) -> PathBuf {
        let name = fnv(format!("{}\0{}\0{}", key.context, key.stream, key.url).as_bytes());
        self.root.join(&key.applet_id).join("store").join(format!("{name:016x}.json"))
    }

    fn now(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// How long until the next persisted value may be written; `None` when none waits.
    fn next_write(&self) -> Option<Duration> {
        let now = self.now();
        self.values
            .values()
            .filter(|e| e.persist && e.unsaved && e.snapshot.is_some())
            .map(|e| e.written_ms.map_or(0, |w| (w + WRITE_INTERVAL_MS).saturating_sub(now)))
            .min()
            .map(Duration::from_millis)
    }

    /// Writes every persisted value that changed and was not written in the last interval.
    fn write_due(&mut self) {
        let now = self.now();
        let due: Vec<Key> = self
            .values
            .iter()
            .filter(|(_, e)| e.persist && e.unsaved && e.snapshot.is_some() && e.written_ms.is_none_or(|w| now >= w + WRITE_INTERVAL_MS))
            .map(|(k, _)| k.clone())
            .collect();
        let mut applets = HashSet::new();
        for key in due {
            let Some(entry) = self.values.get(&key) else { continue };
            let saved = Saved {
                context: key.context.clone(),
                stream: key.stream.clone(),
                url: key.url.clone(),
                spec: entry.spec,
                at: entry.at,
                snapshot: entry.snapshot.clone().unwrap_or_default(),
            };
            let Ok(bytes) = serde_json::to_vec(&saved) else { continue };
            let written = crate::applets::write_atomic(&self.file(&key), &bytes);
            if debug_log::on(&key.applet_id) {
                let error = written.as_ref().err();
                debug_log::host(&key.applet_id, "store.write", json!({ "context": key.context, "watch": key.stream, "bytes": bytes.len(), "error": error }));
            }
            let Some(entry) = self.values.get_mut(&key) else { continue };
            entry.unsaved = false;
            entry.written_ms = Some(now);
            entry.saved_bytes = if written.is_ok() { bytes.len() as u64 } else { 0 };
            applets.insert(key.applet_id);
        }
        for applet_id in applets {
            self.limit_files(&applet_id);
        }
    }

    /// Deletes the applet's least recently used persisted values past `PERSISTED_MAX_BYTES`.
    fn limit_files(&mut self, applet_id: &str) {
        loop {
            let saved = self.values.iter().filter(|(k, e)| k.applet_id == applet_id && e.written_ms.is_some());
            if saved.clone().map(|(_, e)| e.saved_bytes).sum::<u64>() <= PERSISTED_MAX_BYTES {
                return;
            }
            let Some(oldest) = saved.min_by_key(|(_, e)| e.used).map(|(k, _)| k.clone()) else { return };
            self.remove(&oldest);
        }
    }

    /// Reads the applet's persisted values once per start, deleting the expired and unreadable.
    fn load(&mut self, applet_id: &str) {
        if !self.loaded.insert(applet_id.into()) {
            return;
        }
        let directory = self.root.join(applet_id).join("store");
        let Ok(entries) = std::fs::read_dir(&directory) else { return };
        let oldest = crate::host::now_ms().saturating_sub(PERSISTED_MAX_AGE_MS);
        let (mut values, mut bytes, mut deleted) = (0, 0, 0);
        for path in entries.filter_map(|e| Some(e.ok()?.path())) {
            let read = std::fs::read(&path).ok().and_then(|b| Some((b.len() as u64, serde_json::from_slice::<Saved>(&b).ok()?)));
            let Some((size, saved)) = read.filter(|(_, s)| s.at >= oldest) else {
                let _ = std::fs::remove_file(&path);
                deleted += 1;
                continue;
            };
            let key = Key { applet_id: applet_id.into(), context: saved.context, stream: saved.stream, url: saved.url };
            if self.file(&key) != path || self.values.contains_key(&key) {
                let _ = std::fs::remove_file(&path);
                deleted += 1;
                continue;
            }
            let entry = Entry {
                spec: saved.spec,
                generation: NO_POSITION,
                n: 0,
                seq: 0,
                snapshot: Some(saved.snapshot),
                at: saved.at,
                used: 0,
                persist: true,
                unsaved: false,
                written_ms: Some(0),
                saved_bytes: size,
            };
            self.values.insert(key, entry);
            values += 1;
            bytes += size;
        }
        self.evict(applet_id);
        self.limit_files(applet_id);
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "store.load", json!({ "values": values, "bytes": bytes, "deleted": deleted }));
        }
    }
}

/// Applies a list patch: `upsert` records by key, `remove` keys, a new `order`, `complete`.
fn patch(snapshot: &mut Value, change: &Value) {
    let Value::Object(snapshot) = snapshot else { return };
    let records = snapshot.entry("records").or_insert_with(|| Value::Object(Default::default()));
    if let Value::Object(records) = records {
        if let Some(Value::Array(remove)) = change.get("remove") {
            for key in remove.iter().filter_map(Value::as_str) {
                records.remove(key);
            }
        }
        if let Some(Value::Object(upsert)) = change.get("upsert") {
            for (key, record) in upsert {
                records.insert(key.clone(), record.clone());
            }
        }
    }
    for field in ["order", "complete"] {
        if let Some(value) = change.get(field) {
            snapshot.insert(field.into(), value.clone());
        }
    }
}

fn json_len(value: &Value) -> usize {
    serde_json::to_vec(value).map_or(usize::MAX, |b| b.len())
}
