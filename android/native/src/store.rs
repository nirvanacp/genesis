//! The watch store: the last value of each subscribed watch stream, kept off the UI thread so a
//! subscription can show it before the page has read anything.
//!
//! One thread, `genesis-store`, owns every value. The UI thread only clones a watch message and
//! sends it here; the thread applies snapshots and patches in stream order, and answers a lookup
//! with a `StoreCached` shell event. A message it cannot place, because one before it never
//! arrived, drops the value and sends `StoreResync`, so the host asks the page for a snapshot. A
//! value is never served once a message of its stream went missing.
use genesis_contracts::{EmitKind, ShellEvent};
use jni::{JavaVM, objects::{Global, JClass}};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
        mpsc::{Sender, channel},
    },
};

/// Watch messages waiting for the thread, at most; past it the host drops the stream's value.
const QUEUED_MAX: usize = 256;
/// Values kept per applet; another drops the least recently used.
const VALUES_MAX: usize = 64;
/// The largest value kept, as JSON. A larger one is followed but not kept.
const VALUE_MAX_BYTES: usize = 256 * 1024;

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
}

enum Message {
    Emit(Emit),
    /// Answers `StoreCached` when a value of `spec` is kept for the key.
    Get { key: Key, spec: u64, serial: u64 },
    /// Drops the values of one stream, at every URL: a message of it was not queued.
    Drop { applet_id: String, context: String, stream: String },
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

pub fn start(vm: JavaVM, callback: Global<JClass<'static>>) -> Result<(), String> {
    if initialized() {
        return Ok(());
    }
    let (sender, receiver) = channel::<Message>();
    std::thread::Builder::new()
        .name("genesis-store".into())
        .spawn(move || {
            let mut store = Store::default();
            for message in receiver {
                let event = match message {
                    Message::Emit(emit) => {
                        QUEUED.fetch_sub(1, Ordering::SeqCst);
                        store.apply(emit)
                    }
                    Message::Get { key, spec, serial } => store.get(key, spec, serial),
                    Message::Drop { applet_id, context, stream } => {
                        store.drop_stream(&applet_id, &context, &stream);
                        None
                    }
                };
                if let Some(event) = event {
                    crate::servelets::deliver(&vm, &callback, &event);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    MESSAGES.set(sender).map_err(|_| "Store already configured".into())
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
}

#[derive(Default)]
struct Store {
    values: HashMap<Key, Entry>,
    clock: u64,
}

impl Store {
    fn apply(&mut self, emit: Emit) -> Option<ShellEvent> {
        let Emit { key, spec, kind, generation, n, seq, data } = emit;
        self.clock += 1;
        if kind == EmitKind::Snapshot {
            if data.get("status").and_then(Value::as_str) != Some("ready") {
                self.values.remove(&key);
                return None;
            }
            let snapshot = (json_len(&data) <= VALUE_MAX_BYTES).then_some(data);
            let entry = Entry { spec, generation, n, seq, snapshot, at: crate::host::now_ms(), used: self.clock };
            self.values.insert(key.clone(), entry);
            self.evict(&key.applet_id);
            return None;
        }
        let entry = self.values.get_mut(&key)?;
        if entry.spec != spec || entry.generation != generation || entry.n != n || seq != entry.seq + 1 {
            self.values.remove(&key);
            return Some(ShellEvent::StoreResync { applet_id: key.applet_id, context: key.context, stream: key.stream });
        }
        entry.seq = seq;
        entry.used = self.clock;
        if kind == EmitKind::Status {
            if data.get("status").and_then(Value::as_str) == Some("error") {
                self.values.remove(&key);
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
        None
    }

    fn get(&mut self, key: Key, spec: u64, serial: u64) -> Option<ShellEvent> {
        self.clock += 1;
        let entry = self.values.get_mut(&key).filter(|e| e.spec == spec)?;
        entry.used = self.clock;
        let snapshot = entry.snapshot.clone()?;
        let Key { applet_id, context, stream, url } = key;
        Some(ShellEvent::StoreCached { applet_id, context, stream, serial, url, at: entry.at, snapshot })
    }

    fn drop_stream(&mut self, applet_id: &str, context: &str, stream: &str) {
        self.values.retain(|k, _| !(k.applet_id == applet_id && k.context == context && k.stream == stream));
    }

    /// Drops the applet's least recently used values past `VALUES_MAX`.
    fn evict(&mut self, applet_id: &str) {
        loop {
            let mut kept = self.values.iter().filter(|(k, _)| k.applet_id == applet_id);
            if kept.clone().count() <= VALUES_MAX {
                return;
            }
            let Some(oldest) = kept.by_ref().min_by_key(|(_, e)| e.used).map(|(k, _)| k.clone()) else { return };
            self.values.remove(&oldest);
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
