//! Local servelets: an applet's own backend, a wasm module that runs on the phone.
//!
//! One worker thread, `genesis-servelet`, owns every running servelet and its SQLite database at
//! `<files>/servelets/<applet>/<service>/data.sqlite3`. It answers a job with the JSON of a
//! `ServiceResponse` or `ServiceFailed` shell event, which the shell relays back to `dispatch`, so
//! a local reply finishes the operation the same way a remote one does.
use genesis_contracts::{ErrorCode, ShellEvent};
use genesis_servelet_runtime::{Failure, Level, Limits, Request, Servelet};
use jni::{
    JavaVM, jni_sig, jni_str,
    objects::{Global, JClass, JString, JValue},
};
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    path::{Path, PathBuf},
    sync::{
        OnceLock,
        atomic::{AtomicUsize, Ordering},
        mpsc::{Sender, channel},
    },
    time::Instant,
};

/// Requests waiting for the worker, at most; one more is refused with `QuotaExceeded`.
const QUEUED_MAX: usize = 64;
/// Running servelets kept open; opening another drops the least recently used.
const INSTANCES_MAX: usize = 2;

/// A local service of an installed revision, read from its `servelets/<id>/servelet.json`.
#[derive(Clone, Debug)]
pub struct LocalServelet {
    pub wasm: PathBuf,
    pub sha256: String,
}

pub struct ServeletJob {
    pub request_id: u64,
    pub applet_id: String,
    pub service_id: String,
    pub servelet: LocalServelet,
    pub request: Request,
}

enum Message {
    Handle(ServeletJob),
    /// Stops the applet's servelets; the next request opens them again.
    Drop(String),
    /// Stops the applet's servelets and deletes their databases.
    Erase(String),
}

struct Instance {
    applet_id: String,
    service_id: String,
    sha256: String,
    servelet: Servelet,
}

// Process lifetime, like the storage worker. Control messages are never refused, so the channel
// is unbounded and `QUEUED` bounds the requests alone.
static MESSAGES: OnceLock<Sender<Message>> = OnceLock::new();
static QUEUED: AtomicUsize = AtomicUsize::new(0);

pub fn initialized() -> bool {
    MESSAGES.get().is_some()
}

