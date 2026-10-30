# Genesis platform and ownership

## Contract

Genesis runs independently developed customizations over websites. Creators own their frontend, business logic, data model and optional backend. A new applet workflow or server route must not require a new feature-specific Rust command. New device capabilities may require a platform change.

The product unit is an applet, not a website domain. One applet may combine multiple source websites and owned pages. The desired native behavior comes from Genesis's browser/native lifecycle plus applet UI, not from requiring users to modify platform code. Use root [AGENTS.md](../AGENTS.md) for platform maintenance and [factory/AGENTS.md](../factory/AGENTS.md) for applet work, including examples currently under `factory/applets/`.

## Ownership

| Owner | Responsibilities |
| --- | --- |
| Website | Original application code, DOM, account session and upstream servers. |
| Applet frontend | Selectors, extraction, managed DOM effects, styles, custom pages, workflow and backend protocol. |
| Applet backend | Its API, persistence, authorization, migrations, deployment, consistency and application rules. |
| Genesis SDK | General managed effects, scope cleanup, navigation, optional local storage and service requests. |
| Rust host | Package validation, trusted identities, command/event state machine, capabilities, lifecycle and recovery decisions. |
| Android adapter | WebView APIs, native controls, credential protection, network execution and JNI transport. |

The active applet is under factory/applets/news.ycombinator.com. Its backend runs as a separate Node process and is not packaged or executed on the phone. Different future backends may use different languages and databases. Browser rendering stays in WebView, with applet JS/TS and optional React. Rust/Wasm page-runtime code and X/YouTube applets are preserved but inactive in the selected build.

## Directory boundaries

android/app holds platform integration; android/native holds native controller and generic storage; crates/contracts holds transport types; packages/sdk holds applet runtime capabilities; factory/applets/<application>/src holds frontend; factory/applets/<application>/backend holds creator-owned server code. Existing directory names happen to be domains. tools validates and bundles the selected frontend. Backend code must not be imported into browser bundles. Factory contains portable creator instructions/skills; SDK and creator tooling implementation remain platform-owned even though applet authors consume them.

APK selection is explicit in `genesis.packages.json`; `tools/check-packages.mjs` and the platform build use `packages/applet-tools` validation/bundling. SDK `0.2.0` exports built ESM/declarations for root/React/manifest plus a tooling-only runtime export. Creator packages can be packed and used outside the monorepo without Cargo or Gradle.

The standalone CLI creates/checks/builds applets, exports the matching agent kit, and performs development install/status/rollback through authorized adb. Debug `PackageStore` validates external bundle format/runtime API 1, host policy, declared asset bytes, canonical revision, replacement intent, and permission changes. It atomically selects an immutable private revision and retains previous compatible code. Corrupt current code falls back to previous valid code or bundled code. Rollback never rolls back application records. Release builds ignore development imports and continue using APK assets. Hashes prove integrity, not publisher authenticity; production installation/trust remains future work.

Source navigation and manifest sections use explicit source/page selections. Customized presentation is limited to the bound source; ordinary links into another source's origin use reader presentation. A customization-aware cross-source transition uses sources.open or a declared native destination. Applets exchange records through optional storage/services and refresh on focus. Storage/service completions share generation/document/channel validation across active and retained live views. This does not enable hidden-view requests, a durable message bus, or an always-running coordinator.

See the [implementation plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) for component decisions and [creator guides](../factory/README.md) for the supported applet workflow.

## Evolution rules

Use generic capability contracts rather than adding host methods for application entities. Keep backend-specific routes, SQL and types under the applet. Generic platform local storage remains optional, and may support settings or an applet-defined cache. It is not the authoritative HN store after this migration.

A future application context can coordinate pages outside a document lifetime. It must be restartable, resource-bounded and explicit about phone suspension. Arbitrary on-phone server execution, persistent background processing, total network confinement is not implemented. A bounded native registry now retains customized section views; it does not run arbitrary backend programs on the phone.

## Agent constraints

Preserve unrelated changes, website cookies, application identity/signing and existing device data. Do not add test files without user authorization. Run existing type/package/Rust/Android checks from their correct directories. Existing archived plans are historical only. Do not derive current acceptance from a superseded architecture or old offline-storage report.
