# Genesis platform and applet separation

Created 30 October 2026, 16:20:34 Asia/Kolkata. Project: Genesis monorepo. Phase: `phase-3`, selected from branch `proto/phase-3`. Inspected baseline: `e6d96e3`. Status: implementation authorized and in progress. The companion instructions and factory guides are delivered separately in this documentation task.

## Outcome and scope

Genesis is the maintained browser platform. An applet is an independently authored custom application over one or more websites, with its own source adapters, UI, application rules, records, and optional backend. Users and their coding agents should build applets against a documented framework without reading or editing Android/Rust internals. Native app behavior remains a platform responsibility, with applet-supplied content and declarative navigation.

Implement a versioned authoring SDK and package toolchain, an explicit package boundary, and a development loading path into a prebuilt host. Keep the existing managed DOM/React model; do not rewrite the renderer or introduce a second frontend framework. Multiple declared sources and applet-local records supply the first hybrid-app model. No persistent background applet process is required for that model.

The user requested a single plan for code changes and immediate updates to documentation and agent guidance. Do not treat this document as permission to start runtime implementation during that documentation task. When implementation is requested, read the entire plan, root [AGENTS.md](../../../AGENTS.md), [factory instructions](../../../factory/AGENTS.md), [current architecture](../../../.architecture/README.md), and [phase-3 maintenance guide](../../../.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md).

In scope: source organization, SDK distribution artifacts, generic validation/build tooling, native shell assumptions that obstruct other applets, consistent retained-view completion semantics, debug package replacement, creator documentation export, and migration of existing applets. Excluded: public marketplace, release package installation, publisher accounts/signatures, production credential enrollment, actual Codex/Claude connectors, iOS support, arbitrary phone server execution, headless crawling, universal synchronization, full DOM mirroring, and React Native. These need separate release/product work; none is implied by debug loading.

## Decisions and phase context

- User requirement: root instructions maintain Genesis; factory instructions guide applets for both internal developers and external users. Root `AGENTS.md` receives an additive reference only. Factory guidance is self-contained and lives in `factory/` by explicit user request.
- User requirement: one applet can combine several websites. A domain-shaped directory is not its identity or architectural limit.
- Agent decision: retain the monorepo for platform development, but package the creator dependencies so an applet workspace can live outside it. Moving every host directory would create churn without improving the contract.
- Agent decision: move maintained example applets under `factory/applets/` during implementation, preserving manifest IDs. Factory owns guidance/examples; the platform team still owns the SDK and creator toolchain implementation under `packages/`.
- Agent decision: first independent loading is explicit debug installation over an authorized adb connection. Release hosts continue using bundled packages. This lets the framework be used without native source while avoiding an invented production trust model.
- Agent decision: use shared applet-local documents or a backend for multi-source data. Do not add a background coordinator until a specific application requires it. Treat current multi-source support as code-supported but not yet qualified across distinct websites.
- There were no phase-3 operating documents or implementation plans at inspection. Adopt the current source-backed boundaries from `.architecture/`. From the phase-2 seamless plan, retain native shell ownership, bounded retained views, opaque reveal gates, optional applet backends, and no real website posts during verification. Its implementation details are not a new backlog. The earlier navigation plan's applet-owned tabs and assumptions of a single view are superseded. Historical reports remain evidence of their particular builds.
- Preserve HN's compact rows, native five-section shell, real source forms, Search placeholder, remote bookmark authority, local drafts/public identity, and stable `hn-bookmarks` ID. This plan does not redesign HN.

## Findings from the code

