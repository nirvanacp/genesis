//! The applet debug log: events from the host, the shell and the applet's documents, written as
//! JSON lines to `<files>/logs/<appletId>/log-0.jsonl` while the user has the applet's log on.
//!
//! A line is `{"t":<epoch ms>,"src":"host"|"shell"|"client"|"page:<context>","ev":"<event>","d":{...}}`.
//! Each file starts with a `log.header` line. A file over `FILE_MAX_BYTES` becomes `log-1` and the
//! older ones move up, to `log-3` at most. With every log off, a call site costs one atomic load:
//! callers check `on` before they build an event.
use crate::host::now_ms;
use genesis_contracts::{LogEntry, compat};
use serde_json::{Value, json};
use std::{
    collections::{BTreeSet, HashMap},
    fs::{self, File, OpenOptions},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    sync::{
        Mutex, OnceLock,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, RecvTimeoutError, SyncSender, TrySendError},
    },
    time::{Duration, Instant},
};

/// Lines waiting for the log thread. When they fill up, lines are counted and dropped.
const QUEUE_LINES: usize = 1024;
const FILE_MAX_BYTES: u64 = 2 * 1024 * 1024;
/// `log-0` is the newest file, `log-3` the oldest kept.
const FILES_MAX: usize = 4;
/// Written lines reach the file at most this long after they were queued.
const FLUSH_EVERY: Duration = Duration::from_secs(1);
/// How long an export waits for the log thread.
const EXPORT_WAIT: Duration = Duration::from_secs(5);

/// Entries one `debug.log` call writes; the rest are counted in one `log.truncated` line.
pub const ENTRIES_MAX: usize = 200;
/// Bytes of entries one `debug.log` call writes.
pub const CALL_MAX_BYTES: usize = 16 * 1024;
const EVENT_MAX_CHARS: usize = 64;
const STRING_MAX_CHARS: usize = 300;

/// Some applet's log is on. Checked before the set, so a call site costs one load when none is.
static ENABLED: AtomicBool = AtomicBool::new(false);
static APPLETS: Mutex<BTreeSet<String>> = Mutex::new(BTreeSet::new());
static DROPPED: AtomicU64 = AtomicU64::new(0);
static QUEUE: OnceLock<Option<SyncSender<Message>>> = OnceLock::new();
static DIRECTORIES: Mutex<Option<(PathBuf, PathBuf)>> = Mutex::new(None);

enum Message {
    Line { applet_id: String, line: String },
    Export { applet_id: String, reply: mpsc::Sender<Option<String>> },
    Delete { applet_id: String },
}

/// Whether `applet_id`'s log is on.
pub fn on(applet_id: &str) -> bool {
    ENABLED.load(Ordering::Relaxed) && applets().contains(applet_id)
}

fn applets() -> std::sync::MutexGuard<'static, BTreeSet<String>> {
    APPLETS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Where logs and exports go: the app's files and cache directories. Set at `Attach`.
pub fn configure(files_dir: &Path, cache_dir: &Path) {
    *DIRECTORIES.lock().unwrap_or_else(|e| e.into_inner()) = Some((files_dir.join("logs"), cache_dir.join("shared-logs")));
}

