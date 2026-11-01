# Explicit navigation delivery and verification

Genesis phase-5 implementation, 1 November 2026, Asia/Kolkata. Governing plan: [explicit navigation architecture](../../../.plans/phase-5/2026-11-01/101616-genesis-explicit-navigation-architecture-plan.md). Original failure: [X handoff investigation](100125-x-applet-website-handoff-investigation.md).

## Delivered behavior

Schema 3/API 4, SDK/tools/kit 0.5.0 supply one host-owned decision for custom content, local pages, declared original-site workflows, uncovered internal URLs, external websites and blocked destinations. Website actions reference existing custom route IDs so browsing a post and opening its original controls are distinct intents. The host recomputes activation, rejects stale decisions and direct API-4 provider opens, resolves other declared source origins internally, and keeps unsupported/passive source navigation behind native recovery.

X and HN migrated without changing applet/source/page/service identities or backend data. X no longer uses a separate pathname presentation router. Its Subs tab stays custom and displays the actual subscription gate with an explicit original-site action. Show more opens custom detail; remaining excerpts have a separate website link. HN no longer maintains a second form-path list or opens the website because an owned comment anchor is absent. Website links carry cues, and native Website chrome has a separate Return action from website history Back.

Website sessions preserve exact-current source adoption, bridge retirement, forms and existing dirty-field handling. Entered website navigation stays website navigation. Recovery Back restores/revalidates a retired custom source. Recovery suppresses background foreground accessibility descendants. Existing API-3 packages retain their execution behavior. Inactive YouTube was not migrated or activated.

## Artifacts and device

Device: existing authenticated emulator-5554, Android 17, Google Android WebView 156.0.8078.47, app.nirvana.genesis. No physical-device qualification was available in this task.

| Artifact | Exact delivered identity |
| --- | --- |
| Debug APK SHA-256 | `b816f8c2f557a689d82aef8df7773dd05391278760165c8be37759e5b3f61000` |
| X development revision | `632b5534604bded8228e5b0f8352643b53c80fb119fa97f5a7e8af5f76b30683` |
| HN development revision | `343cdfcaf09b25b39c7762786b29358c4d87d18ffc5ca9606d0ada3466f24d1e` |
| SDK/tools/kit | 0.5.0; manifest schema 3; runtime API 4; bundle format 1; data schema 1 |

The final host and both applets were installed in place. HN remains APK-selected, but device status identified a pre-existing development override, which was updated to the final migrated HN revision. The APK was also rebuilt from migrated HN source. X remains development-installed. Pre-existing hidden qualification applets were left hidden and unchanged. No new diagnostic applet was installed.

Local packed creator archives are under `/tmp/genesis-navigation-release/`; final applet packages are `/tmp/genesis-x-navigation` and `/tmp/genesis-hn-navigation`. These are temporary local delivery artifacts, not published registry packages. SDK and tools archives installed offline into external disposable workspaces using cached dependencies. No dev server/backend was started.

## Verification results