| Finding | Evidence | Consequence and planned response |
| --- | --- | --- |
| Core ownership is substantially separated | `android/native/src/controller.rs` emits generic host commands; applet `src/backend.ts`, repositories, and `backend/` own HN protocol/data | Preserve that split; no HN entity commands in Rust. |
| Existing framework is real but internal | `packages/sdk/src/{index,runtime,react,bootstrap,storage}.ts*`; package is private and exports TS source | Build distributable JS/types and documented package exports. |
| Authoring requires platform source/toolchains | `tools/check-packages.mjs:readPackages` selects HN; `tools/build.mjs:check/assets` assume root paths, internal bootstrap, and Cargo even for assets | Generalize directory-based validation/build; separate native APK assembly. |
| Runtime trusts APK assets only | `MainActivity.onCreate` reads APK index; `PackageAssets` reads `AssetManager`; package revision is a hash | Add a bounded debug package store, keeping host validation and immutable revisions. Hash integrity is not publisher authenticity. |
| Contract is prototype-coupled | `IMPLEMENTATION_STAGE = MVP-07`; JS/Rust independently validate manifests | Add an external runtime API/bundle version, preserve internal legacy compatibility, align validation rules. |
| Multiple sources exist but shell assumes HN-like defaults | `Source[]`, `sources.open`, `AppletInstance.sources` are generic; `HostViews.configureShell` falls back to `primary`, choices say Top/Feed and open the current source; local binding has no source ID | Pass explicit host selection to the shell, make choice destinations explicit and generic. |
| Route presentation can imply the wrong source binding | `controller.rs:classify_url` matches any package source while injection uses the selected source's origins/entry | Classify against the bound source; cross-source customization must explicitly switch source context. |
| Some host UX is app-specific | `ServiceClient.execute` says “Saved stories” for missing credentials/auth | Use generic service errors; let applets own domain wording. Preserve source cookies and host-held credentials. |
| Retained completion behavior differs | `StorageCompleted` only replies to active document; `ServiceCompleted` also searches retained views; PageMessage is active-only | Define and implement one bounded completion policy without enabling hidden background work. |
| Data namespace is already applet-scoped | `storage.rs` uses local profile + applet ID; services use applet ID + service ID | Preserve IDs and data through file moves and dev updates. No schema migration or reset. |
| Creator context is missing | Empty factory placeholders; no applet-specific AGENTS; README conflates product/host/HN operations | Deliver factory kit now; route repo guidance; keep guidance matched to SDK release later. |
| Current top-level docs understate verification | They say the network path still needs qualification; later phase-2 phone/emulator reports contain scoped passing evidence | Link the actual reports and limitations; do not reinterpret them as universal release readiness. |

Inspect `android/app/src/main/java/app/nirvana/genesis/`, `crates/contracts/src/lib.rs`, `android/native/src/{packages,sources,controller,storage}.rs`, `tools/{build,check-packages,services}.mjs`, and the SDK/app manifests before implementing each affected step. Preserved Kotlin starter files and `crates/page-runtime` are inactive. Do not revive them or delete them under this plan.

## Target boundary and layout

```text
Genesis platform                         Applet author workspace
android/app, android/native              applet.json, package.json, tsconfig.json
crates/contracts                         src/adapters, src/pages, src/data
packages/sdk                             assets, optional backend
packages/applet-tools                     README, factory guidance/skills
tools/build.mjs: APK orchestration        consumes released SDK/tools only
genesis.packages.json: bundled selection
factory/AGENTS.md, guides/, skills/       portable guidance, maintained by Genesis
factory/applets/*                        examples using the same public contract
```

Dependencies flow from applets to SDK public exports and from applet tooling to documented SDK build exports. Platform policy never imports applet business logic. The host consumes validated package metadata/assets, not applet source. Applet backend code stays outside browser bundles and APK assets.

Keep application state ownership explicit: website server/cookies; applet-local records; applet backend; platform lifecycle/settings. A file move does not transfer ownership of the records. Applet creators own schemas/migrations; platform maintainers own compatibility and transport.

## Public package and build contracts

The following interfaces are proposed. They do not exist in the current creator kit.