pub fn start(root: PathBuf, vm: JavaVM, callback: Global<JClass<'static>>) -> Result<(), String> {
    if initialized() {
        return Ok(());
    }
    let (sender, receiver) = channel::<Message>();
    std::thread::Builder::new()
        .name("genesis-servelet".into())
        .spawn(move || {
            let mut worker = Worker { root, instances: Vec::new() };
            for message in receiver {
                match message {
                    Message::Handle(job) => {
                        QUEUED.fetch_sub(1, Ordering::SeqCst);
                        let event = catch_unwind(AssertUnwindSafe(|| worker.handle(&job))).unwrap_or_else(|_| {
                            worker.drop_applet(&job.applet_id);
                            failed(job.request_id, ErrorCode::ServiceFailure, format!("Servelet {} failed", job.service_id))
                        });
                        deliver(&vm, &callback, &event);
                    }
                    Message::Drop(applet_id) => worker.drop_applet(&applet_id),
                    Message::Erase(applet_id) => {
                        worker.drop_applet(&applet_id);
                        let _ = std::fs::remove_dir_all(worker.root.join(&applet_id));
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;
    MESSAGES.set(sender).map_err(|_| "Servelet worker already configured".into())
}

/// Queues a request; false when the queue is full or the worker never started.
pub fn submit(job: ServeletJob) -> bool {
    let Some(messages) = MESSAGES.get() else { return false };
    if QUEUED.fetch_add(1, Ordering::SeqCst) >= QUEUED_MAX {
        QUEUED.fetch_sub(1, Ordering::SeqCst);
        return false;
    }
    let sent = messages.send(Message::Handle(job)).is_ok();
    if !sent {
        QUEUED.fetch_sub(1, Ordering::SeqCst);
    }
    sent
}

/// Stops the applet's running servelets after the requests already queued.
pub fn drop_applet(applet_id: &str) {
    if let Some(messages) = MESSAGES.get() {
        let _ = messages.send(Message::Drop(applet_id.into()));
    }
}

/// Stops the applet's servelets and deletes their data, after the requests already queued.
pub fn erase_applet(applet_id: &str) {
    if let Some(messages) = MESSAGES.get() {
        let _ = messages.send(Message::Erase(applet_id.into()));
    }
}

struct Worker {
    root: PathBuf,
    /// Most recently used last.
    instances: Vec<Instance>,
}

impl Worker {
    fn handle(&mut self, job: &ServeletJob) -> ShellEvent {
        let started = Instant::now();
        let index = match self.instance(job) {
            Ok(index) => index,
            Err(failure) => {
                log(Level::Error, &format!("{}/{}: {failure}", job.applet_id, job.service_id));
                return failure_event(job, failure);
            }
        };
        let opened = started.elapsed();
        let result = self.instances[index].servelet.handle(&job.request);
        let outcome = match &result {
            Ok(response) => response.status.to_string(),
            Err(failure) => failure.to_string(),
        };
        log(
            Level::Debug,
            &format!(
                "{}/{} {} {} {outcome} in {} ms (open {} ms)",
                job.applet_id,
                job.service_id,
                job.request.method,
                job.request.path,
                started.elapsed().as_millis(),
                opened.as_millis()
            ),
        );
        match result {
            Ok(response) => ShellEvent::ServiceResponse { request_id: job.request_id, status: response.status, body: response.body },
            Err(failure) => {
                // A trapped or stopped module may have left its memory in any state.
                if matches!(failure, Failure::Trap(_) | Failure::Deadline) {
                    self.instances.remove(index);
                }
                failure_event(job, failure)
            }
        }
    }

    /// The running instance for the job, opened when missing or when its module changed.
    fn instance(&mut self, job: &ServeletJob) -> Result<usize, Failure> {
        let same = |i: &Instance| i.applet_id == job.applet_id && i.service_id == job.service_id;
        if let Some(index) = self.instances.iter().position(same) {
            let instance = self.instances.remove(index);
            if instance.sha256 == job.servelet.sha256 {
                self.instances.push(instance);
                return Ok(self.instances.len() - 1);
            }
        }
        if self.instances.len() >= INSTANCES_MAX {
            self.instances.remove(0);
        }
        let servelet = open(&self.root, job)?;
        self.instances.push(Instance {
            applet_id: job.applet_id.clone(),
            service_id: job.service_id.clone(),
            sha256: job.servelet.sha256.clone(),
            servelet,
        });
        Ok(self.instances.len() - 1)
    }

    fn drop_applet(&mut self, applet_id: &str) {
        self.instances.retain(|i| i.applet_id != applet_id);
    }
}

fn open(root: &Path, job: &ServeletJob) -> Result<Servelet, Failure> {
    let unavailable = |message: String| Failure::Unavailable(message);
    let wasm = std::fs::read(&job.servelet.wasm).map_err(|e| unavailable(format!("cannot read the module: {e}")))?;
    let directory = root.join(&job.applet_id).join(&job.service_id);
    std::fs::create_dir_all(&directory).map_err(|e| unavailable(format!("cannot create its data directory: {e}")))?;
    let name = format!("{}/{}", job.applet_id, job.service_id);
    let lines = Box::new(move |level: Level, line: &str| log(level, &format!("{name}: {line}")));
    Servelet::open_with_log(&wasm, &directory.join("data.sqlite3"), Limits::default(), lines)
}

/// Writes a line to logcat under the tag `servelet` in debug builds on Android; release builds
/// and other targets drop it.
#[cfg(all(target_os = "android", debug_assertions))]
fn log(level: Level, line: &str) {
    use std::ffi::{CString, c_char, c_int};
    #[link(name = "log")]
    unsafe extern "C" {
        fn __android_log_write(priority: c_int, tag: *const c_char, text: *const c_char) -> c_int;
    }
    // android/log.h priorities: DEBUG 3, INFO 4, WARN 5, ERROR 6.
    let priority = match level {
        Level::Debug => 3,
        Level::Info => 4,
        Level::Warn => 5,
        Level::Error => 6,
    };
    let Ok(text) = CString::new(line.replace('\0', " ")) else { return };
    // SAFETY: both pointers are NUL-terminated strings that outlive the call.
    unsafe { __android_log_write(priority, c"servelet".as_ptr(), text.as_ptr()) };
}

#[cfg(not(all(target_os = "android", debug_assertions)))]
fn log(_level: Level, _line: &str) {}

fn failure_event(job: &ServeletJob, failure: Failure) -> ShellEvent {
    let service = &job.service_id;
    let (code, message) = match failure {
        Failure::Unavailable(reason) => (ErrorCode::ServiceFailure, format!("Servelet {service} is unavailable: {reason}")),
        Failure::Trap(reason) => (ErrorCode::ServiceFailure, format!("Servelet {service} failed: {reason}")),
        Failure::Deadline => (ErrorCode::Deadline, format!("Servelet {service} took too long to answer")),
        Failure::TooLarge(reason) => (ErrorCode::MessageTooLarge, format!("Servelet {service}: {reason}")),
    };
    failed(job.request_id, code, message)
}

fn failed(request_id: u64, code: ErrorCode, message: String) -> ShellEvent {
    ShellEvent::ServiceFailed { request_id, code, message }
}

pub(crate) fn deliver(vm: &JavaVM, callback: &Global<JClass<'static>>, event: &ShellEvent) {
    let Ok(encoded) = serde_json::to_string(event) else { return };
    let _ = vm.attach_current_thread(|env| -> jni::errors::Result<()> {
        let value = JString::from_str(env, encoded)?;
        env.call_static_method(
            &**callback,
            jni_str!("onServeletResult"),
            jni_sig!("(Ljava/lang/String;)V"),
            &[JValue::Object(value.as_ref())],
        )?;
        Ok(())
    });
}
