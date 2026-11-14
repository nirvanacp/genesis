mod applets;
mod compat;
mod contexts;
mod dialogs;
mod documents;
mod fetch;
mod flows;
mod github;
mod host;
mod imports;
mod rpc;
mod semver;
mod services;
mod source;
mod storage;
mod storage_worker;

use genesis_contracts::{ShellCommand, ShellEvent};
use host::Host;
use jni::{
    EnvUnowned,
    objects::{JClass, JString},
};
use std::{
    cell::RefCell,
    panic::{AssertUnwindSafe, catch_unwind},
};

// All dispatch calls originate on the Activity UI thread. No Java references are retained.
thread_local! {
    static HOST: RefCell<Host> = RefCell::new(Host::default());
}

fn dispatch(input: &str) -> String {
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let event: ShellEvent = serde_json::from_str(input).map_err(|e| format!("Invalid shell event: {e}"))?;
        HOST.with(|host| host.borrow_mut().dispatch(event))
    }));
    let commands = match outcome {
        Ok(Ok(commands)) => commands,
        Ok(Err(message)) => vec![ShellCommand::ShowError { applet_id: None, message }],
        Err(_) => {
            // A panic may leave the host half-updated: start over, attached to the same files.
            HOST.with(|host| {
                let mut host = host.borrow_mut();
                let attach = host.files_dir.as_ref().map(|dir| ShellEvent::Attach {
                    files_dir: dir.to_string_lossy().into_owned(),
                    debuggable: host.debuggable,
                });
                *host = Host::default();
                if let Some(attach) = attach {
                    let _ = catch_unwind(AssertUnwindSafe(|| host.dispatch(attach)));
                }
            });
            vec![ShellCommand::ShowError { applet_id: None, message: "Native host failed. Restart Genesis.".into() }]
        }
    };
    serde_json::to_string(&commands)
        .unwrap_or_else(|_| "[{\"type\":\"showError\",\"message\":\"Native response encoding failed\"}]".into())
}

#[unsafe(no_mangle)]
pub extern "system" fn Java_app_nirvana_genesis_NativeBridge_dispatch<'local>(
    mut unowned: EnvUnowned<'local>,
    _class: JClass<'local>,
    event: JString<'local>,
) -> JString<'local> {
    unowned
        .with_env(|env| -> jni::errors::Result<_> { JString::from_str(env, dispatch(&event.to_string())) })
        .resolve::<jni::errors::ThrowRuntimeExAndDefault>()
}

/// Starts the storage worker once per process. Returns "ok" or an error message.
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