1. Build `@genesis/sdk` version `0.2.0` as ESM JavaScript plus declarations, including `.` and `./react`. Preserve current authoring signatures for compatibility. Add a tooling-only `./runtime` export for `bootstrap`, and `./manifest` for manifest types. Document `./runtime` as reserved to the packager, never directly called by an applet. Export a runtime API constant `1`; use this value in packaging rather than inferring compatibility from package semver. Keep React peers optional.
2. Add `packages/applet-tools`, package `@genesis/applet-tools`, binary `genesis-applet`. Use the already pinned TypeScript and esbuild versions as actual package dependencies. Each package must be packable without dependencies on sibling source paths. Use explicit package `files` lists to exclude source secrets, fixtures, private caches, and backends. `npm pack` is sufficient distribution for qualification; do not publish to a registry automatically.
3. Tooling exports `readApplet(directory)`, `validateManifest(value)`, `buildApplet(directory, output)`, and `readBundle(directory)`. The CLI is a thin caller of these functions. Resolve the applet's installed SDK with Node package resolution from its directory. No absolute developer path or `../../packages/sdk` import may appear in output or templates.
4. `check <directory>` validates manifest, contained paths, service declarations, and the applet tsconfig. `build <directory> --out <directory>` runs check and emits a deterministic directory containing `bundle.json` and `assets/<asset-path>`. Refuse output equal to or containing the source directory; replace only a recognized tool-owned output directory. Neither command invokes Cargo, Gradle, adb, or a backend. `--json` emits one JSON result to stdout, diagnostics to stderr, and exits 0 on success, 1 on validation/runtime failure, 2 on usage error.
5. Bundle envelope: `{formatVersion:1,runtimeApiVersion:1,sdkVersion:"0.2.0",package:{manifest,revision,assets:[{path,sha256}]}}`. Retain existing generated source/page JS paths, local HTML paths, and asset SHA-256 semantics. Define revision as SHA-256 over UTF-8 canonical JSON of `{formatVersion,runtimeApiVersion,sdkVersion,manifest,assets}`. Canonical JSON recursively sorts object keys, preserves array order, and uses JSON number/string encoding without whitespace. Sort asset entries by path before hashing. The host recomputes it. This is an integrity identity, not a signature.
6. `tools/build.mjs` remains the platform entrypoint. It reads `genesis.packages.json` with `{ "schemaVersion":1, "applets":["factory/applets/news.ycombinator.com"] }`, invokes the same library for selected bundles, then assembles the APK-compatible index/assets. Keep `--stage check|assets|native|all`; check/assets require Node but no Cargo, native/all check native dependencies. Gradle still performs the combined native/application build.
7. Leave internal `PackageIndex` compatibility with schema 1 and `MVP-07` for bundled/current assets. Add the external bundle envelope types in Rust and validate/normalize them before constructing an internal index for `HostState`. Do not replace internal stage strings with an unversioned accept-anything path. Unsupported envelope/API versions fail before activation with the installed/supported versions in diagnostics.

Manifest schema remains 1. Add optional `sourceId` to `ShellChoice`, normalized for legacy choices to the first section's source ID. Validate a choice URL against that specific source's origins and customized paths. This removes the current union-of-sources ambiguity. Unknown fields remain rejected at the host; JS validation should match. SDK types and a published JSON schema describe the same rules; Rust remains the trust-side validator rather than trusting a CLI result. Use current lower-common-denominator rules, including shell title 1–79 characters, unique action IDs, valid relative assets, exact HTTPS origins, and supported icons. Keep data schema version 1; no database migration is part of this plan.

Keep the existing `services.request<T>` whole-response generic to avoid breaking HN and external callers. Add exported `ServiceResponse<T> = {status:number;body:T}` for clearer typing, without changing the method's behavior. Typed errors must distinguish unknown completion from confirmed rejection. No new domain API belongs in the SDK.

## Ordered implementation components

Each step is a separate verified component commit. Use `feat/(component): description`, the affected repository's `git config user.email`, and only related files. Update the corresponding development changelog under the branch-selected phase. No new or modified test files are authorized by this plan; run existing tests and temporary/manual qualification instead.

### 1. Move example applets and make bundle selection explicit

Files: move `applets/{news.ycombinator.com,x.com,youtube.com}` to `factory/applets/`; move the forwarding `applets/AGENTS.md` to `factory/applets/AGENTS.md` and fix its link. Update root `package.json` workspace paths, `package-lock.json` local workspace/link metadata, each moved `tsconfig.json`, `tools/check-packages.mjs`, `tools/build.mjs` as needed, and `android/app/build.gradle.kts` input globs. Create `genesis.packages.json` and have `readPackages` read it instead of a hard-coded array. Preserve HN as the sole selected bundle.

All applet tsconfigs initially need `../../../tsconfig.base.json` and `../../../packages/sdk/src/assets.d.ts`; later standalone templates remove that dependency. Applet IDs, source/page IDs, entry paths relative to the applet, service IDs, backend protocol, and package names remain unchanged. Avoid broad deletion of the old directory before accounting for unrelated files. Update current docs/source links, not archived reports or past changelogs. Retain historical reports at their existing paths and explain their old source locations in the current guide.

Verification, root: `npm ci`, `npm run typecheck`, `npm run check:packages`, `git diff --check`; compare normalized manifests before/after and assert equal applet/service IDs. From `android/`, run `./gradlew :app:assembleDebug :app:lintDebug`. Expected: existing HN bundle and build pass, Gradle tracks the moved sources, and existing data survives install-as-update. No database is moved or cleared. Commit `feat/(factory): separate example applet workspace`.

