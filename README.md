# Genesis

Genesis is an Android app that runs user-built applets. An applet is a native-feeling React UI over one or more live website sessions: each context is a WebView that loads the real website and keeps its history, an adapter in the page publishes what the page shows as keyed records and actions, and the applet owns the screens, data and rules. Pages the applet does not customize, sign-in, cookies and protected flows stay with the website, which appears in place in the same session when needed.

There are two kinds of work:

| Layer | Owns | Start here |
| --- | --- | --- |
| Genesis platform | The Android shell, the Rust host, the shared packages, build tooling and builder guidance | [AGENTS.md](AGENTS.md) |
| Applets | Website adapters, screens, application rules, stored data and optional backends | [factory/AGENTS.md](factory/AGENTS.md), [factory README](factory/README.md), [getting started](factory/guides/getting-started.md) |

An applet author uses the public SDK and their own code, and does not need to learn the host implementation.

## Repository map

| Path | Contents |
| --- | --- |
| `android/app/` | Java shell: activity, launcher, context WebViews, website bar, native Genesis menu, service HTTPS client |
| `android/native/` | Rust host `genesis-host`: applets, contexts, documents, RPC, storage, services, compatibility, imports (`libgenesis_host.so`) |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, bundle types, limits, error codes |
| `packages/core/` | `@genesis/core`: manifest validation, route matching, presentation coordinator, compatibility table, protocol types, bundle format, error codes |
| `packages/sdk/` | `@genesis/sdk`: bridge, foreground runtime, record store and React hooks, adapter runtime |
| `packages/applet-tools/` | `genesis-applet` CLI: create, check (including compatibility), build, device install, services, kit export |
| `tools/` | APK asset and native build pipeline, package index check, service helpers |
| `factory/` | Applet-builder instructions, guides, skills and templates |
| `applets/` | The applets directory: a separate repository ([nirvanacp/applets](https://github.com/nirvanacp/applets)) with the `hn-bookmarks`, `x-bookmarks` and `gmail-only` applets, their port registry and backend launcher. Not tracked here |
| `genesis.workspace.json` | Where the workspace's parts live: the applets directory and the repository it is cloned from |
| `genesis.packages.json` | Applets bundled into the APK, named by their directory in the applets directory |

## Build and run

Requirements: Node 24, Cargo 1.94.0 with `cargo-ndk` 4.1.2, the Android SDK with NDK 28.2.13676358 and `ANDROID_HOME` set, and OpenSSL for the example backends. `tools/build.mjs` checks these versions and names the install command for a missing one. From the repository root:

```sh
npm run workspace -- setup   # clone the applets repository into the configured directory
npm install
npm run typecheck
npm run build

# Build the APK, including the native library and bundled applets, and install it.
android/gradlew -p android :app:installDebug

# Build an applet and install it on a connected device without reinstalling the APK.
node packages/applet-tools/src/cli.mjs check applets/x-bookmarks
node packages/applet-tools/src/cli.mjs build applets/x-bookmarks
node packages/applet-tools/src/cli.mjs dev install applets/x-bookmarks --device emulator-5554
```

`dev install` sends the last build, so run `build` first. Hacker News is bundled into the APK through `genesis.packages.json`; X is installed with `dev install`. Release builds refuse `dev install`: they bundle each applet's published release, and users add other applets with **Add applet** in the launcher's Genesis menu, from a public GitHub repository or a downloaded bundle file. Genesis reviews every build before installing it and offers updates from the same source. [Publishing](factory/guides/publishing.md) covers versions, tags and the CI workflows that publish a release.

An entry in `genesis.packages.json` can be an object, `{ "id": "hn-bookmarks", "drawer": true }`, to give that bundled applet its own entry in the Android app drawer. The entry shows the applet's name over its accent color, with the icon its manifest names as `shell.icon`; an applet without an icon gets no entry. The entry appears once the applet is installed and runs on this device. Before shipping a build to a store, check that each icon is original artwork and that each name does not claim to be the website's own app.

## Applets directory

The applets live in their own repository, outside this one's history. `genesis.workspace.json` says where:

```json
{ "applets": { "directory": "applets", "repository": "git@github.com:nirvanacp/applets.git" } }
```

`directory` is relative to the repository root or absolute. Name each applet's directory after its applet id, a short product name such as `hn-bookmarks` rather than a website domain, since one applet can span several websites. The root installs every applet's dependencies through the npm workspace `applets/*`, so all of them share one `node_modules` and one React. `npm run workspace -- <command>` keeps the checkout in line with the config:

| Command | What it does |
| --- | --- |
| `path` | Prints the applets directory |
| `setup` | Clones `repository` into `directory` when it is missing, then runs `sync` |
| `sync` | When `directory` is not `applets`, links `applets/` to it; when it is outside the repository, also links its `node_modules` to the root install |
| `check` | Fails with the repairing command when the checkout differs from the config. `npm run check:packages` runs it too |

Run `npm install` after `setup`. The Gradle build, `tools/check-packages.mjs` and `genesis.packages.json` all read the configured directory. Inside the repository, the applets directory is a nested repository, so new worktrees get their own copy of it on the same branch name (see `AGENTS.md`); an applets directory outside the repository is shared by every worktree.

## Running local applet servers

Start the applet backends before using features that depend on them. HN's Saved library and X's Categories need their own servers; opening Genesis does not start them. After restarting your computer, restart the servers. After restarting or reconnecting Android, restore its adb tunnels too.

Use Node 24, installed workspace dependencies and OpenSSL. Device connection also requires an authorized adb device, a Genesis debug build and the applets installed in it. Run these commands from the applets directory.

```sh
# Start every applet's local backend in the background.
./start-applet-servers.sh

# Start backends and restore Android tunnels and service connections.
# Replace emulator-5554 with your device's serial from adb devices.
./start-applet-servers.sh --device emulator-5554

# Stop all managed backends, preserving data and credentials.
./start-applet-servers.sh --stop
```

Use the device command after a reboot to make backend features reachable from Genesis. Servers keep running after the launcher exits or the terminal closes. Repeated starts reuse healthy managed processes. To restart them, run the stop command followed by the appropriate start command.

To operate one applet instead:

```sh
./hn-bookmarks/start.sh --device emulator-5554
./hn-bookmarks/start.sh --stop

./x-bookmarks/start.sh --device emulator-5554
./x-bookmarks/start.sh --stop
```

Omit `--device emulator-5554` to start only the computer-side backend. HN uses port 8787 and X uses 8788. Port reservations live in the applets directory's `ports.json`.

SQLite is built into Node; no separate database server is needed. Existing databases, tokens, TLS files and `server.log` files are preserved under `~/.local/share/genesis/services/<applet-id>/<service-id>/`. If you previously set `GENESIS_SERVICE_STATE_ROOT`, keep using that value to reach the same data. On X's first database creation only, prefix startup with `X_EXPECTED_HANDLE=your_handle`; an existing library keeps its stored account.

If startup fails, read the named service's private `server.log`, check adb authorization and connectivity in device mode, and check for occupied ports. The launcher reports failures and leaves successful servers running. It does not silently change ports or delete data. Process status alone does not prove Android connectivity.

```sh
# Validate port reservations and declarations without starting services.
./start-applet-servers.sh --check

# Inspect recorded process status without starting a backend.
npx --no-install genesis-applet service status hn-bookmarks --local --json
npx --no-install genesis-applet service status x-bookmarks --local --json
```

These startup scripts are operator commands. Coding agents maintain and check them, but do not run services unless asked. See [services and data](factory/guides/services-and-data.md#local-startup-and-ports) for configuration and the contract for applets with several servers.

## Current state

One runtime: manifest schema 6, bundle format 3, document protocol 1, adapter API 1, and `@genesis/sdk` and `genesis-applet` 0.0.0. Each applet has a React foreground, one or more website contexts with their own history, an adapter that publishes regions of keyed records and desired-state actions from each page it knows, host storage and optional pinned HTTPS services. Genesis checks every applet against its compatibility table and marks an applet built for another version as needing an update. The Hacker News and X examples are rebuilt on it and checked on an Android emulator; physical phones and several website writes are not yet verified on this runtime. Production publishing, release signing and backends reachable without a computer are separate work.
