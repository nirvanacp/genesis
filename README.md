# Genesis

Genesis is an Android app that runs user-built applets. An applet is a native-feeling React UI over one or more live website sessions: hidden WebViews load the real websites, typed adapters publish data from them, and the applet owns the screens, data and rules. Website sign-in, cookies and protected flows stay with the website, which opens in a sheet when needed.

There are two kinds of work:

| Layer | Owns | Start here |
| --- | --- | --- |
| Genesis platform | The Android shell, the Rust host, the shared packages, build tooling and builder guidance | [AGENTS.md](AGENTS.md) |
| Applets | Website adapters, screens, application rules, stored data and optional backends | [factory/AGENTS.md](factory/AGENTS.md), [factory README](factory/README.md), [getting started](factory/guides/getting-started.md) |

An applet author uses the public SDK and their own code, and does not need to learn the host implementation.

## Repository map

| Path | Contents |
| --- | --- |
| `android/app/` | Java shell: activity, launcher, WebViews, website sheet, native Genesis menu, service HTTPS client |
| `android/native/` | Rust host `genesis-host`: applets, documents, RPC, storage, services, surfaces, imports (`libgenesis_host.so`) |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, bundle types, limits, error codes |
| `packages/core/` | `@genesis/core`: manifest validation, route matching, navigation state machine, bundle format, error codes |
| `packages/sdk/` | `@genesis/sdk`: bridge, foreground runtime and React hooks, source runtime and driver |
| `packages/applet-tools/` | `genesis-applet` CLI: create, check, build, device install, services, kit export |
| `tools/` | APK asset and native build pipeline, package index check, service helpers |
| `factory/` | Applet-builder instructions, guides, skills and templates |
| `examples/` | Example applets (`news.ycombinator.com`, `x.com`), their port registry and backend launcher |
| `genesis.packages.json` | Applets bundled into the APK |

## Build and run

Requirements: Node 24, Cargo 1.94.0 with `cargo-ndk` 4.1.2, the Android SDK with NDK 28.2.13676358 and `ANDROID_HOME` set, and OpenSSL for the example backends. `tools/build.mjs` checks these versions and names the install command for a missing one. From the repository root:

```sh
npm install
npm run typecheck
npm run build

# Build the APK, including the native library and bundled applets, and install it.
android/gradlew -p android :app:installDebug

# Build an applet and install it on a connected device without reinstalling the APK.
node packages/applet-tools/src/cli.mjs check examples/x.com
node packages/applet-tools/src/cli.mjs build examples/x.com
node packages/applet-tools/src/cli.mjs dev install examples/x.com --device emulator-5554
```

`dev install` sends the last build, so run `build` first. Hacker News is bundled into the APK through `genesis.packages.json`; X is installed with `dev install`.

## Running local applet servers

Start the applet backends before using features that depend on them. HN's Saved library and X's Categories need their own servers; opening Genesis does not start them. After restarting your computer, restart the servers. After restarting or reconnecting Android, restore its adb tunnels too.

Use Node 24, installed workspace dependencies and OpenSSL. Device connection also requires an authorized adb device, a Genesis debug build and the applets installed in it. Run these commands from the repository root.

```sh
# Start every applet's local backend in the background.
./examples/start-applet-servers.sh

# Start backends and restore Android tunnels and service connections.
# Replace emulator-5554 with your device's serial from adb devices.
./examples/start-applet-servers.sh --device emulator-5554

# Stop all managed backends, preserving data and credentials.
./examples/start-applet-servers.sh --stop
```

Use the device command after a reboot to make backend features reachable from Genesis. Servers keep running after the launcher exits or the terminal closes. Repeated starts reuse healthy managed processes. To restart them, run the stop command followed by the appropriate start command.

To operate one applet instead:

```sh
./examples/news.ycombinator.com/start.sh --device emulator-5554
./examples/news.ycombinator.com/start.sh --stop

./examples/x.com/start.sh --device emulator-5554
./examples/x.com/start.sh --stop
```

Omit `--device emulator-5554` to start only the computer-side backend. HN uses port 8787 and X uses 8788. Port reservations live in [examples/ports.json](examples/ports.json).

SQLite is built into Node; no separate database server is needed. Existing databases, tokens, TLS files and `server.log` files are preserved under `~/.local/share/genesis/services/<applet-id>/<service-id>/`. If you previously set `GENESIS_SERVICE_STATE_ROOT`, keep using that value to reach the same data. On X's first database creation only, prefix startup with `X_EXPECTED_HANDLE=your_handle`; an existing library keeps its stored account.

If startup fails, read the named service's private `server.log`, check adb authorization and connectivity in device mode, and check for occupied ports. The launcher reports failures and leaves successful servers running. It does not silently change ports or delete data. Process status alone does not prove Android connectivity.

```sh
# Validate port reservations and declarations without starting services.
node examples/scripts/applet-servers.mjs all --check

# Inspect recorded process status without starting a backend.
npx --no-install genesis-applet service status examples/news.ycombinator.com --local --json
npx --no-install genesis-applet service status examples/x.com --local --json
```

These startup scripts are operator commands. Coding agents maintain and check them, but do not run services unless asked. See [services and data](factory/guides/services-and-data.md#local-startup-and-ports) for configuration and the contract for applets with several servers.

## Current state

One runtime: manifest schema 5, bundle format 2, and `@genesis/sdk` and `genesis-applet` 1.0.0. Each applet has a React foreground, up to three hidden source WebViews with typed adapters, declared intents for website actions, host storage and optional pinned HTTPS services. The Hacker News and X examples are rebuilt on it and checked on an Android emulator; website writes, several routes and physical phones are not yet verified on this runtime. Production publishing, release signing and backends reachable without a computer are separate work.
