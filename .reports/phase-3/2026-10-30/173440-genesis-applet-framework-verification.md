# Genesis applet framework implementation and verification

Project: Genesis, phase-3, 30 October 2026, Asia/Kolkata. Scope: the platform/applet separation plan and its associated maintenance and agent guidance. The user authorized implementation after committing the documentation checkpoint.

## Delivered behavior

Applets now live under factory/applets, consume SDK 0.2.0 public exports, and build through the same standalone validator/packager used by the APK build. Genesis owns Android/Rust integration, public capabilities, and creator tooling. Applets own website adapters, UI, application records, and optional backends.

The SDK packs ESM JavaScript and declarations. The creator CLI provides create, check, build, dev install/status/rollback, service start/status/stop/provision, and kit export. An applet workspace can be created, built, updated, and rolled back without Genesis source or native compilers. Packed dependencies and a compatible prebuilt debug host are required; public registry publication and production package installation were not added.

The host uses explicit source/page selection, source-bound route presentation, generic choices/errors, and matching retained-document completion rules. Development packages use an app-private immutable store, independent Rust policy validation, byte/hash/version checks, atomic registry selection, expected-revision matching, explicit replacement/permission intent, and previous-code recovery. Release builds ignore development imports/registry. Code replacement and rollback do not delete application records or service credentials.

## Component commits

| Commit | Component |
| --- | --- |
| 429cb4f | Documentation and agent-guidance checkpoint, committed before runtime work |
| fe6752d | Factory example workspace and explicit APK selection |
| 6142bbf | Distributable SDK and versioned package contracts |
| 292969e | Standalone checking/bundling shared with APK assembly |
| 3d862d0 | Generic source identities, shell destinations, and bound-source presentation |
| 7e620b6 | Retained document completion consistency |
| 6abdef1 | Private development package store and parallel SDK-build fix |
| 01cf801 | Creator device/service commands |
| Commit containing this report | Project creation, kit export, current documentation, and final qualification |

Component decisions and check outcomes are recorded in [.changelog](../../../.changelog/phase-3/2026-10-30). The [implementation plan](../../../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) and [maintenance guide](../../../.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md) reflect the delivered framework. Initial documentation changelogs remain historical context with links to this outcome.

## Static and artifact checks

- Pinned Node 24.15.0/npm 11.14.1 were used for final packaging. Existing npm dependencies were resolved offline. Workspace typechecks, package validation, all creator script syntax checks, and git diff --check passed.
- Rust formatting, workspace check, strict clippy, and existing workspace tests passed. The workspace reports zero Rust unit/doc test cases; this is not regression-test coverage. No test files were added or modified.
- Debug and release assembly/lint passed with the installed Android toolchain. Debug lint reports zero errors and 32 warnings. Parallel variants initially exposed shared SDK output recreation; the builder now serializes/caches artifact preparation, and both variants then passed together.
- SDK/tools archives were installed into an independent temporary directory. DOM and React entries built from public exports with no Cargo/Android compiler on PATH. Repeated HN builds produced identical revisions. Both SDK package exports and its declaration consumer typechecked outside the repository.
- Client-side negative checks rejected symlink escape, unsafe paths, unknown fields/capabilities, duplicate actions, undeclared files, source-directory output, nonempty create targets, and a missing default entry export. Final exported-kit links/JSON/fences and skill metadata were checked. No required kit instruction depends on native source or internal plans.

## Emulator and data qualification

Device: emulator-5554, sdk_gphone64_arm64, API 37, arm64-v8a, Android System WebView 156.0.8078.47. APK updates used the existing application ID and debug key. No app uninstall, device database reset, upstream posting, vote, or account mutation was used.

