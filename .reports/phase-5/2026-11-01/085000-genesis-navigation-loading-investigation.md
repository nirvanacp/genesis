# Genesis navigation loading investigation

Status: root cause reproduced; implementation is not part of this investigation. Project: X applet, Genesis SDK/Android lifecycle and portable factory. Phase: `phase-5` from `proto/phase-5`. Investigated 1 November 2026, Asia/Kolkata. See the [implementation plan](../../../.plans/phase-5/2026-11-01/085000-genesis-navigation-loading-plan.md).

## Finding

The reproduced Retry flash is a false unsupported state rendered by the owned X applet. It is not the hidden website bleeding through a missing overlay. X's HTML document can finish loading before its React content column exists. The adapter treats that normal interval as unsupported, and the foreground immediately replaces its skeleton with website/retry recovery. Subsequent observations restore loading and then content without user action.

The same symptom can also represent a genuine failure. Temporarily taking the emulator offline produced an actual upstream Retry control and an `error` snapshot. Error recovery must remain available for that case; hiding every error behind a loader would be incorrect.

## Reproduction and evidence

Device: `emulator-5554`, Android host `app.nirvana.genesis`, Google WebView `156.0.8078.47`. Code baseline `ccfb8cc`; installed X revision `b39d065819e075dcf7b702f0edc89e0048e5e04c9e3ab6c371d87ccddd156c13`, SDK/tools 0.4.0, runtime API 3. No application code or installed packages were changed. The existing authenticated session was used; no credentials were entered or recorded.

User-authorized ADB taps drove the actual app. The supported Developer tools inspector supplied read-only source DOM facts and owned state. Sampling attempted every 100ms, with variable CDP latency. Source inspection selected the top-level frame explicitly, excluding X's blank child frames. Initial exploratory traces that accidentally inspected a child frame were discarded. React fiber state can lag the committed DOM; the visible Retry/loader predicates and recording establish presentation, rather than treating those state reads as exact broker timestamps.

| Actual journey | Observed result | Evidence |
| --- | --- | --- |
| Profile, Following, a public profile | False Retry recovery, then automatic success | [First trace](085000-genesis-loading-evidence/profile.jsonl) |
| Back to Following, same public profile | Reproduced again and visibly recorded | [Repeat trace](085000-genesis-loading-evidence/profile-repeat.jsonl), [recovery frame](085000-genesis-loading-evidence/false-recovery.png) |
| Explore, type `design`, submit Search | Same false unsupported/Retry flash before results | [Search trace](085000-genesis-loading-evidence/search.jsonl) |
| Public profile, post detail | Loading then content, no false recovery sampled in this run | [Post trace](085000-genesis-loading-evidence/post.jsonl) |
| Profile refresh; Profile to Following | Loading then success, no false recovery sampled | [Refresh](085000-genesis-loading-evidence/profile-refresh.jsonl), [Following](085000-genesis-loading-evidence/following.jsonl) |
| Offline refresh, restore connectivity, refresh | Real upstream error, then online recovery | [Offline](085000-genesis-loading-evidence/offline.jsonl), [recovery](085000-genesis-loading-evidence/online-recovery.jsonl) |

The repeat profile run recorded this sequence relative to the observer's start:

| Time | Hidden source | Owned foreground |
| --- | --- | --- |
| 6.301s | New profile navigation | Loading |
| 7.187s | Document complete; no primary column, profile, sign-out or error marker | Next sample shows unsupported |
| 7.189s | Content not ready | "Continue on the website", Open website and Retry |
| 7.681s | Primary column and progress indicator appear | Recovery remains briefly |
| 8.360s | Profile header exists; posts still loading | Loading again |
| 9.130s | Valid profile | Ready; no retry was pressed |

A local screen recording sampled at four frames per second shows the false recovery for roughly one second between the two loading periods. Search independently showed a complete document without a primary column, Retry at 3.431s, loading again around 4.146s and results at 6.674s. This establishes an intermittent timing bug across two route families, not that every navigation fails. No source error marker or signed-out marker was observed during these false-recovery intervals. Successful loading without retry is also evidence against a terminal source failure in those runs.

