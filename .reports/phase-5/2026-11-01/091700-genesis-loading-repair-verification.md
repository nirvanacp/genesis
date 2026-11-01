# Genesis loading repair verification

The reproduced X Retry flash is repaired. Normal incomplete SPA markup stays loading until valid content arrives. Genuine failures retain recovery. The SDK, host and factory changes in the [implementation plan](../../../.plans/phase-5/2026-11-01/085000-genesis-navigation-loading-plan.md) are implemented; this report distinguishes targeted verification from remaining qualification limits.

## Installed delivery

Verified on `emulator-5554`, `app.nirvana.genesis`, Google WebView 156.0.8078.47. SDK/tools/portable kit are 0.4.1, runtime API 3, manifest schema 2, bundle format 1. X revision is `07f2dc98c7dbff78bb15c6ee8288a1fa001b35198acdfab65920976a7cce19ea`; HN is `7a500c9587d5d4ee3fb0643446477f71f69c42e1ef326b1b282775f492a17bc7`. Both were installed through supported replacement, preserving their identities and stores. HN remains selected for APK bundling. Existing hidden diagnostic packages were preserved; no new launcher app or fixture was installed.

The final APK was rebuilt and installed after the matched 0.4.1 bundle/creator checks. The five-cycle profile/search repetitions used these final applet revisions and the same native implementation before that bundled-asset-only rebuild. Re-entry, offline recovery, neighboring applet and native failure checks used the rebuilt final APK. No backend was started/reset and no account/social/category write was submitted.

## Changes and evidence

X previously published unsupported when a complete HTML document lacked `primaryColumn`. It now publishes loading for incomplete recognized content, validates focused destination content and avoids treating empty model shells as successful stale content. Search keeps its input during loading. Source Retry is separate from website presentation. HN adopts the same missing-markup rule.

Hidden source activation no longer waits for animation frames. Host-issued content deadlines cannot be extended by repeated loading; tokens reject retired callbacks, suspension preserves remaining time, and late valid results can recover. Source exceptions now report ADAPTER_FAILED and revoke their binding. Fixed problem codes and host-assigned provenance distinguish failures. Debug inspection holds at most 64 source transitions without content/URLs. Portable guides, skills and both starter variants teach these semantics.

| Check | Result and evidence |
| --- | --- |
| Five public-profile/Back cycles | Passed. UI controls confirmed every arrival/return. Source traces include complete documents without primary content while the owned UI remains loading, then ready. No sampled Retry/unsupported recovery. [Initial recording window](091400-genesis-loading-evidence/profile-repeat-final.jsonl), [remaining cycles](091400-genesis-loading-evidence/more-profiles.jsonl). |
| Five typed-search/result/Back cycles | Passed. All five search epochs reached ready and returned to Explore. No sampled recovery. [Search window](091400-genesis-loading-evidence/search-final.jsonl). |
| Recorded profile transitions | A 55-second recording was inspected as a two-frame-per-second contact sheet. Sampled frames show skeletons/content and no false recovery. [Generic loading frame](091400-genesis-loading-evidence/loading-without-recovery.png) excludes account/feed contents. This does not establish absence of every single-frame artifact. |
| Actual offline error and source Retry | Passed. Temporarily disabled Wi-Fi/mobile data, reached a genuine error, observed the refresh control released, restored original settings in finally, and used Retry to recover online. The fixed upstream failure copy replaced the old bare "Retry" message. [Trace](091400-genesis-loading-evidence/offline-final.jsonl). |
| Emulator latency probe | Loading then ready, no recovery. A requested 10,000ms emulator latency did not actually keep this source path pending beyond a few seconds, so it does not qualify a stalled network or device timeout. Original zero latency/unlimited speed restored. [Probe](091400-genesis-loading-evidence/latency-probe.jsonl). |
| X re-entry and sections | Final APK re-entry, Explore, Saved/Categories, Notifications/Mentions and Home controls passed. This qualifies entry/return, not every notification/category row or write. |
| Refresh and protected website return | Pull advanced the source epoch to ready. Back dismissed the post menu after refresh. Account settings opened through the website provider; native Close returned to the applet. No form was edited or submitted. |
| Foreground failure | Existing Simulate creator failure produced native recovery; Retry restored X. Source failure remains separate from foreground failure. |
| HN shared-host smoke | Feed rows, Saved/Home/Me navigation, comments/Discussion/Back and external article/Close passed on final APK. HN Search remains its existing placeholder. |
| SDK component harness | With substituted scope/runtime/RPC dependencies, withheld frames and deferred body readiness, source activation completed without frames while foreground waited. Deliberate adapter throw reported failure; retired activation did not become ready. |
| Reducer component harness | Copied current reducer source into a temporary executable with real route resolution and stubbed package/storage validation. Passed deadline deduplication/invalidation, pause/resume, stale-token rejection, timeout, loading suppression after error, later ready recovery, ADAPTER_FAILED binding revocation and 64-entry diagnostics bound. This is component evidence, not device transport qualification. |
| Model component checks | Empty shell is not content; a different profile/post does not match the requested destination. |
| Creator artifacts | Packed SDK/tools 0.4.1, then created/checked/built React and vanilla applets using extracted archives. Portable guide/skill links resolve; packed loading guide matches factory source. No scaffold was installed on the everyday device. |

