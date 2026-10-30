# Genesis X development guide

Scope: phase-4 Genesis platform plus `factory/applets/x.com`. SDK/tools 0.3.0, runtime API 2, manifest/data/bundle schema 1. X is debug-installed and its local category service is provisioned on `emulator-5554`. It is not enabled in the default APK selection because authenticated device qualification is incomplete. The [verification report](../../../.reports/phase-4/2026-10-30/211400-genesis-x-android-verification.md) separates observed behavior from remaining work.

## Build and install

Use the repository's pinned Node 24.15.0/npm 11.14.1 and existing Android/Rust toolchains. From repository root:

```sh
npm run typecheck
npm run check:packages
node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json
node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /private/tmp/genesis-x-reviewed-bundle --json
node packages/applet-tools/src/cli.mjs dev install /private/tmp/genesis-x-reviewed-bundle --device emulator-5554 --replace --json
```

Use a fresh build destination. `--replace` updates an existing dev revision and preserves cookies/data; it does not prove rendering or backend readiness. Do not uninstall or clear the host. To rebuild the Android host, run `./gradlew :app:assembleDebug :app:lintDebug` from `android/`; install the resulting debug APK with `adb install -r`, preserving identity/data. The existing selection keeps HN bundled.

## Category backend

From `factory/applets/x.com`, start/provision the separate local service using the public helper:

```sh
X_EXPECTED_HANDLE=<your-handle> npx --no-install genesis-applet service start . --device emulator-5554 --json
npx --no-install genesis-applet service status . --device emulator-5554 --json
```

The expected handle initializes an empty library; changing it later requires deliberate operator migration rather than an environment override. The helper generates private HTTPS/token configuration outside the checkout and sets up the device tunnel. Provisioning may restart the host. Process status alone does not prove end-to-end readiness. Stop through the matching `service stop` command when development finishes. Do not copy its credential files, token, database or logs into artifacts. X passwords and website cookies are never backend credentials.

For a manually hosted server, provide `X_BACKEND_DB`, `X_BACKEND_TOKEN`, and `X_EXPECTED_HANDLE` on first initialization to `backend/server.mjs`. A production deployment additionally needs trusted HTTPS, durable storage, backups and private host provisioning. The current service is one personal library, not a multi-user login system.

## Behavior and recovery

The X bookmark action keeps its upstream semantics. The separate folder action opens the private category editor; one post can have up to 10 categories. Saved switches between X bookmarks and Categories. Categories supports server search across the whole library, category filtering, cursor pagination, category creation/rename and empty-only deletion. Snapshots are captures, not a live media archive.

The packaged page verifies the visible signed-in profile through a one-use source ticket before displaying data. Unknown, mismatched or expired verification shows recovery rather than another account's library. Open X bookmarks and re-enter Categories after sign-in. A temporary X login limit must be allowed to expire; never bypass its challenge or repeatedly retry credentials.

Uncertain writes retain an operation ID. Use **Check or retry the same change** to read the receipt/retry the original in-memory payload. After a process restart, refresh state before explicitly abandoning an unconfirmed marker. A new operation ID is not an automatic retry. Backend/network failure leaves source browsing available.

## Qualification gate

Use Android Studio for UI interaction. Complete the plan's authenticated source, two-bookmark independence, Saved ownership/return, account-change, attachment, redirect, retention/process, keyboard, TalkBack, dark-mode and reduced-motion checks on a physical Android device as well as the recorded emulator. Do not submit posts/messages, change security settings or perform social actions merely to test. The separate **X UI preview** debug applet uses synthetic data and does not qualify X authentication/selectors.

Only after recording successful core acceptance should X be added alongside HN in `genesis.packages.json`, rebuilt and committed as an enablement step. Keep the authenticated failure and manual matrix visible until then. No permanent test files were added because project instructions require explicit authorization for test coverage.