### 2. Publishable SDK artifacts and versioned package contracts

Files: `packages/sdk/package.json`, new SDK build configuration/script, `src/index.ts`, new `src/manifest.ts`, existing `protocol.ts`/`bootstrap.ts`; `crates/contracts/src/lib.rs` for external envelope and optional shell choice source; `android/native/src/packages.rs` for compatibility/strict validation; new `packages/applet-tools/{package.json,src/manifest.mjs,manifest.schema.json}` and root workspace/lock metadata.

Build SDK JS and `.d.ts` files into `dist/`. Bundle the runtime's qualification CSS as text; retain React as an optional external peer. Applets still use only public root/react exports. Add manifest types, `ServiceResponse`, and a tooling runtime export without changing `activate`, `mount`, or storage semantics. Implement deterministic envelope validation/hashing and the manifest rules above. Keep host validation independent of JS. Reject malformed versions, duplicate IDs, path/symlink escape, invalid service declarations, and unsupported fields before any native loading.

Verification, root: `npm run typecheck`, `cargo fmt --all -- --check`, `cargo check --workspace --locked`, `cargo clippy --workspace --locked -- -D warnings`, `cargo test --workspace --locked`. Define and run `npm run build --workspace @genesis/sdk`, then `npm pack --workspace @genesis/sdk --pack-destination <temporary-directory>`. Inspect packed files and typecheck a temporary consumer importing only package exports. Exercise valid HN and temporary malformed manifests through both validator paths using the debug host in step 6; record that pending host gate now. Tests may report zero cases; do not call that coverage. Commit `feat/(sdk): define distributable applet contract`.

### 3. Extract standalone validation and bundling

Files: `packages/applet-tools/src/{index,check,build,cli}.mjs`; package bin/exports; `tools/check-packages.mjs`, `tools/build.mjs`; SDK/app dependency metadata; Gradle only where orchestration inputs change.

Implement library/CLI contracts above. Reuse esbuild IIFE bundling, ES2022 target, CSS-as-text, default entry wrapping, production React define, generated page HTML, and rejection of unresolved/external/dynamic imports from the existing `assets` function. Resolve `@genesis/sdk/runtime` from the creator workspace. Validate asset size at 4 MiB/file and total decoded bundle at 8 MiB; reject missing or undeclared assets. `readBundle` rechecks hashes and revision, not just file existence. Share the same output assembly with the host build. Remove the Cargo check from frontend-only paths.

Treat backend entries as authoring metadata only. Never include `backend/`, credentials, TLS files, databases, or development state in browser assets. Keep service declarations validated but excluded. All subprocess calls use argument arrays and explicit cwd; package paths may contain spaces.

Verification: root type/package checks and `node --check` for changed `.mjs`. Run `genesis-applet check/build` through its local bin from an unrelated cwd with an absolute applet path. Build twice and compare revisions/assets. In a temporary workspace without Android/Cargo on PATH, install packed SDK/tools, typecheck and bundle minimal DOM and React entries. Verify traversal/symlink rejection, unknown capability, duplicate IDs, oversize asset, and missing default export through temporary inputs. Confirm bundled HN still loads after a platform build. Commit `feat/(tooling): build applets outside the monorepo`.

### 4. Remove shell assumptions about source names and feed semantics

Files: `HostViews.java:configureShell/route`, `BrowserAdapter.java:create`, `controller.rs:open`, `crates/contracts/src/lib.rs:HostCommand::CreateView`, validators and HN manifest choices; `ServiceClient.java:execute` strings.

Pass the actual `Selection` into `CreateView` as a required shell selection, independent of `ExecutionContext.binding`. Choose `ownerSelection` when present for a detail opener; otherwise use actual selection. Remove `primary` fallback. Select local tabs by the complete source/page pair, not page ID alone. For choices use their normalized `sourceId`; do not send the current view's source ID when the choice targets another source. Show choices only when nonempty and in their intended root section, using the first declared choice as initial text until the URL matches. Use neutral “View”/“Choose view” accessibility language instead of “Feed”, and move HN choice source declarations into HN's manifest. Do not add host branches for HN IDs or domains.

Replace Saved-stories-specific service error text with generic service wording. Applet UI can continue to say Saved when translating its own errors. Keep standard icon names as a documented finite set; arbitrary icons/themes are outside this plan.