fn directories() -> Option<(PathBuf, PathBuf)> {
    DIRECTORIES.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

/// Turns `applet_id`'s log on or off.
pub fn set(applet_id: &str, enabled: bool) {
    let mut applets = applets();
    match enabled {
        true => applets.insert(applet_id.into()),
        false => applets.remove(applet_id),
    };
    ENABLED.store(!applets.is_empty(), Ordering::Relaxed);
}

/// Writes one host event. The caller checked `on`.
pub fn host(applet_id: &str, ev: &str, d: Value) {
    write(applet_id, "host", now_ms(), ev, Some(d));
}

/// Writes one event the shell sent, cut to the same limits as a document's.
pub fn shell(applet_id: &str, entry: LogEntry) {
    if on(applet_id) {
        let (ev, d) = (cut(&entry.ev, EVENT_MAX_CHARS), entry.d.map(trim));
        write(applet_id, "shell", entry.t, &ev, d);
    }
}

/// Writes a document's `debug.log` entries: at most `ENTRIES_MAX` and `CALL_MAX_BYTES` of them,
/// strings cut to their limits, and one `log.truncated` line counting the rest.
pub fn document(applet_id: &str, src: &str, entries: Vec<LogEntry>) {
    let total = entries.len();
    let (mut written, mut bytes) = (0, 0);
    for entry in entries {
        let (ev, d) = (cut(&entry.ev, EVENT_MAX_CHARS), entry.d.map(trim));
        bytes += ev.len() + d.as_ref().map_or(0, |d| d.to_string().len());
        if written == ENTRIES_MAX || bytes > CALL_MAX_BYTES {
            break;
        }
        write(applet_id, src, entry.t, &ev, d);
        written += 1;
    }
    if written < total {
        write(applet_id, src, now_ms(), "log.truncated", Some(json!({ "count": total - written })));
    }
}

fn write(applet_id: &str, src: &str, t: u64, ev: &str, d: Option<Value>) {
    let mut line = json!({ "t": t, "src": src, "ev": ev });
    if let Some(d) = d {
        line["d"] = d;
    }
    let Some(queue) = queue() else { return };
    let message = Message::Line { applet_id: applet_id.into(), line: line.to_string() };
    if let Err(TrySendError::Full(_)) = queue.try_send(message) {
        DROPPED.fetch_add(1, Ordering::Relaxed);
    }
}

/// Copies the applet's log, oldest file first, to one file in the cache's `shared-logs/`.
/// Waits for the log thread, so every line queued before is in the copy.
pub fn export(applet_id: &str) -> Option<String> {
    let (reply, answer) = mpsc::channel();
    queue()?.send(Message::Export { applet_id: applet_id.into(), reply }).ok()?;
    answer.recv_timeout(EXPORT_WAIT).ok().flatten()
}

/// Deletes the applet's log files, after the lines already queued.
pub fn delete(applet_id: &str) {
    if let Some(queue) = queue() {
        let _ = queue.send(Message::Delete { applet_id: applet_id.into() });
    }
}

/// The log thread's queue, started on first use. None when the thread could not start.
fn queue() -> Option<&'static SyncSender<Message>> {
    QUEUE
        .get_or_init(|| {
            let (sender, receiver) = mpsc::sync_channel(QUEUE_LINES);
            let thread = std::thread::Builder::new().name("genesis-log".into()).spawn(move || run(receiver));
            thread.ok().map(|_| sender)
        })
        .as_ref()
}

fn run(receiver: mpsc::Receiver<Message>) {
    let mut files = Files::default();
    let mut flushed = Instant::now();
    loop {
        let message = match files.dirty {
            true => match receiver.recv_timeout(FLUSH_EVERY.saturating_sub(flushed.elapsed())) {
                Ok(message) => Some(message),
                Err(RecvTimeoutError::Timeout) => None,
                Err(RecvTimeoutError::Disconnected) => return,
            },
            false => match receiver.recv() {
                Ok(message) => Some(message),
                Err(_) => return,
            },
        };
        if let Some(message) = message {
            files.handle(message);
            while let Ok(message) = receiver.try_recv() {
                files.handle(message);
            }
        }
        if files.dirty && flushed.elapsed() >= FLUSH_EVERY {
            files.flush();
            flushed = Instant::now();
        }
    }
}

/// The open `log-0` of each applet the thread wrote to, with its size.
#[derive(Default)]
struct Files {
    open: HashMap<String, (BufWriter<File>, u64)>,
    dirty: bool,
}

impl Files {
    fn handle(&mut self, message: Message) {
        match message {
            Message::Line { applet_id, line } => {
                let dropped = DROPPED.swap(0, Ordering::Relaxed);
                if dropped > 0 {
                    let note = json!({ "t": now_ms(), "src": "host", "ev": "log.dropped", "d": { "count": dropped } });
                    self.append(&applet_id, &note.to_string());
                }
                self.append(&applet_id, &line);
            }
            Message::Export { applet_id, reply } => {
                let _ = reply.send(self.export(&applet_id));
            }
            Message::Delete { applet_id } => {
                self.open.remove(&applet_id);
                if let Some((logs, _)) = directories() {
                    let _ = fs::remove_dir_all(logs.join(&applet_id));
                }
            }
        }
    }

