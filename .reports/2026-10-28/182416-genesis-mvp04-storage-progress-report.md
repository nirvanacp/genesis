# Genesis MVP-04 storage progress

MVP-04 is implemented but remains `in_progress`. Native storage, SDK calls and Android packaging pass the checks below. Actual Android browser-to-storage, update/restart retention and offline local-page checks remain unverified because desktop coordinate control was lost again. MVP-05 must wait for those gates.

MVP-02 and MVP-03 passed the supported emulator gate in the [HN qualification report](174427-genesis-hn-typescript-qualification-report.md) and [managed runtime report](180813-genesis-mvp03-managed-runtime-report.md). Physical qualification remains required before release in MVP-07.

## Implemented components

- Generic namespace/document SQLite schema and platform `user_version`, stored at the application's private `files/genesis.sqlite3`. Profile is `local`; applet identity comes from the verified host binding.
- `get`, key-ordered `list`, and atomic `commit` with every modified key checked, optional read-only checks, transaction rollback, namespace revisions and post-commit acknowledgement.
- Limits of 32 KiB per JSON document, 512 UTF-8 bytes per key, 100 list entries, bounded encoded replies, 64 modifications and 256 KiB per batch. Extra read-only checks are capped at 128. Incompatible schemas preserve data and return an error.
- One Rust SQLite worker with a nonblocking 64-job input queue. The worker retains the VM handle and cached bridge class for process lifetime. It retains no Activity or local JNI reference across calls. Java posts bounded completions to its main Handler and holds the Activity through a weak reference.
- Document-bound replies and applet-scoped `storage.changed` notifications. Completed writes survive document retirement; old request replies cannot reach a replacement document.
- Typed SDK storage methods and managed change subscriptions. No website-specific record fields or category operations entered native SQL.

Reused components include the current nonce/document binding, RPC transport and limits, generic Java command executor, package build, local-page loader, single-view lifecycle and persistent WebView profile. Authentication and browser cookies remain separate. The inactive applets remain untouched.

## Verification commands and outcomes

| Command/check | Result |
| --- | --- |
| `cargo fetch --manifest-path android/native/Cargo.toml` | Resolved pinned rusqlite 0.41.0 with bundled SQLite; lock committed |
| `cargo fmt --all -- --check` | Passed |
| `cargo clippy -p genesis-android --locked -- -D warnings` | Passed |
| `cargo build -p genesis-android --locked` | Passed for host JNI verification |
| `npm run typecheck` | Passed all workspaces |
| `npm run check:packages` | Passed HN package |
| `./gradlew :app:assembleDebug :app:lintDebug --console=plain`, configured JDK 17, from `android/` | Passed, final normal-entry build in 8 seconds, both native ABIs |
| Temporary stdin Rust check against actual storage module | Passed CRUD, CAS conflict/rollback, fresh deletion/recreation revisions, ordered and size-bounded pagination, byte limits, namespace isolation, schema preservation and reopen persistence |
| Temporary stdin Rust check against actual controller | Passed host-derived namespace, current reply delivery, stale reply rejection, current-context notifications and cross-applet isolation |
| Temporary host Java bridge with `java -Xcheck:jni` and actual native dylib | Passed worker thread attachment/cached-class callback, 64 queued jobs, immediate rejection of the next enqueue, commit/read and CAS conflict |
| Python APK/hash inspection | MVP-04 index, all asset hashes match, both native ABIs, no temporary probes |
| `adb install -r` and `am start` | Final normal APK installed/started; no uninstall or data clearing |
| `git diff --check` | Passed |

The temporary checks live under `/tmp`. No repository automated test file was added. A temporary source/local-page probe APK was built, but emulator clicks failed before its CRUD controls ran. Both normal entries were restored, rebuilt, inspected and reinstalled before this handoff. Do not confuse the host JVM probe with Android WebView end-to-end evidence.

## Remaining gates and next action

The emulator still uses Google WebView 156.0.8078.47. Android Studio's screenshot/accessibility state is readable, while coordinate actions again return `noWindowsAvailable`. The user has been asked to foreground Running Devices outside IDE full-screen mode. This is the current blocker, separate from authentication or provider compatibility.

Resume the temporary storage probe after restoring UI control. Verify source CRUD/conflict/change notification, local-page access to the same namespace, a committed marker after process restart and `install -r`, and local-page reopening without network. Then restore normal entries and finish the MVP-04 report. Only then start MVP-05 HN extraction/Save, followed by MVP-06 categories/offline library and MVP-07 integration/hardware qualification.

The final normal APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It still has qualification-only HN UI. The MVP is not ready for release. Existing untracked Android Studio `.idea` files were present at session start and remain uncommitted.