Change `controller.rs:classify_url` to use the selected source definition for source documents, rather than any source in the package. For packaged documents, only their declared local origin/path is a page. A plain web link to another source's origin opens ordinary reader content; it must not acquire app chrome with the previous source's bridge. Customized cross-source transitions use `sources.open`, a native section, or an explicit manifest choice, all of which create/select the destination source context. Keep redirects and POSTs in their actual browser flow; never turn a POST into a synthetic GET merely to change source. Reader return to the bound source retains current behavior. Document this deliberate policy rather than adding ambiguous implicit source selection when several sources share an origin.

Verification: type/package/Rust checks from root; Android assemble/lint from `android/`. On a temporary package with no source named `primary`, verify source tabs, local page selection, choice navigation to a different declared source, return from detail, and reader Close. Follow a plain link/redirect to the second source and confirm ordinary reader presentation; use `sources.open` and confirm the second entry/identity is bound. Verify HN's existing five-section flows still behave the same. Confirm a rejected out-of-origin choice cannot acquire a different source bridge. Commit `feat/(shell): support arbitrary applet source identities`.

### 5. Align document completion and refresh semantics

Files: `android/native/src/controller.rs`, `sources.rs` if shared lookup helpers belong there; SDK `runtime.ts`/`bootstrap.ts` only for documented focus refresh/disposal needs; update factory reference.

Introduce a helper to find a live document by generation across active and retained views, and verify document ID/channel plus applet identity where supplied. Use it for both `StorageCompleted` and `ServiceCompleted`. A completion from an evicted, retired, replaced, or failed document is ignored. A retained matching document may receive the result for a request submitted while active. Never redirect a reply to the currently visible document just because it has the same applet ID.

Storage changes may notify the active bound document of the same applet, even if the initiating view is different; retained documents refresh on focus. Explicitly document that this is not durable event delivery. Do not start accepting new PageMessage requests from hidden views or implement a background scheduler. Keep remote side-effect semantics: dropping a reply does not undo a write. Pending timers and phone suspension still bound delivery; callers reread on focus.

Verification: existing Rust checks, SDK typecheck, Android build/lint; use a delayed temporary storage/service operation, switch sections before completion, and confirm delivery only to its matching live document. Evict it and verify the late result cannot update a replacement. Return to a combined local page and verify focus refresh sees persisted records. Run the HN Saved/draft regression flows without posting. Commit `feat/(runtime): align retained document completions`.

### 6. Add bounded debug package storage and atomic replacement

Files: new Android `PackageStore.java`, modify `PackageAssets.java` to read through that store, `MainActivity.onCreate`, `BrowserAdapter` construction; new Rust JNI validation entry in `android/native/src/lib.rs` and Java `NativeBridge.java`; package envelope validation from step 2.

The store exposes APK assets and app-private immutable development revisions through the same verified asset reader. `MainActivity` builds an effective index before Attach. Release builds load bundled assets only and never examine development imports. No exported Activity, URL handler, network listener, or JavaScript install RPC is introduced.

Development transfer uses an app-private, one-time import envelope, bounded to 16 MiB encoded and 8 MiB decoded: `{requestId,action:"install",expectedCurrentRevision:string|null,intent:{replace:boolean,allowPermissionChange:boolean},formatVersion,runtimeApiVersion,sdkVersion,package,files:[{path,base64}]}`. `requestId` is a random UUID. Paths must be normalized relative paths matching the declared asset set exactly; reject duplicates, absolute paths, dot segments, backslashes, oversized files, invalid base64, extra files, and hash/revision mismatches. Validate through Rust before activation. Never extract an arbitrary archive. The host checks the expected revision and replacement/permission intent itself; a stale concurrent install fails without changing the active pointer.

Transaction states: receive → validate completely → write immutable candidate directory → atomically update registry pointer → restart/Attach → acknowledge accepted package revision. On validation/disk failure, leave the previous active pointer intact and report a bounded error. Use app-private AtomicFile-style registry replacement; discard partial staging after a crash. Keep current and previous revision per applet; delete older unreferenced revisions only after successful commit and never delete data/service settings. On startup, validate the pointed revision; fall back to its previous valid revision, then bundled version if available. A bad candidate must not prevent other applets launching.

For a new ID, explicit dev install registers it. For an existing ID with a different revision, require the CLI's `--replace` intent. Replacing a bundled ID creates a debug-only override; release continues to use the APK bundle. Reject a replacement that changes declared origins, services, or capabilities unless `--allow-permission-change` is supplied after the tool prints the exact diff. Changing data schema version away from 1 remains rejected. This local consent is a debug workflow, not a public publisher identity system. Keep IDs stable to retain existing storage/credentials; a completely new applet must use a new ID.

