# Genesis platform maintenance

Project: Genesis. Phase `phase-3`, branch `proto/phase-3`. Created 30 October 2026, 16:20:34 Asia/Kolkata. This guide establishes current operating context from inspected code. Earlier phase-2 guides are background unless explicitly adopted below.

## Choose the owner before editing

| Task | Owner and instructions |
| --- | --- |
| Browser lifecycle, native shell, trusted document binding, generic storage/services, package loading | Genesis platform; root [AGENTS.md](../../../AGENTS.md) and [.architecture](../../../.architecture/README.md) |
| Public SDK, compatibility, package tooling, creator kit releases | Genesis platform; root rules, and factory docs as the consumer contract |
| Website selectors/forms, applet screens/design, application records/API/backend | Applet; [factory/AGENTS.md](../../../factory/AGENTS.md) plus repository rules |
| A feature needing both | Separate a generic capability change from the applet that uses it; document the contract and verify each component |

Root instructions remain unchanged except for the additive layer/routing paragraph. Applets currently live under `factory/applets/`; their forwarding AGENTS routes agents into factory guidance. The [single architecture plan](../../../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) proposes later moves, standalone packages, and debug loading. Do not use its future paths or commands before implementation.

## Current runtime and tools

Android's active Java source lives in `android/app/src/main/java/app/nirvana/genesis/`. Rust in `android/native` owns host policy and generic storage; `crates/contracts` holds transport/package types. `packages/sdk` supplies the managed TS runtime and optional React helper. Preserved Kotlin starter code and Wasm page-runtime are inactive.

The current package checker selects only HN. Root workspaces also include inactive X and YouTube. `tools/build.mjs` validates/types, bundles entries with the SDK bootstrap, hashes assets, and builds native libraries according to its stage. Gradle registers generated output under `android/app/build/generated/genesis/<variant>/`. Do not hand-edit generated assets or copy backend code into them.

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

Sources can switch through declared IDs and HTTPS origins. Applet pages can combine applet records; there is no API for reading another source's live DOM or scheduling a persistent background application. Storage and service completions currently differ for retained views; source selection/defaults also need the planned generalization. Do not advertise a fully qualified hybrid-app framework yet.

## Evidence and open release work

Adopt the [29 October emulator report](../../../.reports/phase-2/2026-10-29/202706-genesis-seamless-implementation-verification.md) and [phone report](../../../.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) as scoped evidence, not requirements copied from another phase. They qualify particular HN flows and debug backend integration on their builds. They do not establish all providers, production deployment, or complete transition/accessibility coverage.

Root [TODOS.md](../../../TODOS.md) retains the addition phases of existing release tasks. Keep those records in place. Production signing, service provisioning, broader device/failure qualification, and authorized real-post validation remain separate. Independent applet distribution and coding-agent connectors are not available. The current documentation update adds guidance and a plan only.

## Keeping the layers understandable

Current architecture stays in `.architecture/`, current-phase operating records in `.docs/phase-3/`, and portable applet guidance in `factory/`. Update their ownership descriptions when APIs change. Keep HN architecture labeled as a reference application; other applets do not inherit its data model or product choices. Preserve archived documents and historical reports rather than rewriting them to describe new paths.

In the future external creator kit, no required guide may point into the platform's private plans, native code, or project skills. A connector should consume versioned CLI/package contracts, not teach agents to patch host code. Changes to the kit itself are platform maintenance; using it to build a user's applet follows factory instructions.