    fn append(&mut self, applet_id: &str, line: &str) {
        if !self.open.contains_key(applet_id) {
            let Some(file) = open_newest(applet_id) else { return };
            self.open.insert(applet_id.into(), file);
        }
        let Some((writer, size)) = self.open.get_mut(applet_id) else { return };
        if writeln!(writer, "{line}").is_ok() {
            *size += line.len() as u64 + 1;
            self.dirty = true;
        }
        if *size >= FILE_MAX_BYTES {
            let _ = writer.flush();
            self.open.remove(applet_id);
            rotate(applet_id);
        }
    }

    fn flush(&mut self) {
        for (writer, _) in self.open.values_mut() {
            let _ = writer.flush();
        }
        self.dirty = false;
    }

    fn export(&mut self, applet_id: &str) -> Option<String> {
        self.flush();
        let (logs, shared) = directories()?;
        let directory = logs.join(applet_id);
        let parts: Vec<PathBuf> = (0..FILES_MAX).rev().map(|i| directory.join(file_name(i))).filter(|p| p.exists()).collect();
        if parts.is_empty() {
            return None;
        }
        fs::create_dir_all(&shared).ok()?;
        let target = shared.join(format!("{applet_id}-{}.jsonl", stamp(now_ms() / 1000)));
        let mut out = BufWriter::new(File::create(&target).ok()?);
        for part in parts {
            let mut input = File::open(part).ok()?;
            std::io::copy(&mut input, &mut out).ok()?;
        }
        out.flush().ok()?;
        Some(target.to_string_lossy().into_owned())
    }
}

fn file_name(index: usize) -> String {
    format!("log-{index}.jsonl")
}

/// The applet's `log-0`, opened to append. A new file starts with its header line.
fn open_newest(applet_id: &str) -> Option<(BufWriter<File>, u64)> {
    let (logs, _) = directories()?;
    let directory = logs.join(applet_id);
    fs::create_dir_all(&directory).ok()?;
    let file = OpenOptions::new().create(true).append(true).open(directory.join(file_name(0))).ok()?;
    let mut size = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut writer = BufWriter::new(file);
    if size == 0 {
        let header = json!({ "t": now_ms(), "src": "host", "ev": "log.header", "d": { "applet": applet_id, "protocol": compat::PROTOCOL } });
        let header = header.to_string();
        writeln!(writer, "{header}").ok()?;
        size = header.len() as u64 + 1;
    }
    Some((writer, size))
}

/// `log-0` becomes `log-1` and each older file moves up; the oldest beyond `log-3` goes.
fn rotate(applet_id: &str) {
    let Some((logs, _)) = directories() else { return };
    let directory = logs.join(applet_id);
    for index in (0..FILES_MAX - 1).rev() {
        let _ = fs::rename(directory.join(file_name(index)), directory.join(file_name(index + 1)));
    }
}

/// Cuts every string in `value` to `STRING_MAX_CHARS`.
fn trim(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(cut(&text, STRING_MAX_CHARS)),
        Value::Array(items) => Value::Array(items.into_iter().map(trim).collect()),
        Value::Object(fields) => Value::Object(fields.into_iter().map(|(k, v)| (cut(&k, EVENT_MAX_CHARS), trim(v))).collect()),
        other => other,
    }
}

fn cut(text: &str, max_chars: usize) -> String {
    match text.char_indices().nth(max_chars) {
        Some((end, _)) => text[..end].into(),
        None => text.into(),
    }
}

/// A URL as its origin and path, without query or fragment, for log lines.
pub fn origin_path(url: &str) -> String {
    match url::Url::parse(url) {
        Ok(parsed) => format!("{}{}", parsed.origin().ascii_serialization(), parsed.path()),
        Err(_) => String::new(),
    }
}

/// `yyyyMMdd-HHmmss` in UTC for epoch seconds `secs`.
fn stamp(secs: u64) -> String {
    let (days, rest) = (secs / 86_400, secs % 86_400);
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}{month:02}{day:02}-{:02}{:02}{:02}", rest / 3600, rest % 3600 / 60, rest % 60)
}
