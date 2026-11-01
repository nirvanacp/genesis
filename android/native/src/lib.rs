mod controller;
mod isolated;
mod navigation;
mod packages;
mod routes;
mod sources;
mod storage;
mod storage_worker;

use controller::HostState;
use genesis_contracts::{HostCommand, HostEvent};
use jni::{
    EnvUnowned,
    objects::{JClass, JString},
};
use std::{
    cell::RefCell,
    panic::{AssertUnwindSafe, catch_unwind},
};

// All calls originate on the Activity UI thread. No Java references are retained.
thread_local! {
    static HOST: RefCell<HostState> = RefCell::new(HostState::default());
    static ISOLATED: RefCell<Option<isolated::IsolatedHost>> = const { RefCell::new(None) };
}

fn dispatch(input: &str) -> String {
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let raw: serde_json::Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
        if raw["type"] == "attach" {
            let enabled = raw["index"]["packages"].as_array().is_some_and(|p| p.iter().any(|p| matches!(p["manifest"]["schemaVersion"].as_u64(),Some(2|3))));
            ISOLATED.with(|host| *host.borrow_mut() = enabled.then(isolated::IsolatedHost::default));
        }
        if let Some(result) = ISOLATED.with(|host| host.borrow_mut().as_mut().map(|h| h.dispatch(raw))) {
            return result.and_then(|commands| serde_json::to_string(&commands).map_err(|e| e.to_string()));
        }
        let event: HostEvent = serde_json::from_str(input).map_err(|e| e.to_string())?;
        HOST.with(|host| host.borrow_mut().dispatch(event)).and_then(|commands| serde_json::to_string(&commands).map_err(|e| e.to_string()))
    }));
    let commands = match outcome {
        Ok(Ok(encoded)) => return encoded,
        Ok(Err(message)) => vec![HostCommand::ShowError { message }],
        Err(_) => vec![HostCommand::ShowError {
            message: "Native host failed. Return Home or restart Genesis.".into(),
        }],
    };
    serde_json::to_string(&commands).unwrap_or_else(|_| {
        "[{\"type\":\"showError\",\"message\":\"Native response encoding failed\"}]".into()
    })
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_app_nirvana_genesis_NativeBridge_dispatch<'local>(
    mut unowned: EnvUnowned<'local>,
    _class: JClass<'local>,
    event: JString<'local>,
) -> JString<'local> {
    unowned
        .with_env(|env| -> jni::errors::Result<_> {
            JString::from_str(env, dispatch(&event.to_string()))
        })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_app_nirvana_genesis_NativeBridge_configureStorage<'local>(
    mut unowned: EnvUnowned<'local>,
    class: JClass<'local>,
    directory: JString<'local>,
) -> JString<'local> {
    unowned
        .with_env(|env| -> jni::errors::Result<_> {
            let result = catch_unwind(AssertUnwindSafe(|| -> Result<(), String> {
                if storage_worker::initialized() {
                    return Ok(());
                }
                let path = std::path::PathBuf::from(directory.to_string()).join("genesis.sqlite3");
                let vm = env.get_java_vm().map_err(|e| e.to_string())?;
                let callback = env.new_global_ref(&class).map_err(|e| e.to_string())?;
                storage_worker::start(path, vm, callback)
            }));
            let message = match result {
                Ok(Ok(())) => "ok".into(),
                Ok(Err(e)) => e,
                Err(_) => "Storage initialization failed".into(),
            };
            JString::from_str(env, message)
        })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_nirvana_genesis_NativeBridge_enqueueStorage<'local>(
    mut unowned: EnvUnowned<'local>,
    _class: JClass<'local>,
    value: JString<'local>,
) -> jni::sys::jboolean {
    unowned
        .with_env(|_env| -> jni::errors::Result<_> {
            Ok(catch_unwind(AssertUnwindSafe(|| {
                serde_json::from_str::<genesis_contracts::StorageJob>(&value.to_string())
                    .ok()
                    .filter(|job| storage::validate(&job.operation).is_ok())
                    .is_some_and(storage_worker::submit)
            }))
            .unwrap_or(false))
        })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

/// Package policy is validated independently from creator-side tooling.
#[unsafe(no_mangle)]
pub extern "system" fn Java_app_nirvana_genesis_NativeBridge_validateBundle<'local>(
    mut unowned: EnvUnowned<'local>,
    _class: JClass<'local>,
    value: JString<'local>,
) -> JString<'local> {
    unowned
        .with_env(|env| -> jni::errors::Result<_> {
            let result = catch_unwind(AssertUnwindSafe(|| -> Result<(), String> {
                let input = value.to_string();
                if input.len() > 1024 * 1024 {
                    return Err("Bundle metadata exceeds 1 MiB".into());
                }
                let bundle = serde_json::from_str::<genesis_contracts::AppletBundle>(&input)
                    .map_err(|_| "Invalid bundle metadata".to_owned())?;
                packages::validate_bundle(&bundle)
            }));
            let message = match result {
                Ok(Ok(())) => "ok".to_owned(),
                Ok(Err(error)) => error,
                Err(_) => "Package validation failed".to_owned(),
            };
            JString::from_str(env, message)
        })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}
