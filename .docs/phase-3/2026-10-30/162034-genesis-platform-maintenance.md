# Genesis platform maintenance

Project: Genesis. Phase `phase-3`, branch `proto/phase-3`. Created 30 October 2026, 16:20:34 Asia/Kolkata. This guide establishes current operating context from inspected code. Earlier phase-2 guides are background unless explicitly adopted below.

## Choose the owner before editing

| Task | Owner and instructions |
| --- | --- |
| Browser lifecycle, native shell, trusted document binding, generic storage/services, package loading | Genesis platform; root [AGENTS.md](../../../AGENTS.md) and [.architecture](../../../.architecture/README.md) |
| Public SDK, compatibility, package tooling, creator kit releases | Genesis platform; root rules, and factory docs as the consumer contract |
| Website selectors/forms, applet screens/design, application records/API/backend | Applet; [factory/AGENTS.md](../../../factory/AGENTS.md) plus repository rules |
| A feature needing both | Separate a generic capability change from the applet that uses it; document the contract and verify each component |

Root instructions remain unchanged except for the additive layer/routing paragraph. Applets currently live under `factory/applets/`; their forwarding AGENTS routes agents into factory guidance. The [single architecture plan](../../../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) records the source relocation, standalone packages, debug loading, and implementation qualification.

## Current runtime and tools

Android's active Java source lives in `android/app/src/main/java/app/nirvana/genesis/`. Rust in `android/native` owns host policy and generic storage; `crates/contracts` holds transport/package types. `packages/sdk` supplies the managed TS runtime and optional React helper. Preserved Kotlin starter code and Wasm page-runtime are inactive.

`genesis.packages.json` selects HN as the default APK bundle. Root workspaces also include inactive X and YouTube. `tools/build.mjs` prepares built SDK artifacts, invokes the standalone packager for the selected applets, and builds native libraries according to its stage. Frontend check/assets stages require no Cargo; native/all stages enforce the pinned Rust toolchain. Gradle registers generated output under `android/app/build/generated/genesis/<variant>/`. Do not hand-edit generated assets or copy backend code into them.

Adopt the toolchain/setup portions of the [phase-2 Android guide](../../phase-2/2026-10-27/161510-genesis-android-setup.md), verified against current package/Gradle/toolchain files: Node 24.15.0, npm 11.14.1, Rust 1.94.0, cargo-ndk 4.1.2, JDK 17, Gradle 9.3.1, AGP 9.1.1, NDK 28.2.13676358, compile/target SDK 37, minimum 26, and arm64-v8a/x86_64. Its “one WebView” description is superseded by bounded retained sections and a child reader. Its old manual-first service setup is superseded by the current factory service workflow. Machine-specific paths belong in ignored `android/local.properties`.

Current checks, from the repository root:

```sh
npm run typecheck
npm run check:packages
cargo fmt --all -- --check
cargo check --workspace --locked
cargo clippy --workspace --locked -- -D warnings
cargo test --workspace --locked
git diff --check
```

Use only the checks relevant to the change. Run `node --check` for changed `.mjs`. From `android/`, build/verify changed host or generated bundles with `./gradlew :app:assembleDebug :app:lintDebug`; use `--offline` only with cached dependencies. Existing starter tests/zero Rust tests do not provide applet regression coverage. Do not add/modify test files without a user request. A docs-only change needs link/contract/example checks, not a fresh APK.

## Services and integration boundaries

Use [factory services/data](../../../factory/guides/services-and-data.md) for the current creator commands. HN's backend remains a separate process. It is authoritative for bookmarks/categories; host storage is optional infrastructure used for public identity and drafts. Do not migrate, reset, or silently upload existing device data. Install APK updates without changing app ID/signing or uninstalling over user data.

Keep applet-specific selectors, schemas, endpoints, and user-facing domain messages out of platform code. When changing a public capability, update its SDK types, host validation, factory reference/examples, and compatibility description together. The host must derive applet identity from the bound context, never trust an applet-supplied identity for storage or service authorization.

Sources can switch through declared IDs and HTTPS origins. Applet pages can combine applet records; there is no API for reading another source's live DOM or scheduling a persistent background application. Storage and service completions now share live-document matching across active and retained views. Native shell selections and choice destinations carry explicit source IDs. Ordinary cross-source links use reader mode; sources.open changes the customization context. The temporary two-source application qualification is recorded in the phase-3 implementation report.

## Evidence and open release work

Adopt the [29 October emulator report](../../../.reports/phase-2/2026-10-29/202706-genesis-seamless-implementation-verification.md) and [phone report](../../../.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) as scoped evidence, not requirements copied from another phase. They qualify particular HN flows and debug backend integration on their builds. They do not establish all providers, production deployment, or complete transition/accessibility coverage.

Root [TODOS.md](../../../TODOS.md) retains the addition phases of existing release tasks. Keep those records in place. Production signing, service provisioning, broader device/failure qualification, and authorized real-post validation remain separate. Debug applet installation through authorized adb is available. Production publisher distribution and coding-agent connectors remain future work.

## Keeping the layers understandable

Current architecture stays in `.architecture/`, current-phase operating records in `.docs/phase-3/`, and portable applet guidance in `factory/`. Update their ownership descriptions when APIs change. Keep HN architecture labeled as a reference application; other applets do not inherit its data model or product choices. Preserve archived documents and historical reports rather than rewriting them to describe new paths.

In the exported creator kit, no required guide may point into the platform's private plans, native code, or project skills. A connector should consume versioned CLI/package contracts, not teach agents to patch host code. Changes to the kit itself are platform maintenance; using it to build a user's applet follows factory instructions.

## Package and export the creator tools

From the workspace root, use the pinned npm executable/environment:

```sh
npm run build --workspace @genesis/sdk
npm pack --workspace @genesis/sdk --pack-destination /absolute/output
npm pack --workspace @genesis/applet-tools --pack-destination /absolute/output
node packages/applet-tools/src/cli.mjs kit export --out /absolute/new-kit-directory --json
```

Tools prepack includes current factory instructions/guides/skills, excluding example applet code and platform internals. The SDK archive contains ESM and declarations. Supply these archives and the debug APK to applet authors; no registry publication occurs automatically. SDK artifact preparation uses a process lock/input stamp because Gradle may build debug/release variants concurrently. Both variants consume the same completed SDK output.

External bundles contain bundle.json and exact assets. Development transfer uses app-private one-time files and correlated receipts. Status reports effective IDs/revisions and declared permissions, never credentials or browsing history. The host independently enforces compatibility, expected revision, explicit replacement, and permission changes. Preserve ID/signing/data across host updates. Production release loading ignores the private development registry entirely.
