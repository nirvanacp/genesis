# Genesis

Genesis lets people build custom applications over running websites. The application should feel native while the browser underneath preserves website behavior and sessions. An applet can adapt one website or combine several websites into a shared workflow.

There are two development layers:

| Layer | Owns | Start here |
| --- | --- | --- |
| Genesis platform | Android browser integration and native shell, Rust lifecycle/policy, general SDK capabilities, package and creator tooling | [Root AGENTS.md](AGENTS.md), [architecture](.architecture/README.md), [phase-3 maintenance](.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md) |
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
- `.architecture/`: current platform boundaries and an explicitly labeled HN reference application. Phase-specific operations, plans, and change records follow root instructions.

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

## Phase-4 product direction

The intended delivery contains two everyday applications: Hacker News and one complete X client built over x.com. Website sections, owned pages, category storage and external readers belong within each applet. Verification packages must not appear as additional everyday apps. Follow the [two-app improvement plan](.plans/phase-4/2026-10-30/214048-genesis-two-complete-applets-plan.md). The current package-selection gap below is unfinished work, not the product definition.

## Current state

Only HN is bundled. Its frontend is under `factory/applets/news.ycombinator.com/src`; its separate Node/SQLite service is under `factory/applets/news.ycombinator.com/backend`. Bookmarks/categories are authoritative on that service. Generic host storage holds public account coordination and Post drafts; existing legacy bookmarks are preserved and never silently uploaded. The backend does not run inside Genesis.

SDK/tools `0.3.0` support managed DOM effects, owned React pages, source/page navigation, local documents, and declared HTTPS services. Sources can represent several websites and share applet records/pages. HN's three source entries represent sections of the same website. X has an implemented development applet with incomplete authenticated qualification; YouTube remains inactive.

The standalone `genesis-applet` CLI creates/checks/builds applets and installs/updates/rolls back code in a compatible prebuilt debug host over authorized adb. Applet authors need no native compiler or platform source. Maintainers distribute packed SDK/tools archives; they are not published to a public registry. Release builds use bundled packages only. Production publisher trust/distribution and coding-agent connectors remain future work. The [phase-3 plan](.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) records the component decisions and implementation progress.

The [29 October phone report](.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) records working HN flows on one Samsung phone/provider with a Mac-hosted HTTPS backend over adb reverse. It does not establish production distribution readiness or the full device/accessibility matrix. Release signing, production service provisioning, and broader qualification remain open.

Read [product intent](.notes/README.md) for the direction. For current phase-4 development, use the [X operating guide](.docs/phase-4/2026-10-30/210800-genesis-x-development-guide.md) and the controlling two-app plan. The earlier [phase-3 maintenance guide](.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md) supplies background tooling guidance or [applet getting started](factory/guides/getting-started.md), according to the task. Archived plans are historical, not specifications.