The offline control produced `error.message = "Retry"` with an actual upstream error marker. This was a source-site error under loss of connectivity, not proof that Android's main-frame network callback fired. Connectivity was restored to its original Wi-Fi/mobile-data settings in a `finally` block, and a subsequent refresh loaded the profile.

## Ownership and causal chain

| Component | Current behavior | Consequence |
| --- | --- | --- |
| [X adapter](../../../factory/applets/x.com/src/main.tsx), `publish`, line 41 | Missing `primaryColumn` plus `document.readyState === 'complete'` publishes `unsupported` | Direct cause reproduced in profile and search |
| Same adapter, final state selection | No extracted content and no observed progressbar defaults to `unsupported` | A second premature-failure path during gaps between DOM updates; code-confirmed, not separately isolated live |
| [X foreground](../../../factory/applets/x.com/src/app.tsx), lines 91–100 | All nonloading, nonready states immediately render recovery; any structurally valid model plus `error` counts as ready | Displays false recovery immediately; an empty model shell can also produce misleading "Could not refresh" copy |
| [Rust broker](../../../android/native/src/isolated.rs), `source.publish` | Relays the adapter's state without a reason or distinction between absent content and failed extraction | Correctly transports the wrong applet decision; cannot infer website semantics |
| [SDK bootstrap](../../../packages/sdk/src/bootstrap.ts), `activate` | Source adapters also await `initialLayout`, which waits two animation frames; startup timer begins at hello before body readiness | Independent code-confirmed risk for deliberately occluded or slow sources. Not the cause established by the roughly one-second flashes |
| Rust `runtime.error` source branch | Converts adapter startup/runtime failure into reasonless `unsupported` | Framework failures become indistinguishable from unsupported content |
| [Android source timeout](../../../android/app/src/main/java/app/nirvana/genesis/IsolatedBrowser.java) and Rust timeout branch | One 15-second timer per source creation; fires only if current snapshot is loading | No general deadline for later same-document loading; an early unsupported state bypasses the pending-load deadline |
| [HN adapter](../../../factory/applets/news.ycombinator.com/src/main.ts) | Missing anchors can also publish unsupported immediately | Similar authoring pattern, found statically; no claim of a live HN flash in this task |
| [Factory starter](../../../packages/applet-tools/src/create.mjs) and guides | Enumerate states and demonstrate immediate unsupported publication, without enough guidance on incomplete SPA observations | Future authors can repeat the same mistake |

[AppletPresentation](../../../android/app/src/main/java/app/nirvana/genesis/AppletPresentation.java) retains a permanent opaque barrier over the source. The recorded recovery text exactly matches X's foreground branch. The native foreground-failure screen has different text and actions. No evidence points to z-index, transparency or missing source occlusion as the cause of these reproductions. This is not a new comprehensive frame/accessibility/audio isolation qualification.

## Recommended scope

Fix the applet's semantic decision first, supported by a general lifecycle contract: incomplete observation means loading, affirmative evidence determines ready/empty/auth/error, and a bounded unresolved load ends with an honest timeout. Preserve valid partial screens and account-safe prior content when applicable. Do not add arbitrary error delays, automatic website handoffs or automatic mutation retries.

The platform should own bounded loading and distinguish transport, adapter and route failures. The SDK should not wait for display frames in a hidden source. Website-specific readiness and account evidence remain applet-owned. Factory examples, skills and acceptance instructions must teach that boundary and require recording transitions, not just checking settled screenshots. No universal framework selector or website readiness detector is justified.

## Limits and cleanup

No code fix, new tests, package update or production deployment was performed. No social/account action, category write, data reset or backend startup was performed. Source network requests were not exhaustively logged, so unrelated subresource errors are not ruled out. Cold-start timing, deterministic slow-network conditions, changed markup, auth/challenges, TalkBack and physical devices remain implementation acceptance work. Existing settled-page verification did not establish transition correctness.

Saved traces contain route templates, state names, structural booleans and counts only; account handles, post IDs, query contents and page bodies are omitted. The retained screenshot contains only generic recovery UI. Full recordings remain temporary local diagnostics. The cleanup command succeeded: task-created device recordings/dumps and the local inspector forward were removed, the applet was exited to disable inspection, and X was reopened. The additional settled Home-screen check was not executed because automatic approval review hit a usage limit. This review failure did not classify the action as unsafe. No backend tunnel or persistent records were removed.
