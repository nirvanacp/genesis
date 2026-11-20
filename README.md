# Genesis

Genesis is an Android app that runs apps you build on top of the websites you already use.

You describe the app you want to a coding agent: "a Hacker News app with a saved library and categories", "Gmail, but every email can become a reminder". The agent writes an **applet**, a phone UI that reads the real website underneath, signed in as you, and acts on it. Screens you designed look and behave like a native app. Pages you didn't redesign show the website itself, in the same session and history, so nothing the website can do is lost.

Genesis is an alpha. It runs six example applets today, and expect breaking changes until the first stable release. See [download](#download) and [status](#status).

## Why

Many websites are hard to use on a phone. Some have no app, and the apps that exist rarely do exactly what you want. You can't build your own app for a website you don't own, because you have no access to its server API.

The website does give you one thing. Its pages already open in a browser, signed in as you, with all your data on screen, and a person can read that data and press those buttons. Genesis lets your own code do the same, then draws your screens over the result. The website keeps its sign-in, cookies, server rules and history. Your applet owns the screens, the extra data and the rules you asked for.

An applet can:

- show a website's pages as native screens, with tabs, loading skeletons, transitions and an Android Back button that works as expected;
- act on the website: vote, follow, post with photos, fill and submit forms, using the website's own requests and your session;
- add features the website doesn't have, such as categories for bookmarks, reminders on emails or search over saved items, with the data kept on the phone;
- combine several websites in one app;
- hand anything it doesn't customize back to the real website, including sign-in, captchas and settings.

## How it works

```
┌─────────────────────────────────────────────────────────┐
│ Applet UI: your web app, in any framework               │  visible
│ screens, application rules, stored records              │
└──────────────┬──────────────────────────────────────────┘
               │ watches, inputs, navigation  (@nirvanacp/sdk)
┌──────────────▼──────────────────────────────────────────┐
│ Genesis                                                 │
│ Rust host: routes every message, deadlines, limits,     │
│            storage, services                            │
│ Java shell: windows, WebViews, Back, menus, downloads   │
└──────┬─────────────────────┬───────────────────┬────────┘
       │                     │                   │
┌──────▼───────┐     ┌───────▼──────┐     ┌──────▼───────┐
│ Context      │     │ Context      │     │ Servelet     │
│ real website │ ... │ real website │     │ Go + SQLite  │
│ + page agent │     │ + page agent │     │ (WebAssembly)│
└──────────────┘     └──────────────┘     └──────────────┘
```

- **Contexts** are the live website sessions an applet declares, up to three. Each is an Android WebView (or GeckoView, chosen per applet) with its own history, loading the real website with your cookies. A context stays hidden while the applet shows its own screen for the page, and appears in place when it doesn't.
- **The page agent** is Genesis code that runs inside every page on the applet's declared origins, before the website's scripts. The UI asks it to read the page into keyed JSON records, either with a JSON read specification or with readers in the applet's own page module. A watch sends the records once, then only what changes. The page agent also runs inputs on the page: click, fill, type, select, submit and more. It refuses password, one-time-code and payment fields.
- **The applet UI** is a web app in its own WebView, built with any web framework. React bindings are included. For each page it decides whether to show its own screen or the website; the router helper makes that choice from a route table unless the applet sets its own rules.
- **The host** is a Rust core that every message passes through. It counts each page load as a separate document, so an answer from a page the user has already left is dropped instead of shown. It owns the applet's storage, the deadlines and the limits.
- **The shell** is the Android app in Java. It creates the windows and WebViews, the Genesis menu and the website bar, and handles Back, downloads, file uploads, permission prompts, sharing and notifications.
- **Servelets** are an applet's optional backend: a small Go service with its own SQLite database, compiled to WebAssembly and run by Genesis on the phone. There is no server to host and no account to create.

Website HTML never reaches the applet UI. The UI only sees the records a reader chose to extract. The website's own scripts never get Genesis's message channel, and page code can't reach the applet's storage or services.

## The projects

Genesis is split into four repositories that check out into one workspace.

| Project | Location in the workspace | What it is |
| --- | --- | --- |
| Genesis | this repository | The Android app: the Java shell, the Rust host, the servelet runtime and the APK build |
| [Let](https://github.com/nirvanacp/let) | `let/` | The framework applets and servelets are built with: `@nirvanacp/sdk`, `@nirvanacp/core`, the `let-applet` and `let-servelet` tools, the Go servelet library, and the instructions coding agents follow |
| [Applets](https://github.com/nirvanacp/applets) | `applets/` | Example applets, one directory each |
| [Servelets](https://github.com/nirvanacp/servelets) | `servelets/` | Example servelets used by those applets |

If you want to build an app, you only need the Let packages from npm and the Genesis developer build. You don't need this repository, and you don't need to read any Java or Rust.

## Download

Each release on the [releases page](https://github.com/nirvanacp/genesis/releases) holds:

| File | What it is |
| --- | --- |
| `genesis-<version>.apk` | The app, `app.nirvana.genesis` |
| `genesis-<version>-developer.apk` | Genesis Dev, `app.nirvana.genesis.dev`: the same app and bundled applets, debuggable, and it accepts development installs from the applet tools. It installs beside the app. Install it to build applets |
| `genesis-<version>.aab` | The Android App Bundle of the app, for app stores |
| `genesis-<version>-native-symbols.zip` | The unstripped native libraries, for reading crash reports |
| `SHA256SUMS` | The checksums of the files above |

Check the files you downloaded, then install over `adb` or by opening the APK on the phone:

```sh
shasum -a 256 --check --ignore-missing SHA256SUMS
gh attestation verify genesis-<version>.apk --repo nirvanacp/genesis
adb -s <serial> install genesis-<version>.apk
```

A version with a `-`, such as `0.1.0-alpha.1`, is published as a prerelease. Genesis runs on Android 8.0 (API 26) and later.

## Example applets

| Applet | Website | What it adds |
| --- | --- | --- |
| [Hacker News](https://github.com/nirvanacp/applets/tree/develop/hn-bookmarks) | news.ycombinator.com | Home, Search, Post, Saved and Me tabs, with a Saved library and categories stored in a servelet |
| [X](https://github.com/nirvanacp/applets/tree/develop/x-bookmarks) | x.com | Home, Explore, Notifications, Saved and Profile, a photo composer, and a private Categories library in a servelet |
| [Gmail Only](https://github.com/nirvanacp/applets/tree/develop/gmail-only) | mail.google.com | Turns emails into reminders and to-dos, with snoozes and "remind me if no reply", across several Google accounts |
| [Instagram](https://github.com/nirvanacp/applets/tree/develop/instagram) | instagram.com | Feed, stories tray, posts, comments, profiles, Explore, search, notifications and messages |
| [Spotify](https://github.com/nirvanacp/applets/tree/develop/spotify) | open.spotify.com | A native player frame over the web player: tabs, mini-player, Now Playing, albums, playlists, artists and search. In progress |
| [Discord](https://github.com/nirvanacp/applets/tree/develop/discord) | discord.com | Direct messages, servers, channels and chat in a phone UI over the signed-in Discord session |

## Build your own applet

Applets are built with [Let](https://github.com/nirvanacp/let), in any directory. You need Node 24.15.0, a device or emulator with the Genesis developer build ([download](#download)) reachable over `adb`, and Go 1.24 or later if your app needs a servelet. You don't need this repository.

```sh
npx @nirvanacp/applet-tools create my-applet --origin https://example.com --name "Example"
cd my-applet
npm install
npm run check                              # manifest, compatibility, TypeScript and page module
npm run build                              # writes dist/ with the bundle
npx let-applet dev install . --device emulator-5554 --application app.nirvana.genesis.dev
```

`dev install` sends the last build to Genesis Dev, which applies it without a restart. The new applet carries Let's instructions for coding agents in `let/`; give an agent `let/AGENTS.md` and a request in your own words:

> Read let/AGENTS.md. Build an app for https://example.com that keeps my reading list with tags and lets me search it.

The agent decides whether the app needs a servelet, inspects the website, writes the page module, the screens and the backend, and checks the result on the device. The [getting started guide](https://github.com/nirvanacp/let/blob/develop/factory/applets/guides/getting-started.md) walks through the first watch and the first input, and the [publishing guide](https://github.com/nirvanacp/let/blob/develop/factory/applets/guides/publishing.md) covers releases that people add to Genesis from GitHub.

## Build the Genesis app

Requirements:

- Node 24.15.0 and npm 11.14.1 (`.nvmrc` names the Node version)
- Rust 1.94.0 (`rust-toolchain.toml` installs the toolchain and Android targets) and `cargo-ndk` 4.1.2
- The Android SDK with NDK 28.2.13676358, and `ANDROID_HOME` set
- Go 1.24 or later, to build the servelets of bundled applets

`tools/build.mjs` checks each version and prints the install command for a missing one.

A debug build builds the bundled applets from their source, so it needs the whole workspace:

```sh
npm run workspace -- setup     # clone Let and the applets (and npm ci in them), create an empty servelets directory
git clone https://github.com/nirvanacp/servelets.git servelets   # the example servelets, if setup left it empty
npm ci
npm run typecheck
npm run build                  # native library, packages and bundled applets

# Build the APK and install it on one device.
ANDROID_SERIAL=emulator-5554 android/gradlew -p android :app:installDebug
```

A release-type build takes every bundled applet from its pinned published release, so it needs this repository and Let, but no applet or servelet source:

```sh
git clone https://github.com/nirvanacp/let.git let
git -C let checkout v<version>   # the @nirvanacp/core version in package-lock.json, as the release workflow does
npm ci
android/gradlew -p android :app:assembleRelease     # app-release.apk; :app:bundleRelease writes the .aab
android/gradlew -p android :app:assembleDeveloper   # app-developer.apk, Genesis Dev
```

### Build types

| Build type | Application id | Bundled applets | Development installs |
| --- | --- | --- | --- |
| `debug` | `app.nirvana.genesis` | Built from source, or the pinned release when the source is missing | Accepted |
| `release` | `app.nirvana.genesis` | Pinned published releases only | Refused |
| `developer` | `app.nirvana.genesis.dev`, version name ending in `-dev`, label "Genesis Dev" | The same pinned releases as `release` | Accepted |

`release` and `developer` are signed with the key that four values name. Each comes from an environment variable, otherwise from the Gradle property after it, for example in `~/.gradle/gradle.properties`:

| Environment variable | Gradle property |
| --- | --- |
| `GENESIS_KEYSTORE_FILE` | `genesis.keystore.file` |
| `GENESIS_KEYSTORE_PASSWORD` | `genesis.keystore.password` |
| `GENESIS_KEY_ALIAS` | `genesis.key.alias` |
| `GENESIS_KEY_PASSWORD` | `genesis.key.password` |

Without all four, `release` is unsigned and `developer` is signed with the debug key, so it still installs.

### Releases

A tag `v<versionName>` runs [app-release.yml](.github/workflows/app-release.yml). It checks out Let at the tag of the framework version in `package-lock.json`, runs the checks, builds `assembleRelease`, `bundleRelease` and `assembleDeveloper`, signs them with the key in the repository's secrets, and publishes the files listed under [download](#download) as a GitHub release with build provenance attestations. Running the workflow by hand from a branch is a dry run: it signs with a throwaway key and keeps the files as a workflow artifact.

### Applets in the app

A debug or developer build accepts `let-applet dev install` over `adb`. A release build refuses it. Release builds install the applets bundled into the APK and the applets people add from **Add applet** in the Genesis menu, from a public GitHub repository or a downloaded bundle file. Genesis shows each build's origins and capabilities for review before installing it, and offers updates from the same source. In an applet repository, CI rebuilds every tagged version and publishes the release only when the rebuild matches the committed build; the [publishing guide](https://github.com/nirvanacp/let/blob/develop/factory/applets/guides/publishing.md) covers versions, tags and the reusable workflows, which live in the Let repository.

`genesis.packages.json` lists the applets bundled into the APK, by applet id, which is also the applet's directory name. An entry such as `{ "id": "hn-bookmarks", "drawer": true }` also gives that applet its own icon in the Android app drawer, drawn from the manifest's `shell.icon` and accent color. An entry's `release` object pins the applet's published GitHub release:

```json
{ "id": "hn-bookmarks", "drawer": true,
  "release": { "repository": "nirvanacp/applets", "tag": "hn-bookmarks/v0.0.7", "sha256": "<SHA-256 of applet-hn-bookmarks.bundle.json>" } }
```

A release or developer build bundles only pinned releases, and fails when a selected applet has no `release` pin. It downloads `applet-<id>.bundle.json` and `applet-<id>.release.json` from the release into `target/genesis/releases/`, and fails unless the bundle's SHA-256 matches the pin and the release record, and the record is valid and names the applet and the pinned tag's version. A cached download that still passes these checks is reused, so a rebuild works offline; a damaged one is downloaded again. Each download times out after a minute. A debug build builds an applet from its source directory when the applets directory has it, and uses the pinned release otherwise.

## Workspace

`genesis.workspace.json` says where Let, the applets and the servelets live and which repositories they come from. `directory` can be relative to this repository or absolute. `npm run workspace -- <command>` keeps the checkout in line with it:

| Command | What it does |
| --- | --- |
| `path` | Prints the applets directory |
| `setup` | Clones Let and the applets into their directories when they are missing and runs `npm ci` in a newly cloned applets directory that has a lockfile, creates the servelets directory (cloning it when the config names a repository), then runs `sync` |
| `sync` | Links `applets/` to the configured directory when it lives elsewhere |
| `link-framework` | Installs a packed copy of this checkout's `let/packages/*` into the applets' `node_modules` without saving, so the applets build against the local framework. A debug build runs it by itself when the framework files changed since the last run |
| `unlink-framework` | Runs `npm ci` in the applets directory, back to the npm registry versions. Needs the applets' lockfile |
| `check` | Fails with the repairing command when the checkout differs from the config. `npm run check:packages` runs it too |

The root `package.json` is an npm workspace over `let/packages/*`. The applets directory is its own npm workspace with its own lockfile, so run `npm ci` in both. A debug build of Genesis builds applets from source against this checkout's `let/packages/*`: it fingerprints their files and runs `link-framework` when the copy in the applets' `node_modules` came from other files or from npm. `let-applet publish` refuses tools and an SDK that differ from the applets' committed lockfile, so run `unlink-framework` (`npm ci`) before publishing; a local framework never reaches a release.

## Repository map

| Path | What it is |
| --- | --- |
| `android/app/` | The Java shell: the manager window, one window per applet, context WebViews and GeckoView pages, the website bar, the Genesis menu, the service HTTPS client |
| `android/native/` | `genesis-host`, the Rust host built into `libgenesis_host.so`: applets, contexts, documents, messages, storage, services, compatibility, installs |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, manifest and bundle types, limits, error codes |
| `crates/servelet-runtime/` | `genesis-servelet-runtime`: runs a servelet's WebAssembly module over its SQLite database, with fuel, time and memory limits. `servelet-run` runs one on the computer |
| `tools/` | The APK asset and native build, the workspace and package checks, git hooks |
| `genesis.workspace.json` | Where Let, the applets and the servelets are checked out |
| `genesis.packages.json` | The applets bundled into the APK |

## Status

What works today, on Android emulators and a physical Samsung phone:

- the runtime: manifest schema 6, bundle format 3, document protocol 2, page control API 1, with `@nirvanacp/sdk` and the tools at `0.1.0-alpha.1`;
- up to three website contexts per applet, on WebView or GeckoView;
- applet storage, HTTPS services with pinned certificates, and servelets on the phone;
- installing applets from GitHub releases or bundle files, with review and updates;
- a release workflow that builds the signed app, the App Bundle and Genesis Dev from a tag;
- the Let packages ready to publish to npm from a tag of the Let repository;
- browser features inside applets, including downloads, file uploads, popups, HTTP authentication and permission prompts.

Not done yet:

- publisher signing for applets;
- applet UIs in React Native or native Java or Kotlin, servelets in JavaScript, and servelets in the cloud;
- iOS.

Genesis refuses an applet built for another version of the runtime and marks it as needing an update.

## Contributing

Work in this workspace falls into three layers, each with its own instructions:

| Layer | Covers | Instructions |
| --- | --- | --- |
| Platform | This repository and Let's packages, tools and guidance | [AGENTS.md](AGENTS.md) |
| Applets | An applet's page module, screens, rules and data | `let/factory/applets/AGENTS.md` |
| Servelets | An applet's Go backend | `let/factory/servelets/AGENTS.md` |

The instructions are written for coding agents and read just as well for people. They cover nested repositories, worktrees, branch names (`feat/…`, `fix/…`, `docs/…`), the commit format `feat/(<area>): message`, and the checks to run before committing. Pull requests go to `develop`. Run `sh tools/git-hooks/install.sh` once after cloning to install the branch name and worktree hooks.

## Licence

MIT, see [LICENSE](LICENSE).
