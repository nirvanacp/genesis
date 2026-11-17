//! Runs one Go servelet, a WebAssembly module built for `wasip1` against ABI 1, over its SQLite
//! database.
//!
//! The module imports `wasi_snapshot_preview1` (see [`wasi`]) and `let`:
//! `sql(ptr, len) -> len` runs one database request and keeps the reply,
//! `sql_reply(ptr)` copies that reply into the guest, and `log(level, ptr, len)` writes a line.
//! It exports `memory`, `_initialize`, `let_alloc(len) -> ptr` and
//! `let_handle(ptr, len) -> ptr << 32 | len`; a request is `{method, path, body}` and a reply is
//! `{status, body}`.
//!
//! Each request runs with a fuel budget and a wall-clock budget. Running out of either is a
//! [`Failure::Deadline`]. A transaction the servelet leaves open is rolled back after each request.

mod memory;
mod sql;
mod wasi;

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rusqlite::Connection;
use rusqlite::config::DbConfig;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::limits::Limit;
use serde_json::Value;
use wasmi::{
    Caller, Config, Engine, Linker, Memory, Module, Store, StoreLimits, StoreLimitsBuilder,
    TrapCode, TypedFunc,
};

/// What one servelet may use.
#[derive(Clone, Debug)]
pub struct Limits {
    /// The largest request the host sends, in bytes of its JSON.
    pub request_bytes: usize,
    /// The largest reply the host accepts, in bytes of its JSON.
    pub response_bytes: usize,
    /// The most 64 KiB pages the module's memory may grow to.
    pub memory_pages: u32,
    /// The fuel one request may burn; `_initialize` gets ten times as much.
    pub fuel: u64,
    /// The longest one request may take; `_initialize` gets ten times as long.
    pub time: Duration,
    /// The most rows one query returns.
    pub sql_rows: usize,
    /// The largest query reply, in bytes of its JSON.
    pub sql_reply_bytes: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            request_bytes: 256 * 1024,
            response_bytes: 256 * 1024,
            memory_pages: 4096,
            fuel: FUEL_PER_REQUEST,
            time: Duration::from_secs(5),
            sql_rows: 10_000,
            sql_reply_bytes: 4 * 1024 * 1024,
        }
    }
}

/// About 2.7 s of a busy loop on an Apple M-series computer; slower phones take longer, and the
/// wall-clock budget ends a request that waits on the clock or the database.
const FUEL_PER_REQUEST: u64 = 2_000_000_000;

/// The ABI this runtime implements; `servelet.json` in a bundle names the ABI its module uses.
pub const ABI: u32 = 1;

/// Slack for the `method` and `path` around the body when comparing a message with a limit.
const ENVELOPE_BYTES: usize = 1024;
const LOG_LINE_BYTES: u32 = 4096;

pub struct Request {
    pub method: String,
    pub path: String,
    pub body: Option<Value>,
}

#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub body: Value,
}

#[derive(Debug)]
pub enum Failure {
    /// The module, its ABI or its database cannot be used.
    Unavailable(String),
    /// The request ran out of fuel or time.
    Deadline,
    /// The request or the reply is larger than its limit.
    TooLarge(String),
    /// The module trapped, exited or broke ABI 1.
    Trap(String),
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Failure::Unavailable(message) => write!(f, "unavailable: {message}"),
            Failure::Deadline => f.write_str("the request ran out of time"),
            Failure::TooLarge(message) => write!(f, "too large: {message}"),
            Failure::Trap(message) => write!(f, "trap: {message}"),
        }
    }
}

impl std::error::Error for Failure {}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Debug,
    Info,
    Warn,
    Error,
}

/// Receives the servelet's log lines and its standard output and error.
pub type Log = Box<dyn Fn(Level, &str) + Send + Sync>;

/// The end of the running call's time, shared with SQLite's progress handler.
#[derive(Clone, Default)]
struct Deadline(Arc<Mutex<Option<Instant>>>);

impl Deadline {
    fn set(&self, after: Duration) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now() + after);
    }
    fn clear(&self) {
        *self.0.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
    fn passed(&self) -> bool {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some_and(|end| Instant::now() >= end)
    }
}

/// The host error that ends a call whose time ran out.
#[derive(Debug)]
struct TimeUp;

impl std::fmt::Display for TimeUp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("the call ran out of time")
    }
}

impl wasmi::errors::HostError for TimeUp {}

struct State {
    memory: Option<Memory>,
    db: Connection,
    limits: Limits,
    reply: Vec<u8>,
    log: Log,
    started: Instant,
    deadline: Deadline,
    store_limits: StoreLimits,
}

