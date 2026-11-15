//! The `wasi_snapshot_preview1` imports, as a sandbox with no files, no network and no environment.
//!
//! Standard output and standard error go to the log, standard input is empty, the clocks and the
//! random source are real, and `poll_oneoff` sleeps for the shortest clock subscription, at most
//! 50 ms per call. Every path call answers `ENOENT`, every other descriptor `EBADF`, and sockets
//! `ENOSYS`. `proc_exit` ends the call with a trap.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use wasmi::{Caller, Linker};

use crate::memory::{self, fault};
use crate::{Level, State, TimeUp};

const MODULE: &str = "wasi_snapshot_preview1";

const SUCCESS: i32 = 0;
const EBADF: i32 = 8;
const EINVAL: i32 = 28;
const ENOENT: i32 = 44;
const ENOSYS: i32 = 52;
const ESPIPE: i32 = 70;

const FILETYPE_CHARACTER_DEVICE: u8 = 2;
const LONGEST_POLL: Duration = Duration::from_millis(50);
const LOG_WRITE_BYTES: u32 = 4096;

fn is_stdio(fd: i32) -> bool {
    (0..=2).contains(&fd)
}

type Result<T> = std::result::Result<T, wasmi::Error>;

/// Nanoseconds on clock `id`: 0 is the wall clock; the monotonic and CPU clocks count from start.
fn now(state: &State, id: i32) -> Option<u64> {
    match id {
        0 => Some(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_nanos() as u64),
        ),
        1..=3 => Some(state.started.elapsed().as_nanos() as u64),
        _ => None,
    }
}

/// Writes empty argument and environment lists: zero entries and zero bytes.
fn empty_sizes(mut caller: Caller<'_, State>, count: i32, bytes: i32) -> Result<i32> {
    let memory = memory::of(&caller)?;
    memory::write_u32(memory, &mut caller, count as u32, 0)?;
    memory::write_u32(memory, &mut caller, bytes as u32, 0)?;
    Ok(SUCCESS)
}

fn fd_write(
    mut caller: Caller<'_, State>,
    fd: i32,
    iovs: i32,
    count: i32,
    written: i32,
) -> Result<i32> {
    if fd != 1 && fd != 2 {
        return Ok(EBADF);
    }
    let memory = memory::of(&caller)?;
    let mut total = 0u32;
    let mut text = Vec::new();
    for index in 0..count as u32 {
        let iov = (iovs as u32).wrapping_add(index * 8);
        let ptr = memory::read_u32(memory, &caller, iov)?;
        let len = memory::read_u32(memory, &caller, iov.wrapping_add(4))?;
        let kept = len.min(LOG_WRITE_BYTES.saturating_sub(text.len() as u32));
        text.extend(memory::read(memory, &caller, ptr, kept)?);
        total = total.wrapping_add(len);
    }
    let level = if fd == 1 { Level::Info } else { Level::Warn };
    let line = String::from_utf8_lossy(&text);
    let line = line.trim_end();
    if !line.is_empty() {
        (caller.data().log)(level, line);
    }
    memory::write_u32(memory, &mut caller, written as u32, total)?;
    Ok(SUCCESS)
}

fn fd_read(
    mut caller: Caller<'_, State>,
    fd: i32,
    _iovs: i32,
    _count: i32,
    read: i32,
) -> Result<i32> {
    if fd != 0 {
        return Ok(EBADF);
    }
    let memory = memory::of(&caller)?;
    memory::write_u32(memory, &mut caller, read as u32, 0)?;
    Ok(SUCCESS)
}

fn fd_fdstat_get(mut caller: Caller<'_, State>, fd: i32, out: i32) -> Result<i32> {
    if !is_stdio(fd) {
        return Ok(EBADF);
    }
    let mut stat = [0u8; 24];
    stat[0] = FILETYPE_CHARACTER_DEVICE;
    stat[8..16].copy_from_slice(&u64::MAX.to_le_bytes());
    stat[16..24].copy_from_slice(&u64::MAX.to_le_bytes());
    let memory = memory::of(&caller)?;
    memory::write(memory, &mut caller, out as u32, &stat)?;
    Ok(SUCCESS)
}

fn fd_filestat_get(mut caller: Caller<'_, State>, fd: i32, out: i32) -> Result<i32> {
    if !is_stdio(fd) {
        return Ok(EBADF);
    }
    let mut stat = [0u8; 64];
    stat[16] = FILETYPE_CHARACTER_DEVICE;
    let memory = memory::of(&caller)?;
    memory::write(memory, &mut caller, out as u32, &stat)?;
    Ok(SUCCESS)
}