| Check | Evidence and result |
| --- | --- |
| Shared classifier parity | Passed 17 actual Rust/JS decisions in an out-of-tree executable. Covered custom, external HTTPS/HTTP, uncovered, page, explicit action, wrong action/source, blocked origin, credentials, bad schemes, encoded separators and duplicate constrained query. Invalid action references, default source and origin collisions rejected. |
| Host bound RPC | Passed actual reducer document hello/challenge binding, resolve response, stale activation rejection and `USE_DECLARED_NAVIGATION` rejection. This is component evidence, not a browser click or account test. |
| Native recovery lifecycle | Passed actual reducer unknown link → recovery, expired Continue rejection, explicit Continue → provider, blocked provider destination, provider Close → recovery and Back dismissal. Storage was excluded from this disposable harness. |
| SDK lifetime | Passed executable batching/deduplication, version invalidation and disposal checks. No permanent test files were added. |
| Existing API-3 compatibility | Original X/HN opened under owned chrome on the compatible host before migration; HN source content observed. Tools still built schema-2/API-3 X with SDK 0.5.0. Old physical host rejection/rollback was not requalified live. |
| X original reproduction | Passed real public profile Replies → Subs on the final artifact. Subs remains selected in the packaged foreground; the actual source showed “Unlock more with Subscriptions”, zero posts and selected `/subs`. Owned gate and explicit website cue were observed. No independent reader was created by ordinary Subs navigation. |
| X explicit gate handoff/Return | Passed marked subscription website entry without submitting a subscription; native Return restored owned Subs/gate after source revalidation on final artifact. |
| X neighboring reading | Replies/Subs transitions exercised; custom Media was also checked during the investigation/migration. Final-artifact complete Posts/Reposts/Media and all profile variations were not swept again. |
| X Show more/full-text | Implementation and typecheck verified. A live long-post excerpt/data-completion case was not qualified. |
| HN connected journey | Passed actual feed with 30 stories → custom discussion with 100 comments → marked external article → native Return restoring Discussion. |
| HN final unknown route | Passed passive source navigation to an uncovered internal URL on the final artifact. Native recovery showed Back/Continue without exposing source content. Back recreated the source and restored 30 actual feed stories. Accessibility dump shrank to the recovery/shell hierarchy with background foreground descendants suppressed; this is not a TalkBack qualification. |
| HN fragments and library links | Static check/build verified missing-fragment custom permalink fallback and policy-resolved Saved links. Live missing-window-comment and Saved/backend acceptance not repeated. |
| React/vanilla creator workflows | Passed generated check/build in disposable workspaces. Packed SDK/tools installed offline outside the monorepo; both variants checked/built. The final packed tools also created and built a fresh React starter with declared original-page recovery. No repository-source imports were needed. |
| Portable factory | Exported navigation guide matched maintained factory bytes. Local Markdown links and examples/source signatures checked. Build/customize/verify skills and current architecture/maintenance guidance updated. AGENTS unchanged. |
| Static/native builds | Workspace TypeScript, selected-package check, applet check/build, tools syntax, Cargo check/Clippy with warnings denied, workspace Cargo tests, offline Android assembleDebug/lintDebug and whitespace checks passed. Existing Rust targets contain zero unit tests, so their result supplies compilation rather than behavioral coverage. |

The AST diagnostic initially used the removed TypeScript compiler API and the first vanilla template omitted an import. Generated-flow verification found both; they were corrected using the pinned TypeScript 7 API before component handoff. Package packing first encountered cache sandbox access; an isolated temporary cache and then authorized offline cached dependency installation completed the creator checks. No system cache permissions were changed.

## Limits and remaining qualification

Implementation is delivered, with the following acceptance cases not independently exercised on the final device build: every modified-click/target-blank/script navigation variation; multi-source live transitions; every source-command URL transition; all query/hash combinations; signed-out/challenge/subscriber-authorized content; true dirty-form Stay/Leave with entered data; offline/loading deadline stress; renderer death behind a provider; physical-device lifecycle; 200% text/narrow/dark layout sweep; TalkBack/keyboard; actual protected media playback; and old-host install/rollback. Existing session/isolation code was preserved, but this task does not claim fresh device qualification for those branches. No paid, social, message, account or backend mutations were submitted merely to test routing.

The generic `original-x` and `original-hn` actions deliberately open original pages rather than automating individual operations. They apply only to declared custom route IDs and are presented with visible website cues. A source route match still does not prove content validity. This navigation policy does not establish malicious-author isolation or full outbound network confinement.

Recordings were not captured for the final pass; inspection and accessibility snapshots establish observed states and actions, not absence of every one-frame artifact. Full UI dumps and inspector scratch files stayed in temporary local storage and were not committed. Task device UI dumps and adb forwarding were removed; Return to Genesis ended visit-scoped inspection. Existing backend tunnels and user records were preserved.

## Commits

Component commits: `15d4204` contracts; `f96bd99` host; `8622b95` SDK; `ccb639a` tools; `8d691e4` source metadata/subscriptions; `e200176` X; `8cacd0c` HN; `ddf705c` / `e071229` stale controls/context; `6e24c50` factory/architecture; `3afae0a` recovery source restoration; `2b80292` starter original-page action. The final release record/lockfile commit follows this report.
