# Genesis

Genesis lets people build custom applications over running websites. The application should feel native while the browser underneath preserves website behavior and sessions. An applet can adapt one website or combine several websites into a shared workflow.

There are two development layers:

| Layer | Owns | Start here |
| --- | --- | --- |
| Genesis platform | Android browser integration and native shell, Rust lifecycle/policy, general SDK capabilities, package and creator tooling | [Root AGENTS.md](AGENTS.md), [architecture](.developer/architecture/README.md), [phase-5 maintenance](.developer/docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md) |
| Applets | Website adapters, custom UI, application rules/data, optional independently operated backends | [Factory](factory/README.md), [factory AGENTS.md](factory/AGENTS.md), [builder skills](factory/skills/README.md) |

A Genesis developer may work in either layer. Follow the instructions for the layer being changed. An applet author should use public SDK capabilities and their own code; they should not need to learn the host implementation to add application behavior.

## Repository map

- `android/app/`: active Java WebView/native integration under `app/nirvana/genesis`; preserved Kotlin starter code is inactive.
- `android/native/`: Rust controller, package validation, generic local documents, and JNI.
- `crates/contracts/`: host transport and package types. `crates/page-runtime/` is preserved inactive Wasm work.
- `packages/sdk/`: platform-owned SDK with built JavaScript/types and optional React helper.
- `packages/applet-tools/`: standalone creator CLI, manifest validation, bundling, development installation, templates, and kit export.
- `tools/`: current package/APK build and development service tooling.
- `factory/applets/`: current applet source, including optional applet-owned backends.
- `factory/`: applet author instructions, portable guides, and skills. Example applets live under `factory/applets/`.
- `.developer/architecture/`: current platform boundaries and an explicitly labeled HN reference application. Phase-specific operations, plans, and change records follow root instructions.

## Running local applet servers

Start the applet backends before using features that depend on them. HN bookmarks/categories and X's private Categories library need their separate servers; opening Genesis does not start them. After restarting your computer, restart the servers. After restarting or reconnecting Android, restore its adb tunnels too.

Use Node 24, installed workspace dependencies and OpenSSL. Device connection also requires an authorized adb device, a compatible Genesis debug host and the applets installed in it. Run these commands from the repository root.

```sh
# Start every applet's local backend in the background.
./factory/start-applet-servers.sh

# Start backends and restore Android tunnels/service connections.
# Replace emulator-5554 with your device's serial from adb devices.
./factory/start-applet-servers.sh --device emulator-5554

# Stop all managed backends, preserving data and credentials.
./factory/start-applet-servers.sh --stop
```

Use the device command after a reboot to make backend features reachable from Genesis. Save unsaved app work first: provisioning service connections restarts Genesis. Servers continue running after the launcher exits or the terminal closes. Repeated starts reuse healthy managed processes. To restart them, run the stop command followed by the appropriate start command.

To operate one applet instead:

```sh
./factory/applets/news.ycombinator.com/start.sh --device emulator-5554
./factory/applets/news.ycombinator.com/start.sh --stop

./factory/applets/x.com/start.sh --device emulator-5554
./factory/applets/x.com/start.sh --stop
```

Omit `--device emulator-5554` to start only the computer-side backend. HN uses port 8787 and X uses 8788. YouTube currently requires no backend, and its script does not activate or install the inactive prototype. Port reservations for current and future servers live in [factory/ports.json](factory/ports.json).

SQLite is built into Node; no separate database server is needed for these applets. Existing databases, tokens, TLS files and `server.log` files are preserved under `~/.local/share/genesis/services/<applet-id>/<service-id>/`. If you previously set `GENESIS_SERVICE_STATE_ROOT`, keep using that value to access the same data. On X's first database creation only, prefix startup with `X_EXPECTED_HANDLE=your_handle`; an existing library retains its stored account.

If startup fails, read the named service's private `server.log`, check adb authorization/connectivity in device mode, and check for occupied ports. The launcher reports failures and leaves successful servers running. It does not silently change ports or delete data. Process status alone does not prove Android connectivity.

```sh
# Validate port reservations and declarations without starting services.
node factory/scripts/applet-servers.mjs all --check

# Inspect recorded process status without starting a backend.
npx --no-install genesis-applet service status factory/applets/news.ycombinator.com --local --json
npx --no-install genesis-applet service status factory/applets/x.com --local --json
```

These startup scripts are operator commands. Coding agents maintain and statically check them, but must not run services unless explicitly asked. See [services and data](factory/guides/services-and-data.md#local-startup-and-port-assignments) for additional configuration and the contract for future applets with multiple servers or storage dependencies.

## Current phase-5 state

HN and X use mandatory schema-2 route inventories, hidden website adapters and a separate owned foreground. Native opaque rendering, source mute/accessibility/focus suppression, explicit website views, draft departure guards and renderer recovery keep original website DOM out of the customized layout. SDK/tools 0.4.0 and runtime API 3 are the supported authoring contract. New vanilla/React starters and the portable factory kit follow it.

Stable applet identities, website cookies, native sections and backend records are preserved. HN remains selected for APK bundling; X remains development-installed in the existing debug host. This preserves the migration plan's distribution scope. A clean release APK does not implicitly include X. YouTube remains inactive. Production publisher trust/distribution, arbitrary background servers and camera/microphone support remain separate work.

Source adapters publish bounded validated data and perform only revalidated read/navigation commands. Foregrounds own application UI, records/services and explicit website presentation. Website forms/social mutations and protected media keep their original session and controls in the provider. No process-death form restoration or POST replay is promised. Existing HN Search remains its documented placeholder.

The emulator migration checks cover real HN/X browsing, account-observed Categories, save/read-back/cleanup, internal/external return paths, media/notification variants, failed refresh, draft Stay/Leave and renderer recovery. Exact builds and unverified boundaries are recorded in the [final acceptance report](.developer/reports/phase-5/2026-10-31/231100-genesis-isolated-applets-verification.md); historical reports qualify only their recorded environments.

Use [current maintenance](.developer/docs/phase-5/2026-10-31/194740-genesis-isolated-applet-maintenance.md), [architecture](.developer/architecture/README.md), [the implementation plan](.developer/plans/phase-5/2026-10-31/171848-genesis-isolated-applet-architecture-plan.md) and [factory getting started](factory/guides/getting-started.md). Earlier phase-3/4 plans/guides are background where superseded by this API-3 contract.

Applet navigation coverage and website handoffs are described in [the factory navigation guide](factory/guides/navigation.md). New applets use schema 3/API 4 with SDK/tools 0.5.0; the host retains API-3 compatibility.