/// One instance of a servelet module over its database.
pub struct Servelet {
    store: Store<State>,
    memory: Memory,
    alloc: TypedFunc<i32, i32>,
    handle: TypedFunc<(i32, i32), i64>,
}

fn stderr_log(level: Level, line: &str) {
    eprintln!("servelet {level:?}: {line}");
}

/// Opens the database with foreign keys, a busy timeout and WAL, and keeps it to its own file:
/// no `ATTACH`, no `VACUUM INTO`, defensive mode on, and long statements stop at the deadline.
fn open_database(path: &Path, deadline: &Deadline) -> Result<Connection, rusqlite::Error> {
    let mut db = Connection::open(path)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
    db.set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)?;
    db.set_limit(Limit::SQLITE_LIMIT_ATTACHED, 0)?;
    db.execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 1000;")?;
    if path != Path::new(":memory:") {
        db.pragma_update(None, "journal_mode", "WAL")?;
    }
    db.authorizer(Some(|context: AuthContext<'_>| match context.action {
        AuthAction::Attach { .. } | AuthAction::Detach { .. } => Authorization::Deny,
        _ => Authorization::Allow,
    }))?;
    let deadline = deadline.clone();
    db.progress_handler(10_000, Some(move || deadline.passed()))?;
    Ok(db)
}

fn define_let(linker: &mut Linker<State>) -> Result<(), wasmi::Error> {
    linker.func_wrap(
        "let",
        "sql",
        |mut caller: Caller<'_, State>, ptr: i32, len: i32| -> Result<i32, wasmi::Error> {
            if caller.data().deadline.passed() {
                return Err(wasmi::Error::host(TimeUp));
            }
            if len as u32 as usize > caller.data().limits.sql_reply_bytes {
                return Err(memory::fault("a database request is larger than its limit"));
            }
            let memory = memory::of(&caller)?;
            let request = memory::read(memory, &caller, ptr as u32, len as u32)?;
            let state = caller.data_mut();
            state.reply = sql::run(&state.db, &request, &state.limits).into_bytes();
            if state.deadline.passed() {
                return Err(wasmi::Error::host(TimeUp));
            }
            Ok(state.reply.len() as i32)
        },
    )?;
    linker.func_wrap(
        "let",
        "sql_reply",
        |mut caller: Caller<'_, State>, ptr: i32| -> Result<(), wasmi::Error> {
            let reply = std::mem::take(&mut caller.data_mut().reply);
            let memory = memory::of(&caller)?;
            memory::write(memory, &mut caller, ptr as u32, &reply)
        },
    )?;
    linker.func_wrap(
        "let",
        "log",
        |caller: Caller<'_, State>, level: i32, ptr: i32, len: i32| -> Result<(), wasmi::Error> {
            let memory = memory::of(&caller)?;
            let line = memory::read(
                memory,
                &caller,
                ptr as u32,
                (len as u32).min(LOG_LINE_BYTES),
            )?;
            let level = match level {
                0 => Level::Debug,
                1 => Level::Info,
                2 => Level::Warn,
                _ => Level::Error,
            };
            (caller.data().log)(level, &String::from_utf8_lossy(&line));
            Ok(())
        },
    )?;
    Ok(())
}

/// Maps the error that ended a guest call to a failure.
fn failure(error: wasmi::Error) -> Failure {
    if error.as_trap_code() == Some(TrapCode::OutOfFuel) || error.downcast_ref::<TimeUp>().is_some()
    {
        return Failure::Deadline;
    }
    if let Some(status) = error.i32_exit_status() {
        return Failure::Trap(format!("the servelet exited with status {status}"));
    }
    if let Some(fault) = error.downcast_ref::<memory::Fault>() {
        return Failure::Trap(fault.0.clone());
    }
    Failure::Trap(error.to_string())
}

impl Servelet {
    /// Loads `wasm` over the database at `database` (`:memory:` for a throwaway one) and runs its
    /// `_initialize`. Log lines go to standard error.
    pub fn open(wasm: &[u8], database: &Path, limits: Limits) -> Result<Self, Failure> {
        Self::open_with_log(wasm, database, limits, Box::new(stderr_log))
    }

