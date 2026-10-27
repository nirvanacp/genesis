mod controller;
mod packages;
mod sources;

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
thread_local! { static HOST: RefCell<HostState> = RefCell::new(HostState::default()); }

fn dispatch(input: &str) -> String {
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        let event: HostEvent = serde_json::from_str(input).map_err(|e| e.to_string())?;
        HOST.with(|host| host.borrow_mut().dispatch(event))
    }));
    let commands = match outcome {
        Ok(Ok(commands)) => commands,
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