Write a private receipt `{requestId,ok,appletId?,revision?,error?:{code,message}}`; it reports package acceptance, not completed UI qualification or backend health. No token, full page URL, or source content goes into receipts. Explicit rollback selects the previous compatible revision without rewinding records; explain that data written by the newer revision remains. Disable/remove a dev override by selecting bundled/previous code, never by deleting user data automatically.

Use fixed app-private filenames `genesis-applet-import.json`, `genesis-applet-receipt.json`, and `genesis-applet-status.json`. Consume/delete the one-time import after processing and write receipt/status atomically. Status contains `{runtimeApiVersion:1,bundleFormatVersions:[1],debug:true,applets:[{id,revision,originKind,previousRevision,origins,capabilities,services}]}` from the effective validated registry. It includes manifest permissions for the CLI diff, never connection tokens. A rollback request uses `{requestId,action:"rollback",appletId,expectedCurrentRevision}` through the same one-time channel; reject missing/incompatible previous code. The CLI reads status with `adb run-as` before creating a request. A missing status file means an older/unsupported host, not permission to assume compatibility.

Verification: root Rust checks; `android/` debug and release assemble/lint. Manually feed malformed/oversized/hash-mismatched imports to debug and confirm existing HN/data still work. Confirm release ignores imports. Kill during staging and before/after registry swap to verify restart recovery. Verify a replaced applet cannot receive the previous document's replies. Install two different applet IDs and confirm separate storage/service identity. Commit `feat/(packages): load development applets without rebuilding host`.

### 7. Creator CLI installation, service management, and diagnostics

Files: `packages/applet-tools/src/{device,services,cli}.mjs`; refactor `tools/services.mjs` into a compatibility wrapper; private package receipt handling in Android as required by step 6.

Add `genesis-applet dev install <bundle-directory> --device <serial> [--replace] [--allow-permission-change]`, `dev status --device <serial>`, and `dev rollback <applet-id> --device <serial>`. Require explicit device selection, a debuggable compatible host, and supported bundle/runtime API versions. Push bytes only through adb to the app-private import using safe argument passing/stdin. Clear stale receipts, restart the host, and accept only a receipt with the matching request ID/revision. Time out after 15 seconds with an unknown-status error and a status/read-back instruction; do not blindly retry a replacement. Keep the host application ID configurable with a documented default of `app.nirvana.genesis`.

Expose `service start|status|stop|provision <applet-directory> --device <serial>` by reusing existing declaration/private-state logic, without applet-specific env names. Keep one local declared Node service for this iteration; multiple runtime services can be provisioned separately only when their declarations are explicit. Preserve existing private state location keyed by applet/service IDs. Canonicalize and validate all paths before launching a backend; show the entry that will run. Do not execute a backend as a side effect of `check`, `build`, `dev install`, or `status`.

Structured output for all commands: `{ok,command,result?,error?:{code,message}}`. Status includes versions, applet IDs/revisions, and package origin kind `bundled` or `development`, not secrets or private browsing history. This CLI is the future connector boundary; connectors can call it without editing host source. Do not add actual agent-specific integrations now.

Verification: `node --check`, type/package checks, temporary creator workspace CLI check/build/install into the unchanged prebuilt debug APK; update only applet text and reinstall, confirming APK checksum unchanged. Wrong device, non-debuggable host, incompatible API, stale receipt, permission increase, service auth failure, and lost adb connection produce distinct errors without deleting data. Verify service start/stop/restart with disposable applet data and a preserved database. Commit `feat/(creator): expose applet development commands`.

### 8. Export the creator kit and qualify the boundary

Files: `packages/applet-tools/src/{create,kit}.mjs`, new tool-owned templates, current `factory/` instructions/guides/skills, applet READMEs, root README, architecture and phase-3 operations. Add `create <directory> --id <id> --name <name> --source <https-url> [--react]` and `kit export --out <directory>`.