fn clock_res_get(mut caller: Caller<'_, State>, id: i32, out: i32) -> Result<i32> {
    if now(caller.data(), id).is_none() {
        return Ok(EINVAL);
    }
    let memory = memory::of(&caller)?;
    memory::write_u64(memory, &mut caller, out as u32, 1_000)?;
    Ok(SUCCESS)
}

fn clock_time_get(
    mut caller: Caller<'_, State>,
    id: i32,
    _precision: i64,
    out: i32,
) -> Result<i32> {
    let Some(time) = now(caller.data(), id) else {
        return Ok(EINVAL);
    };
    let memory = memory::of(&caller)?;
    memory::write_u64(memory, &mut caller, out as u32, time)?;
    Ok(SUCCESS)
}

fn random_get(mut caller: Caller<'_, State>, ptr: i32, len: i32) -> Result<i32> {
    let memory = memory::of(&caller)?;
    memory::check(memory, &caller, ptr as u32, len as u32)?;
    let mut bytes = vec![0u8; len as u32 as usize];
    getrandom::fill(&mut bytes).map_err(|error| fault(format!("no random source: {error}")))?;
    memory::write(memory, &mut caller, ptr as u32, &bytes)?;
    Ok(SUCCESS)
}

/// Waits for the shortest clock subscription, at most 50 ms, and reports it with every descriptor
/// subscription. Standard descriptors are always ready; others report `EBADF`.
fn poll_oneoff(
    mut caller: Caller<'_, State>,
    subscriptions: i32,
    events: i32,
    count: i32,
    reported: i32,
) -> Result<i32> {
    if count <= 0 {
        return Ok(EINVAL);
    }
    if caller.data().deadline.passed() {
        return Err(wasmi::Error::host(TimeUp));
    }
    let memory = memory::of(&caller)?;
    let bytes = memory::read(
        memory,
        &caller,
        subscriptions as u32,
        (count as u32).saturating_mul(48),
    )?;
    let mut shortest: Option<(u64, u64)> = None;
    let mut ready = Vec::new();
    for subscription in bytes.chunks_exact(48) {
        let userdata = u64::from_le_bytes(subscription[0..8].try_into().unwrap());
        match subscription[8] {
            0 => {
                let id = i32::from_le_bytes(subscription[16..20].try_into().unwrap());
                let timeout = u64::from_le_bytes(subscription[24..32].try_into().unwrap());
                let absolute =
                    u16::from_le_bytes(subscription[40..42].try_into().unwrap()) & 1 == 1;
                let wait = match (absolute, now(caller.data(), id)) {
                    (true, Some(time)) => timeout.saturating_sub(time),
                    _ => timeout,
                };
                if shortest.is_none_or(|(_, current)| wait < current) {
                    shortest = Some((userdata, wait));
                }
            }
            kind => {
                let fd = i32::from_le_bytes(subscription[16..20].try_into().unwrap());
                let error = if is_stdio(fd) { SUCCESS } else { EBADF };
                ready.push((userdata, error as u16, kind));
            }
        }
    }
    if let (true, Some((_, wait))) = (ready.is_empty(), shortest) {
        std::thread::sleep(Duration::from_nanos(wait).min(LONGEST_POLL));
    }
    if let Some((userdata, _)) = shortest {
        ready.push((userdata, SUCCESS as u16, 0));
    }
    for (index, (userdata, error, kind)) in ready.iter().enumerate() {
        let mut event = [0u8; 32];
        event[0..8].copy_from_slice(&userdata.to_le_bytes());
        event[8..10].copy_from_slice(&error.to_le_bytes());
        event[10] = *kind;
        memory::write(
            memory,
            &mut caller,
            (events as u32).wrapping_add(index as u32 * 32),
            &event,
        )?;
    }
    memory::write_u32(memory, &mut caller, reported as u32, ready.len() as u32)?;
    Ok(SUCCESS)
}

macro_rules! answer {
    ($linker:ident, $name:literal, $code:expr, ($($arg:ty),*)) => {
        $linker.func_wrap(MODULE, $name, |$(_: $arg),*| -> i32 { $code })?;
    };
}

