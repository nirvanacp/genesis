# Genesis platform and ownership

Genesis runs custom applications over live websites. Current applets use schema 3/API 4. Applet authors own their route inventories, source extraction, validated models, owned UI, application rules and optional backends. Platform changes supply general capabilities and never contain HN/X selectors, entity models or SQL.

| Owner | Responsibilities |
| --- | --- |
| Website | Original code/DOM, cookies, authentication, forms, tokens and upstream actions |
| Applet | Bounded source models, owned screens, read/navigation commands, records and backend protocol |
| SDK/tools | Role-specific authoring, managed observation/cleanup, schema validation, bundles, creator projects and portable guidance |
| Rust host | Exact route resolution, trusted document/channel/generation/epoch identity, capabilities and lifecycle decisions |
| Android | Separate WebViews, opaque barrier, source mute/accessibility/focus isolation, native shell/provider/recovery, storage/service execution |

Use root AGENTS.md for platform work and factory/AGENTS.md for applets. Native code is under `android/app` and `android/native`; shared types under `crates/contracts`; SDK/tools under `packages`; maintained examples under `factory/applets`. Inactive Kotlin/Wasm/YouTube work is not the active rendering architecture.

An applet is one stable application identity with any declared sources/pages/services. Source adapters observe one website document. A separate persistent foreground coordinates the active visit and owns storage/services. The host currently keeps one active hidden source, one foreground and at most one website reader. Navigation may recreate a source; there is no permanent background coordinator or cross-source DOM API.

SDK 0.5.0 / tools 0.5.0 export public root/React/manifest APIs plus a tooling-only runtime. New projects declare all known routes with an unsupported default. SourceAdapterContext excludes foreground capabilities; native checks enforce authority independently. Changing an applet's feature does not require adding a host command.

Debug PackageStore accepts compatible bundle format 1/runtime APIs 1/2/3, validates declarations/assets/revisions/permissions and atomically selects immutable code. Schema 2 requires API 3. Updates and rollback preserve records; corrupt revisions fall back to compatible previous/bundled code. Release hosts use APK selection only. HN remains selected by `genesis.packages.json`; X is separately development-installed. Integrity hashes are not publisher authentication.

Cookies stay in browser sessions. Optional service credentials are applet/service-scoped and native-protected. Source and external website documents cannot call foreground storage/services. Applet code remains trusted author code: isolated worlds, types, Shadow DOM and shared asset-origin paths do not provide complete malicious-code or network confinement. Camera/microphone, general authentication-popup support and production service distribution need separate capability work.

See [runtime](browser-runtime.md), [services/data](services-and-data.md) and the current factory contract for implemented boundaries. Historical phase-4 source-CSS and retained mixed-document descriptions are superseded for migrated applets.


## Explicit navigation migration

Schema 3/API 4 adds host-owned presentation decisions, declared website actions for custom URLs, native uncovered recovery and explicit website Return. SDK/tools 0.5.0 supply resolve/activate/subscribe, controls and route inspection. Existing schema-2/API-3 packages retain their execution behavior. Current X/HN use schema 3; the source receives its accepted route rather than choosing presentation with a second pathname router. See [portable navigation](../factory/guides/navigation.md). Website mode retains its own history and never automatically becomes custom on a matching URL. This policy is not outbound network confinement or malicious-author isolation.
