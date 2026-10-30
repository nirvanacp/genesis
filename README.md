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
- `packages/sdk/`: platform-owned TypeScript managed runtime and optional React helper used by applets.
- `tools/`: current package/APK build and development service tooling.
- `factory/applets/`: current applet source, including optional applet-owned backends.
- `factory/`: applet author instructions, portable guides, and skills. Example applets live under `factory/applets/`.
- `.architecture/`: current platform boundaries and an explicitly labeled HN reference application. Phase-specific operations, plans, and change records follow root instructions.

## Current state

Only HN is bundled. Its frontend is under `factory/applets/news.ycombinator.com/src`; its separate Node/SQLite service is under `factory/applets/news.ycombinator.com/backend`. Bookmarks/categories are authoritative on that service. Generic host storage holds public account coordination and Post drafts; existing legacy bookmarks are preserved and never silently uploaded. The backend does not run inside Genesis.

The SDK already supports managed DOM effects, owned React pages, source/page navigation, local documents, and declared HTTPS services. Source arrays support several websites, but a distinct multi-website applet still needs qualification. HN's three current source entries are sections of the same website. X and YouTube are preserved inactive prototypes.

Applet packaging is still coupled to the Genesis checkout and APK build. The SDK is private; there is no standalone released creator CLI, independent applet installation, or coding-agent connector. The [single phase-3 separation plan](.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) covers the framework/tooling boundary and development loading path. Its runtime changes remain proposed.

The [29 October phone report](.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) records working HN flows on one Samsung phone/provider with a Mac-hosted HTTPS backend over adb reverse. It does not establish production distribution readiness or the full device/accessibility matrix. Release signing, production service provisioning, and broader qualification remain open.

Read [product intent](.notes/README.md) for the direction. For current development, use the [phase-3 maintenance guide](.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md) or [applet getting started](factory/guides/getting-started.md), according to the task. Archived plans are historical, not specifications.