    pub fn open_with_log(
        wasm: &[u8],
        database: &Path,
        limits: Limits,
        log: Log,
    ) -> Result<Self, Failure> {
        let mut config = Config::default();
        config.consume_fuel(true);
        let engine = Engine::new(&config);
        let module = Module::new(&engine, wasm)
            .map_err(|e| Failure::Unavailable(format!("invalid module: {e}")))?;
        let deadline = Deadline::default();
        let db = open_database(database, &deadline)
            .map_err(|e| Failure::Unavailable(format!("cannot open the database: {e}")))?;
        let store_limits = StoreLimitsBuilder::new()
            .memory_size(limits.memory_pages as usize * 65536)
            .trap_on_grow_failure(true)
            .build();
        let fuel = limits.fuel;
        let time = limits.time;
        let state = State {
            memory: None,
            db,
            limits,
            reply: Vec::new(),
            log,
            started: Instant::now(),
            deadline,
            store_limits,
        };
        let mut store = Store::new(&engine, state);
        store.limiter(|state| &mut state.store_limits);

        let mut linker = Linker::new(&engine);
        wasi::define(&mut linker)
            .and_then(|()| define_let(&mut linker))
            .map_err(|e| Failure::Unavailable(e.to_string()))?;
        let instance = linker
            .instantiate_and_start(&mut store, &module)
            .map_err(|e| Failure::Unavailable(format!("cannot link the module: {e}")))?;
        let missing = |name: &str| {
            Failure::Unavailable(format!("the module does not export {name} for ABI {ABI}"))
        };
        let memory = instance
            .get_memory(&store, "memory")
            .ok_or_else(|| missing("memory"))?;
        let initialize = instance
            .get_typed_func::<(), ()>(&store, "_initialize")
            .map_err(|_| missing("_initialize"))?;
        let alloc = instance
            .get_typed_func::<i32, i32>(&store, "let_alloc")
            .map_err(|_| missing("let_alloc"))?;
        let handle = instance
            .get_typed_func::<(i32, i32), i64>(&store, "let_handle")
            .map_err(|_| missing("let_handle"))?;
        store.data_mut().memory = Some(memory);

        store
            .set_fuel(fuel.saturating_mul(10))
            .map_err(|e| Failure::Unavailable(e.to_string()))?;
        store.data().deadline.set(time * 10);
        let started = initialize.call(&mut store, ());
        store.data().deadline.clear();
        started.map_err(|error| match failure(error) {
            Failure::Deadline => Failure::Unavailable("the servelet took too long to start".into()),
            other => Failure::Unavailable(format!("the servelet failed to start: {other}")),
        })?;
        Ok(Self {
            store,
            memory,
            alloc,
            handle,
        })
    }

    /// Sends one request and returns the servelet's reply. After a `Deadline` or a `Trap` the
    /// instance may be in any state; drop it and open a new one.
    pub fn handle(&mut self, request: &Request) -> Result<Response, Failure> {
        let message = serde_json::json!({ "method": request.method, "path": request.path, "body": request.body }).to_string();
        let limits = self.store.data().limits.clone();
        if message.len() > limits.request_bytes + ENVELOPE_BYTES {
            return Err(Failure::TooLarge(format!(
                "requests hold at most {} bytes",
                limits.request_bytes
            )));
        }
        self.store
            .set_fuel(limits.fuel)
            .map_err(|e| Failure::Trap(e.to_string()))?;
        self.store.data().deadline.set(limits.time);
        let reply = self.call(message.as_bytes(), &limits);
        self.store.data().deadline.clear();
        let state = self.store.data();
        if !state.db.is_autocommit() {
            let rolled_back = state.db.execute_batch("ROLLBACK");
            (state.log)(
                Level::Warn,
                &format!(
                    "{} {} returned inside a transaction; rolled back",
                    request.method, request.path
                ),
            );
            rolled_back.map_err(|e| Failure::Trap(format!("cannot roll back: {e}")))?;
        }
        reply
    }

    fn call(&mut self, message: &[u8], limits: &Limits) -> Result<Response, Failure> {
        let len = message.len() as i32;
        let ptr = self.alloc.call(&mut self.store, len).map_err(failure)?;
        memory::write(self.memory, &mut self.store, ptr as u32, message).map_err(failure)?;
        let packed = self
            .handle
            .call(&mut self.store, (ptr, len))
            .map_err(failure)? as u64;
        let (reply_ptr, reply_len) = ((packed >> 32) as u32, packed as u32);
        if reply_len as usize > limits.response_bytes + ENVELOPE_BYTES {
            return Err(Failure::TooLarge(format!(
                "responses hold at most {} bytes",
                limits.response_bytes
            )));
        }
        let reply =
            memory::read(self.memory, &self.store, reply_ptr, reply_len).map_err(failure)?;
        let reply: Value = serde_json::from_slice(&reply)
            .map_err(|_| Failure::Trap("the reply is not JSON".into()))?;
        let status = reply
            .get("status")
            .and_then(Value::as_u64)
            .and_then(|s| u16::try_from(s).ok())
            .filter(|s| (100..=599).contains(s))
            .ok_or_else(|| Failure::Trap("the reply has no valid status".into()))?;
        Ok(Response {
            status,
            body: reply.get("body").cloned().unwrap_or(Value::Null),
        })
    }
}