| Flow | Observed outcome |
| --- | --- |
| Independent development import | A DOM/React applet built outside the repository was accepted into the prebuilt host without changing its APK. |
| Host rejection | Corrupted asset bytes, duplicate files, oversized assets, unsupported runtime API, and duplicate action IDs were rejected before replacing active code. |
| Update consent | Missing replacement intent, changed permissions without explicit intent, and stale expected revisions were rejected. |
| Update/rollback | CLI update and rollback acknowledged matching request/revision identities. Existing code remained available after rejected imports. |
| Startup recovery | Corrupt current development asset bytes fell back to the previous valid revision. Partial staging from an interrupted-write simulation was removed at restart. |
| Hybrid app | A generated independent React workspace was adapted using only public SDK calls. Sources python and rust read actual document titles at www.python.org and rust-lang.org, captured applet-local records, and displayed both in a combined page. Neither source ID is primary. |
| Native choice/section ownership | Source tabs, local Saved selection, and a native header choice targeting the Rust source used their declared identities. |
| Source/reader boundary | Explicit sources.open changed customization context. An ordinary cross-source link opened a reader with its actual origin and no applet capture UI. Close restored the Python opener. |
| Refresh and persistence | Focus refresh reread both captures; code update and rollback preserved the records. The same applet ID retained its records through debug/release/debug installation. |
| Namespace separation | A second applet ID with identical source/page code read zero captures while the first retained two. |
| Release exclusion | A temporary copy of the release APK signed with the existing debug verification key showed only bundled HN and refused run-as. Restoring debug recovered development applets and records. This is not production signing. |
| Services | Standalone start/status/stop and restart worked with the HN declaration. Authenticated HTTPS health succeeded from Android; private files and database persisted. Unavailable devices produced a distinct error. |
| HN regression | Native five-section shell and bookmark controls rendered. A new disposable Genesis bookmark was saved and read in Saved, then removed. The original saved story and categories remained. No HN story, comment, vote, or account change occurred. |
| Retained completions | A temporary executable using the actual Rust reducer accepted matching retained storage/service completions and rejected wrong-document and evicted completions. |

The external workflow reused one debug APK with SHA-256 da75c66d28898161cdd9006aa58a73f267671d8cf950f5cfcbbac50995fb5d54, verified unchanged after source build/install/update checks. The hybrid applet's original revision was a6d4ce367c1150276803e85d9ff4df82fcb4158d4eece099986a6a5b579e7e69; the code update was 12b383e498e6b7b6c9c22b5a668d263b33f81cac27398a310ba6957345e03415. These are integrity IDs, not publisher signatures.

[Combined captures screenshot](genesis-framework-evidence/combined-captures.png) shows the two source titles and native Saved selection. It establishes final layout/data for that run, not absence of every transition-frame defect. Temporary qualification applets remain identifiable in the emulator for inspection; their sources are outside the repository. The HN verification bookmark was removed and HN Home restored.

## Distribution artifacts

Generated files, excluded from Git, are under target/creator/0.2.0:

- `genesis-applet-tools-0.2.0.tgz`, SHA-256 `55a958004a10ad8aa93e5ab2b29488c987cf4aabde4be8325108314287512161`.
- `genesis-sdk-0.2.0.tgz`, SHA-256 `296131305c8250446f344e47c1d419040af53e4280fc5c9edf0c15f23cfb5d4d`.

The matching portable guidance is in target/creator/0.2.0/factory. The prebuilt debug host is android/app/build/outputs/apk/debug/app-debug.apk. Packages were packed locally; no public registry publication, production deployment, or release key change occurred.

## Limits and remaining release work

Production publisher trust/signatures, public distribution, release credential enrollment, agent-specific connectors, phone backend execution, and a persistent background coordinator remain outside the plan's delivered scope. The release artifact remains unsigned for production. Actual signing/TLS credentials stay operator-owned.

This run qualifies one emulator/provider plus independent packaging. It does not rerun the entire historical physical-phone, accessibility, network, renderer, and route matrix. Exact power-loss injection at every atomic registry boundary was not performed; restart recovery was exercised with partial staging and corrupted current bytes. Arbitrary backend write retries remain applet-owned. Retained request deadlines still apply, and remote writes may finish after view retirement. New public-package acceptance does not establish safety of malicious DOM-capable applets.

## Material implementation decisions

The existing framework was retained; no renderer rewrite or HN business logic moved into Rust. Semantic manifest validation is pure, while readApplet owns filesystem checks. Java MessageDigest verifies canonical identities/bytes after independent Rust shape/policy validation, avoiding a new Rust hashing dependency. Source-specific runtime checks were deferred to development-package qualification so the selected APK bundle stayed HN. Factory guides are exported with the tools and use the independent creator workflow; internal plans remain maintainer context only.
