//! Bounds-checked access to guest memory. Every pointer the guest passes is checked here; one that
//! points outside its memory ends the call with a trap.

use wasmi::{AsContext, AsContextMut, Caller, Memory};

use crate::State;

/// A guest fault: the module passed a pointer or length outside its memory, or broke ABI 1.
#[derive(Debug)]
pub struct Fault(pub String);

impl std::fmt::Display for Fault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl wasmi::errors::HostError for Fault {}

pub fn fault(message: impl Into<String>) -> wasmi::Error {
    wasmi::Error::host(Fault(message.into()))
}

/// The memory the module exports.
pub fn of(caller: &Caller<'_, State>) -> Result<Memory, wasmi::Error> {
    caller
        .data()
        .memory
        .ok_or_else(|| fault("the module has no memory export"))
}

/// Checks that `len` bytes at `ptr` lie inside guest memory, before anything is allocated for them.
pub fn check(
    memory: Memory,
    context: impl AsContext,
    ptr: u32,
    len: u32,
) -> Result<(), wasmi::Error> {
    if u64::from(ptr) + u64::from(len) > memory.data_size(&context) as u64 {
        return Err(fault(format!(
            "{len} bytes at {ptr} are outside guest memory"
        )));
    }
    Ok(())
}

pub fn read(
    memory: Memory,
    context: impl AsContext,
    ptr: u32,
    len: u32,
) -> Result<Vec<u8>, wasmi::Error> {
    check(memory, &context, ptr, len)?;
    let mut bytes = vec![0; len as usize];
    memory
        .read(&context, ptr as usize, &mut bytes)
        .map_err(|_| {
            fault(format!(
                "read of {len} bytes at {ptr} is outside guest memory"
            ))
        })?;
    Ok(bytes)
}

pub fn write(
    memory: Memory,
    mut context: impl AsContextMut,
    ptr: u32,
    bytes: &[u8],
) -> Result<(), wasmi::Error> {
    memory
        .write(&mut context, ptr as usize, bytes)
        .map_err(|_| {
            fault(format!(
                "write of {} bytes at {ptr} is outside guest memory",
                bytes.len()
            ))
        })
}

pub fn read_u32(memory: Memory, context: impl AsContext, ptr: u32) -> Result<u32, wasmi::Error> {
    let bytes = read(memory, context, ptr, 4)?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

pub fn write_u32(
    memory: Memory,
    context: impl AsContextMut,
    ptr: u32,
    value: u32,
) -> Result<(), wasmi::Error> {
    write(memory, context, ptr, &value.to_le_bytes())
}

pub fn write_u64(
    memory: Memory,
    context: impl AsContextMut,
    ptr: u32,
    value: u64,
) -> Result<(), wasmi::Error> {
    write(memory, context, ptr, &value.to_le_bytes())
}