/// Adds every preview1 function to `linker`.
pub fn define(linker: &mut Linker<State>) -> std::result::Result<(), wasmi::Error> {
    linker.func_wrap(MODULE, "args_sizes_get", empty_sizes)?;
    linker.func_wrap(MODULE, "environ_sizes_get", empty_sizes)?;
    answer!(linker, "args_get", SUCCESS, (i32, i32));
    answer!(linker, "environ_get", SUCCESS, (i32, i32));
    linker.func_wrap(MODULE, "clock_res_get", clock_res_get)?;
    linker.func_wrap(MODULE, "clock_time_get", clock_time_get)?;
    linker.func_wrap(MODULE, "random_get", random_get)?;
    linker.func_wrap(MODULE, "poll_oneoff", poll_oneoff)?;
    answer!(linker, "sched_yield", SUCCESS, ());
    linker.func_wrap(MODULE, "proc_exit", |status: i32| -> Result<()> {
        Err(wasmi::Error::i32_exit(status))
    })?;
    answer!(linker, "proc_raise", ENOSYS, (i32));

    linker.func_wrap(MODULE, "fd_write", fd_write)?;
    linker.func_wrap(MODULE, "fd_read", fd_read)?;
    linker.func_wrap(MODULE, "fd_fdstat_get", fd_fdstat_get)?;
    linker.func_wrap(MODULE, "fd_filestat_get", fd_filestat_get)?;
    linker.func_wrap(MODULE, "fd_close", |fd: i32| -> i32 {
        if is_stdio(fd) { SUCCESS } else { EBADF }
    })?;
    linker.func_wrap(MODULE, "fd_fdstat_set_flags", |fd: i32, _: i32| -> i32 {
        if is_stdio(fd) { SUCCESS } else { EBADF }
    })?;
    linker.func_wrap(
        MODULE,
        "fd_seek",
        |fd: i32, _: i64, _: i32, _: i32| -> i32 { if is_stdio(fd) { ESPIPE } else { EBADF } },
    )?;
    linker.func_wrap(MODULE, "fd_tell", |fd: i32, _: i32| -> i32 {
        if is_stdio(fd) { ESPIPE } else { EBADF }
    })?;
    answer!(linker, "fd_advise", EBADF, (i32, i64, i64, i32));
    answer!(linker, "fd_allocate", EBADF, (i32, i64, i64));
    answer!(linker, "fd_datasync", EBADF, (i32));
    answer!(linker, "fd_sync", EBADF, (i32));
    answer!(linker, "fd_fdstat_set_rights", EBADF, (i32, i64, i64));
    answer!(linker, "fd_filestat_set_size", EBADF, (i32, i64));
    answer!(linker, "fd_filestat_set_times", EBADF, (i32, i64, i64, i32));
    answer!(linker, "fd_pread", EBADF, (i32, i32, i32, i64, i32));
    answer!(linker, "fd_pwrite", EBADF, (i32, i32, i32, i64, i32));
    answer!(linker, "fd_prestat_get", EBADF, (i32, i32));
    answer!(linker, "fd_prestat_dir_name", EBADF, (i32, i32, i32));
    answer!(linker, "fd_readdir", EBADF, (i32, i32, i32, i64, i32));
    answer!(linker, "fd_renumber", EBADF, (i32, i32));

    answer!(linker, "path_create_directory", ENOENT, (i32, i32, i32));
    answer!(
        linker,
        "path_filestat_get",
        ENOENT,
        (i32, i32, i32, i32, i32)
    );
    answer!(
        linker,
        "path_filestat_set_times",
        ENOENT,
        (i32, i32, i32, i32, i64, i64, i32)
    );
    answer!(
        linker,
        "path_link",
        ENOENT,
        (i32, i32, i32, i32, i32, i32, i32)
    );
    answer!(
        linker,
        "path_open",
        ENOENT,
        (i32, i32, i32, i32, i32, i64, i64, i32, i32)
    );
    answer!(
        linker,
        "path_readlink",
        ENOENT,
        (i32, i32, i32, i32, i32, i32)
    );
    answer!(linker, "path_remove_directory", ENOENT, (i32, i32, i32));
    answer!(
        linker,
        "path_rename",
        ENOENT,
        (i32, i32, i32, i32, i32, i32)
    );
    answer!(linker, "path_symlink", ENOENT, (i32, i32, i32, i32, i32));
    answer!(linker, "path_unlink_file", ENOENT, (i32, i32, i32));

    answer!(linker, "sock_accept", ENOSYS, (i32, i32, i32));
    answer!(linker, "sock_recv", ENOSYS, (i32, i32, i32, i32, i32, i32));
    answer!(linker, "sock_send", ENOSYS, (i32, i32, i32, i32, i32));
    answer!(linker, "sock_shutdown", ENOSYS, (i32, i32));
    Ok(())
}