The search observer remained running after the five cycles and later captured the deliberate offline control. The saved search evidence is explicitly restricted to its first 80 seconds, which contains all five successful search epochs; the separate offline trace records the real failure. Do not treat the later deliberate failure as a normal-navigation regression or omit it from failure qualification.

State sampling attempted every 100ms with variable CDP latency. Read-only inspection selected top-level source frames. React state can lag committed DOM, so visible Retry/heading predicates and recordings qualify presentation separately. Persisted traces replace profile/account paths with templates and omit query values, post IDs, bodies, credentials and tokens. Full recordings and component harnesses remain temporary local diagnostics.

## Static checks and commits

Passed full workspace typecheck, selected-package checks, standalone X/HN check/build, Rust clippy with warnings denied, offline Android assembleDebug/lintDebug, tools syntax, archive creator checks, local guide links and whitespace checks. Cargo test compiled successfully with zero unit cases; it supplies no behavioral coverage. No repository test file was added or modified.

Component commits are `49964fc` SDK, `900eda6` host, `19b5d68` X, `33c0bae` HN, `9b2a93b` factory/artifacts, and `f645fe8` archive-example correction. The final documentation commit records this acceptance and current guidance.

## Limits

A deterministic stalled source on the real Android transport, actual HTTP status/renderer-source failure, signed-out/challenge transitions, changed third-party markup, full account switching, backend failure/conflict/write flows, TalkBack, physical devices and new large-text/dark/reduced-motion checks were not qualified in this repair. Source timeout/adapter-failure ordering is component-qualified as described above. Prior design/accessibility/playback limits from the [UX repair report](065059-x-ux-repair-verification.md) still apply. Existing data was not reset or rewritten, but this is not a byte-for-byte database integrity audit.

The repaired profile/search cases have repeated integrated evidence. Broader acceptance rows in the plan remain qualification work where this report states a limit; no claim is made of complete X parity or the absence of every possible bug. Android UIAutomator occasionally returned a null root; the helper retried this tool failure separately from app behavior.

## Cleanup

Final cleanup status is recorded in the [acceptance change record](../../../.changelog/phase-5/2026-11-01/091700-genesis-loading-repair-acceptance.md). Original Wi-Fi/mobile-data settings and zero emulator network latency were restored. Task device recordings/dumps and the local inspector forward were removed. Inspection was exited through the launcher, X reopened, and its native Home control verified. Backend tunnels and existing records were preserved.
