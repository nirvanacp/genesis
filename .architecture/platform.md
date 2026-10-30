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

Current package selection is build-time in tools/check-packages.mjs. assets are immutable and hashed. Independent package import, publisher signatures, permission review on update and rollback are future capabilities, not implemented installation guarantees.

The current SDK is a private npm workspace exporting TypeScript source. Applet tsconfigs inherit root configuration, bundling imports an internal bootstrap, and even asset builds check Cargo. A new applet directory is not automatically registered. These are authoring/distribution gaps rather than reasons to move applet business logic into the host. The [single separation plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) specifies standalone artifacts, generic package tooling, source relocation, and debug loading. None is implemented by the documentation update.

Source arrays and source navigation already support more than one website structurally. Current hybrid workflows must exchange applet-owned records through storage/services and refresh on focus. There is no cross-source DOM query API, durable message bus, or always-running coordinator. Native shell defaults and retained completion differences still need the planned work and multi-site qualification.

## Evolution rules

Use generic capability contracts rather than adding host methods for application entities. Keep backend-specific routes, SQL and types under the applet. Generic platform local storage remains optional, and may support settings or an applet-defined cache. It is not the authoritative HN store after this migration.

A future application context can coordinate pages outside a document lifetime. It must be restartable, resource-bounded and explicit about phone suspension. Arbitrary on-phone server execution, persistent background processing, total network confinement is not implemented. A bounded native registry now retains customized section views; it does not run arbitrary backend programs on the phone.

## Agent constraints

Preserve unrelated changes, website cookies, application identity/signing and existing device data. Do not add test files without user authorization. Run existing type/package/Rust/Android checks from their correct directories. Existing archived plans are historical only. Do not derive current acceptance from a superseded architecture or old offline-storage report.