Create refuses a nonempty target. Emit manifest, independent tsconfig, CSS text declaration, scripts for `check`/`build`, exact SDK/tool dependencies, source entry, optional React page/dependencies, `.gitignore` for generated output/private state, applet README, and a root AGENTS forwarding to the copied factory kit. Do not auto-install dependencies, start services, or deploy. Templates use generic selectors only as clearly marked examples; they must not pretend to implement a user's website without inspection. Export copies portable guidance plus a machine-readable kit version/runtime API/SDK versions file. Internal platform links in the exported README are optional maintainer references or removed; no required instruction may depend on `.architecture`, `.plans`, `.skills`, or native source outside the kit.

From a directory outside Genesis, give an agent only the applet brief, generated project, kit, packed SDK/tools, and prebuilt debug host. Manually exercise a two-source applet with a combined page and local records. Choose two authorized public source sites at verification time and record exact routes/selectors, without making their content a platform dependency. Use temporary authoring/qualification directories, not new committed test files. The creator must check/build/load/update without reading Genesis source or invoking a native compiler. No new host code is allowed to satisfy this qualification application.

Run full existing checks once after integration. Re-qualify HN on the supported provider with existing account/data protections. Update documentation to mark only implemented commands as current and retain remaining release limits. Commit `feat/(factory): distribute and qualify the applet authoring kit`.

## Observable acceptance and rollout

- Existing HN behavior and IDs survive source relocation and APK update; bookmarks, drafts, website sessions, and service credentials are preserved. Inactive X/YouTube are preserved and remain explicitly unqualified.
- An external applet workspace imports only public packages, builds without Rust/Android installed, and loads/updates through a prebuilt debug host without changing the APK.
- One applet combines two separately declared websites and a local page using applet-owned records. It requires no source-specific host branch and no hidden DOM access.
- SDK/tool archives contain compiled code, types, templates, and matching guidance with no internal relative imports or secrets. The factory kit can guide a coding agent without prior Genesis context.
- Invalid/incompatible packages fail before replacing active code; debug replacements preserve data; release ignores the development channel. Update and rollback semantics are explicitly verified.
- HN-specific labels/protocols/selectors remain applet-owned. Native shell selection works with arbitrary source IDs and choice destinations. Completion identity is consistent across storage and service jobs.
- Each component records commands, results, manual evidence, limitations, and its commit. A build-only pass cannot satisfy device or external-creator acceptance.

Roll out with the bundled HN path as the default throughout. Add dev overrides only after immutable-store validation passes. Keep the previous compatible applet revision for manual rollback; a source rollback does not revert data. Do not uninstall Genesis, change application ID/signing, or delete private state to pass a check.

Release distribution remains gated on operator signing, a production service credential lifecycle, and an explicit publisher/installation trust model before accepting untrusted packages. That gate does not block the scoped debug framework work and must remain visible in final documentation. Runtime resource bounds, source-site compatibility, and malicious-code isolation require their own evidence; this plan makes no universal claims.

## Supporting guidance and risks

Use [platform ownership](../../../.architecture/platform.md), [browser runtime](../../../.architecture/browser-runtime.md), [services/data](../../../.architecture/services-and-data.md), and [factory API reference](../../../factory/guides/sdk-reference.md). Historical evidence: [emulator implementation report](../../../.reports/phase-2/2026-10-29/202706-genesis-seamless-implementation-verification.md) and [phone verification](../../../.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md). Their build/provider limits remain intact.

Risks: duplicated JS/Rust manifest validation can drift; compare invalid and valid temporary inputs at the host gate. External package resolution may reveal hidden monorepo imports; inspect packed archives and build outside the repository. Development ID overrides reuse data identity by design; require explicit replacement and permission-change intent. File moves can break Gradle invalidation and backend PID ownership checks; stop/restart managed services deliberately and verify unchanged data locations. Website DOM and phone suspension remain variable, so source/retention qualification cannot be replaced by typechecking.

No implementation-blocking product choice remains for this scoped plan. Registry publication credentials, production publisher identity, and actual connector APIs are deliberately outside it. If a later decision changes this scope or the contract, update the affected steps and changelog before implementing them.

## Implementation progress

- 30 October: user authorized all components and a commit at each significant step. Documentation checkpoint committed as `429cb4f`. Existing worktree relocation/configuration was preserved and verified as component 1.

- Component 2 completed: packed SDK 0.2.0 and runtime API 1 contract, with semantic validation separated from readApplet filesystem checks. Canonical hash verification is performed by the Android host store using MessageDigest; Rust remains the independent shape/policy validator.

- Component 3 completed: standalone check/build/readBundle and shared APK bundling passed external DOM/React artifact qualification and Android build/lint.
