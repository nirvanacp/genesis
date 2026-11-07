use crate::storage::{Database, StorageError, completion};
use genesis_contracts::{ErrorCode, StorageJob};
use jni::{
    JavaVM, jni_sig, jni_str,
    objects::{Global, JClass, JString, JValue},
};
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    path::PathBuf,
    sync::{
        OnceLock,
        mpsc::{SyncSender, sync_channel},
    },
};

// Process lifetime. The worker owns only a VM handle and the bridge class, never an Activity.
static JOBS: OnceLock<SyncSender<StorageJob>> = OnceLock::new();
pub fn initialized() -> bool {
    JOBS.get().is_some()
}
pub fn start(
    path: PathBuf,
    vm: JavaVM,
    callback: Global<JClass<'static>>,
) -> std::result::Result<(), String> {
    if initialized() {
        return Ok(());
    }
    let (sender, receiver) = sync_channel::<StorageJob>(64);
    std::thread::Builder::new()
        .name("genesis-sqlite".into())
        .spawn(move || {
            let mut database = None;
            for job in receiver {
                let result = catch_unwind(AssertUnwindSafe(|| {
                    if database.is_none() {
                        database = Some(Database::open(&path)?);
                    }
                    database.as_mut().expect("initialized database").execute(
                        &job.applet_id,
                        1,
                        &job.operation,
                    )
                }))
                .unwrap_or_else(|_| {
                    Err(StorageError {
                        code: ErrorCode::StorageFailure,
                        message: "Storage worker failed; reread before retrying".into(),
                    })
                });
                let completion = completion(&job, result);
                if let Ok(encoded) = serde_json::to_string(&completion) {
                    let _ = vm.attach_current_thread(|env| -> jni::errors::Result<()> {
                        let value = JString::from_str(env, encoded)?;
                        env.call_static_method(
                            &*callback,
                            jni_str!("onStorageResult"),
                            jni_sig!("(Ljava/lang/String;)V"),
                            &[JValue::Object(value.as_ref())],
                        )?;
                        Ok(())
                    });
                }
            }
            // Receiver shutdown releases the connection and cached global class reference.
        })
        .map_err(|e| e.to_string())?;
    JOBS.set(sender)
        .map_err(|_| "Storage worker already configured".into())
}
pub fn submit(job: StorageJob) -> bool {
    JOBS.get().is_some_and(|q| q.try_send(job).is_ok())
}
