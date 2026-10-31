# X folder fallback completion and lifecycle repair

Project: `factory/applets/x.com`, with a separate generic Genesis navigation component where required. Phase: `phase-4`, branch `proto/phase-4`. Created 31 October 2026, 12:53:55 Asia/Kolkata. Status: diagnostic and implementation plan, no code fixes in this task.

This document updates the [original adaptive-folder plan](120656-x-adaptive-bookmark-folders-plan.md). Its data authority, account isolation, receipt reconciliation and tier-transition requirements remain current. The investigation below supersedes its conclusion that no folder entry could be qualified. Its stages 2 and 3 are partly implemented; do not rewrite them from scratch or call the feature complete because their checks passed.

## What is broken and why

The user wants X folders to remain native when available, and the applet's independent categories to take over the same folder intent when X requires a subscription. Pressing ordinary Bookmark should remain an X bookmark operation. Pressing its Add to Folder action must organize that exact post, even for an account denied native folders.

The current integration does not do that:

1. `src/main.tsx` activates `watchAccount`, `sourceNavigation` and `postControls`. Nothing imports or activates `folderController`. `src/folder-source.ts` does not exist.
2. `post-controls.ts` adds a separate Save to category button. It does not intercept, replace or observe X's Add to Folder action. The separate custom service is not evidence that the source action routes there.
3. In the emulator, bookmarking an initially unsaved disposable post produced `[data-testid="toast"][role="alert"]`. Inside it, the actionable element was a real `<button role="button">` whose span reads `Add to Folder`. The button had no test ID and no `href`. Generated classes are not stable selectors.
4. Clicking that exact control navigated from `https://x.com/home` to `https://x.com/i/verified-get-verified`, matching the Premium symptom reported by the user. This proves the source action's route; no purchase, subscription change or native folder save was attempted. The destination's detailed heading/close-button structure was not captured because an approval-review outage interrupted that inspection.
5. The actual route is absent from customized coverage. It is not the `/i/premium_sign_up` path emphasized in the original plan. Same-source ordinary presentation retires the customization binding. `navigation.onChange` is an after-navigation notification; it cannot promise a cancellable handoff before retirement.
6. Installed revision `6b7e842e450cb2836cd35052fb9d7be43b635792002a776898566a8326bafa52` predates the partial build `80bbbfb286dd1df5693c4ae462723f5c2c9a674c7decf41f2108b3704b8dc604`, which was never installed. Even installing that build would not deliver fallback because it lacks the adapter.

The failure is missing end-to-end integration and delivery. This investigation does not establish a custom backend failure. It did not exercise a custom category write. The earlier inspection only visited Saved and missed the transient post-save action shown in the user's screenshot. Correct that qualification process rather than guessing a selector from the Saved page.

Cleanup completed after the review service recovered: returned from Premium, removed only the initially unsaved diagnostic bookmark, read back `bookmark` present and `removeBookmark` absent, and removed temporary CDP forwarding.

## Scope, requirements and authorities

Preserve stable applet ID `x-bookmarks`, the five native sections, X login/social actions, ordinary bookmarks, existing category records and the neighboring HN applet. The custom backend remains the authority for applet categories; X remains the authority for X bookmarks and folders. Do not bypass X entitlement APIs, forge subscription status, simulate native save success or import inaccessible native folders.

| Journey | Required result | Current status |
| --- | --- | --- |
| Bookmark, then Add to Folder on the observed denied account | Custom sheet for the captured post after confirmed denial; no user retry | Failed, adapter missing |
| Native folder-capable account | Original X flow remains usable, no custom write | Preserve; actual picker markup unqualified |
| Open Categories explicitly | Existing backend library and saved memberships remain accessible | Existing implementation; not requalified in this task |
| Upgrade/downgrade | New intents follow fresh evidence; prior data remains at its authority | Policy partly implemented, integration absent |
| Account change or unknown identity | Close stale editors and stop private reads/writes for the wrong account | Partial guards implemented; integrated verification required |
| Unknown source layout or locale | Usable source action and explicit custom alternative | Required recovery; not an acceptable claim of complete automatic support |

Agent decisions retained from the first plan: evidence-based capability, no blue-badge heuristic, no automatic migration/dual-write, and provider pinned once an editor opens. Generic Premium ads and subscription settings remain untouched.

User scope remains both tiers. Existing backend authorizes one personal library per provisioned service. Independently provisioned users can use this design; a single shared deployment for unrelated users still needs server-authenticated multi-user provisioning. Do not silently reinterpret that limitation as permission to expose one user's library to everyone. Public shared hosting is an unresolved delivery prerequisite, not part of the diagnosed routing fix.

## Source adapter contract

Create `src/folder-source.ts`, initialized once from `main.tsx`. Use the public SDK and existing `extractPost`, `observeAccount`, `folderController`, `openCategorySheet` and `openLibrary`. All listeners, timers and watchers must dispose with the activation. Keep X selectors, route strings and account/provider decisions in this module or applet-local helpers.

Capture ordinary bookmark clicks only to identify their resulting toast; never cancel or duplicate the ordinary bookmark operation. Use capture-phase observation of a qualified `[data-testid="bookmark"]` inside `article[data-testid="tweet"]`, validate `extractPost`, and freeze the snapshot before X can recycle the article. Record `{nonce, post, accountKey, accountEpoch, sourceId, sourceUrl, routeRevision, capturedAt}` in memory. Observe the button becoming `removeBookmark` and the newly appearing source alert. Repeated rapid bookmark gestures make toast association ambiguous unless the adapter can prove which one generated the alert. In ambiguity, leave the source action intact and offer explicit per-post categories; never assign a toast to the nearest visible article.

The observed English action classifier requires all of: a fresh, uniquely correlated bookmark receipt; a visible source-owned `[data-testid="toast"][role="alert"]`; one enabled button with the qualified normalized accessible name `Add to Folder`; and the same activation, route and verified account epoch. Exclude owned roots. This is a scoped structural-plus-label selector, not a document-wide text search. Record supported locales explicitly; unqualified translations are unknown.

Creating the toast association does not create a folder intent. On the user's folder gesture, call `begin` with its frozen post and current account. Revalidate both before intercepting any event. Known-custom evidence routes to the custom sheet without invoking the source action. Unknown/native evidence allows exactly one original source action, with outcome observation and the full-page handoff below. Native picker controls remain owned by X. Never select a folder or trigger an upstream save to probe availability.

Classify native picker and in-page denial only after actual structural evidence is available. An unrecognized dialog is neither success nor denial. Absence of controls, a timeout, a network failure or a backend error cannot establish free tier. Qualify Saved management controls and any post menu independently; they must carry `manage-folders` or a proven post identity, never an invented current post.

## Full-page handoff: separate platform dependency

The observed no-href button can choose its destination inside X's handler. A static Premium-route block would also affect entitled users or unrelated subscription journeys. Removing ordinary-route exclusions would keep powerful applet bindings on account/payment pages. Neither is the chosen design.

First qualify the exact navigation mechanism on the current provider: same-document history navigation versus main-frame GET. Record whether a qualified in-page folder denial is observable before navigation. If the existing SDK can handle that pre-navigation denial through the original close action, implement that supported path in the adapter. Do not assume it from the final URL. The no-href full-page reproduction remains a required path even if an in-page path works elsewhere.

For the full-page case, specify a generic one-use return handoff as a new platform capability. This is a proposed API, not available in SDK 0.3.0. Its implementation needs host qualification before the dependent adapter can be marked ready:

`navigation.armReturn({key, destinationPaths, returnUrl, ttlMs, state}) -> Promise<{token}>`

`navigation.cancelReturn(token) -> Promise<void>`

`navigation.takeReturn(key) -> Promise<{token, matchedPath, state} | null>`

- Arm only from the active bound source document with the declared navigation-policy capability. Validate at most eight exact paths on that source's existing HTTPS origin, a return URL in that source's customized coverage, TTL at most ten seconds, and JSON state at most 16 KiB. No wildcards, arbitrary origins, executable callback source or service credentials.
- Maintain one pending return per live source document, tied to applet/package revision, view, document and generation. Arming replaces an earlier pending return for that document, never another applet's. Acknowledgement means the host installed the guard before the adapter invokes the exact original folder action.
- Match only the next allowed sequence from that document. Cancel on timeout, first unexpected navigation, section departure, account invalidation requested by the adapter, disposal unrelated to the guarded transition, or explicit cancel. The adapter also cancels on an unrelated user gesture. A URL without a live causally associated intent never activates fallback.
- When the exact destination is observed, consume the guard once before ordinary-route retirement destroys its state. Use the normal opaque navigation cover and return to the captured customized GET URL. Keep the original section/opener. Ordinary destination content gets no applet bridge. Never replay POST bodies or alter remote responses.
- Store the matched return state only in host memory for the remaining TTL. A new authenticated binding of the same package/source consumes it once through `takeReturn`; another source, ordinary page, document replay or old package cannot read it. Clear on process death, expiry, retirement failure or package replacement. No persistent private post snapshot or new database schema.
- A return may reload X and lose volatile source state. Arm only when no composer/dirty form is active; retain scroll through the existing scroll-position mechanism. Native Back must return to the opener without looping through the guarded route. If a safe return cannot be performed, use ordinary recovery and report the fallback failure rather than retrying a navigation loop.
- On platform failure/timeout, let the original source route remain usable. Do not leave a hidden WebView or indefinite cover. Cap the return-loading attempt using existing navigation failure/recovery handling, and never consume a stale result into a newer document.

Implementation ownership: SDK `runtime.ts` and `bootstrap.ts` expose/route the contract; `crates/contracts/src/lib.rs` and `android/native/src/controller.rs` validate requests and own the state machine; `BrowserAdapter.java` handles the existing navigation callbacks/return/cover operations. Use `HostViews.java` only through its established transition methods. Update capability/version checks, packaging validation and factory reference consistently if a runtime API increment is needed. Applet code must gate use by the shipped contract and package compatibility; it must not call private RPC directly.

The platform does not know Premium, folders, X selectors or account handles. Its opaque state contains only the applet's bounded intent snapshot and epoch. After return the adapter consumes the ticket, verifies age, nonce, account epoch, post and source again, then records folder-denial evidence and opens the custom sheet. A legitimate handoff explicitly binds the intent to the new generation; ordinary stale callbacks still fail. Do not reuse a stale `Library` object from the departed activation.

This intentionally changes the old plan's strict in-document snapshot rule: an ephemeral, bounded host-memory transfer is necessary across binding retirement. It is not disk persistence or a cross-account channel. Log only token status/path classifications, never the payload.

Readiness gate: verify on-device whether the host can cover and return both observed SPA navigation and main-frame GET without losing the ticket or breaking Back. Android history callbacks can occur after a same-document DOM update, so zero-frame suppression is not promised. Acceptance is automatic recovery into the correct custom editor without another user action. A persistent Premium page, repeated Back loop or reliance on a retired callback fails. If the platform cannot satisfy this contract, keep this required path blocked and write the concrete provider limitation before changing product scope.

## Controller and editor lifecycle fixes

`FolderController.begin` currently refuses any existing armed/native-open/switching/custom-open intent for the same account before checking its deadline. If no outcome arrives, the ten-second deadline alone never releases the slot. Fix this before wiring it to real clicks.

Add explicit timeout processing for armed and switching states. Expired observation releases the slot and leaves capability unknown. For a real native-open picker, retain its ownership until observed close or navigation; expiry of the evidence window must not spawn another modal over a still-open native picker. `custom-open` remains pinned until close/save/account invalidation and does not expire merely because ten seconds elapsed. Repeated clicks focus the existing custom editor where possible rather than opening duplicates.

Separate capability lifetime from intent lifetime. Current `folderController(context)` resets both on every `onFocus` and `navigation.onChange`. Ordinary source route changes should cancel the current intent but retain bounded capability evidence for the same verified account. Focus re-observes account and expires evidence; settings/subscription return clears it to unknown. Account change/logout clears both. Cold start defaults to unknown. Preserve the original five-minute evidence maximum and “Check X folders” user-initiated recheck.

Extend `openCategorySheet` with a typed optional completion callback or returned close handle that reports saved, canceled, invalidated and failed outcomes. Call it once even for native Back, modal replacement or activation disposal. Connect it to `complete`/`cancel`, and ensure late backend results cannot complete a newer intent. Keep retry input in the same editor. Do not replace a dirty custom editor when fresh native evidence arrives; apply the new default to the next intent.

After every account/backend await, recheck the epoch and current activation before showing private data or submitting a write. Existing bootstrap account hints can be stale after a switch; treat ambiguous mobile evidence as unknown, clear the private view and require source reverification. A page receiving no storage notification while retained must refresh on focus. A server token and library identity remain the authorization boundary; a DOM handle is not authentication.

## Ordered implementation and verification commits

Follow these component boundaries. Update the applicable changelog and commit each verified step before the next. No new or modified test files are authorized; use existing checks and temporary in-memory logical probes.

1. **Qualify transient action and platform mechanism.** Update this plan with sanitized source structures, exact routes, gesture association, native/in-page cases when accessible, and the same-document versus GET result. Inspect actual package/provider status. Commit `feat/(x-folder-plan): qualify post-save folder handoff`. This task has qualified the English toast and its destination, not every folder surface or native chooser.
2. **Generic return capability, if the qualified path requires it.** Implement the contract above separately from X. Update SDK reference and browser architecture. Run root `npm run typecheck --workspace @genesis/sdk`, `cargo test --locked -p genesis-android`, `cargo test --locked -p genesis-contracts`, and `git diff --check`; run existing package checks after version/schema changes. Use `node tools/build.mjs --stage all --variant debug` and the existing Android build workflow for device qualification. Exercise exact-match, mismatch, expiry, repeated delivery, stale document, wrong source, ordinary-page access, process death, and Back with temporary generic data. Commit `feat/(navigation): add scoped one-use return handoffs`. Do not label this available until built host and SDK agree.
3. **Policy expiry and editor completion.** Change `folder-capability.ts`, `components/category-sheet.tsx` and relevant account focus handling. Run applet checker and temporary fake-clock probes against actual controller methods: begin, no observation, time advances, begin again must succeed; custom-open stays pinned; canceled/native-closed can reopen; late outcomes never affect the next intent. Verify account epoch A to B to A rejects old objects. Commit `feat/(x-folders): complete intent and editor lifecycles`.
4. **Source integration.** Add `folder-source.ts`, wire `main.tsx`, and adjust `post-controls.ts`/`source-navigation.ts` for duplicate-action avoidance and persistent custom-library access. Integrate one-use handoff only after step 2 is available. Add `/i/verified-get-verified` as an explicit ordinary exclusion in all X source declarations to document the boundary; it is already outside positive coverage. Do not broaden customization over Premium. Verify English toast association, repeated saves, unknown locale, recycled nodes, account/route changes, custom hint expiry and native event pass-through. Commit `feat/(x-folders): connect native denial to applet categories`.
5. **Provider and service UX.** Label the custom destination consistently as Applet categories. Native-capable users keep native controls and retain custom-library access for older saves. Show loading immediately, service/account errors with retry/cancel, and success only on confirmed receipt. Use existing library-scoped pending slot and reconciliation rather than adding another write queue. Preserve the configured database and IDs. Commit `feat/(x-library): explain provider transitions and recovery`.
6. **Install and qualify the complete journey.** Build and replace the existing development applet, verify installed and loaded revisions, then run the acceptance matrix below. Update X README, X architecture and this plan with exact support and gaps. Commit `feat/(x-folders): record integrated fallback verification`. A source-only build is not delivery.

For applet steps 3 through 5, run from `factory/applets/x.com`: `npx --no-install genesis-applet check . --json`. Each step also runs root `git diff --check`. For delivery, from that applet directory use `npx --no-install genesis-applet build . --out /private/tmp/x-folder-fallback-build --json`, then `npx --no-install genesis-applet dev install /private/tmp/x-folder-fallback-build --device emulator-5554 --replace --json` and `npx --no-install genesis-applet dev status --device emulator-5554 --json`. Check an ambiguous install outcome before retrying. No backend startup is implied; use an existing reachable authorized service, or request startup explicitly if it is down. Earlier HN startup permission is not X startup permission.

## Acceptance matrix

| Scenario | Required outcome and evidence |
| --- | --- |
| Observed free-account toast flow | One exact-post custom sheet automatically; explicit category selection, write receipt and library read-back persist after reopening. |
| Ordinary bookmark without folder gesture | One normal X bookmark operation; zero custom writes or editor. |
| Native flow | Original control invoked once; original picker/save semantics; zero custom writes. Unqualified native picker stays unknown and passes through. |
| Repeated/rapid bookmark clicks | Correct unique association or no interception; never the wrong post. |
| Full-page denial | One covered return, fresh binding, exact intent consumed once; no persistent Premium page or Back loop. |
| Unrelated Premium navigation | No return guard matches without a folder intent; ordinary source page remains usable. |
| Free to Premium | Clear/recheck bounded denial hint on fresh intent; native default restored by fresh evidence; custom data stays accessible. |
| Premium to free | Fresh denial overrides old native hint; no transfer/deletion of old X folders is claimed. |
| Tier changes during dirty editor or pending write | Current provider stays pinned; original operation ID reconciles; no duplicate/dual write. |
| Account A to B during any await, then back to A | No A records shown for B; stale editor closes; old result cannot authorize a new session. |
| Backend offline, wrong token or wrong account | Clear error and retry/cancel; no phantom empty collection or save-success claim. |
| Lost response/process restart | Resolve original receipt in original verified library; no new operation ID merely because response was lost. |
| Toast disappears, timeout or unsupported locale | No stale intent/editor; explicit category action remains available; source recovers. |
| Keyboard, large text, Back, reduced motion | One modal, reachable controls, visible focus, no automatic reopening; overlay readability meets the companion plan. |

Real subscription purchases/cancellations are not required. Use actual transition logic with controlled evidence for tier-change scenarios and distinguish those results from real device flows. Actual native picker selectors cannot be invented from synthetic markup. Completion requires the observed denied-account path with backend read-back, intact source pass-through, lifecycle checks and a loaded installed revision. If native chooser qualification, a provider navigation guarantee or multi-user provisioning remains unavailable, report the exact limitation and keep the affected requirement open.

## References and preservation rules

Read the original plan in full and the current [X architecture](../../../.architecture/x.md), [browser lifecycle](../../../.architecture/browser-runtime.md), [SDK contract](../../../factory/guides/sdk-reference.md), [factory workflow](../../../factory/AGENTS.md), [verification](../../../factory/guides/verification.md) and [X operating guide](../../../.docs/phase-4/2026-10-30/210800-genesis-x-development-guide.md). The current phase's backend/complete-app plans linked by the original plan retain their data and navigation requirements. The [overlay plan](125045-x-overlay-opacity-repair-plan.md) handles visual opacity independently; fixing opacity alone does not connect folder behavior.

The user explicitly requested plans only in this task. All runtime/API signatures above are proposed changes; none was implemented, built or deployed here. The remaining platform feasibility and native-layout qualification gates are explicit prerequisites, not approvals to silently reduce the requested behavior.


## Implementation update, 31 October 2026

Implemented shared overlay ancestry diagnostics/guidance, narrow X opacity correction, additive API-2 host-memory navigation returns, deadline/editor lifecycle repair, the qualified English post-save adapter, and account-readiness restoration. The return RPC rejects on older hosts; this is an additive API-2 contract rather than a runtime-version increment. Only confirmed source logout/account evidence changes the shared epoch; temporary loading does not.

Built and updated the existing Android host and `x-bookmarks` installation. Final installed applet revision: `5b38b6a4ca7e4ee3cadbc30b4b0f7e7a77b25dcb47ce4f0dedf5363117185bff`. Real denied-account source flow opened the opaque custom editor automatically; a disposable backend membership persisted in the library and was removed. Native Saved, Categories and Back, final editor Back/cancel, solid toast, composed-opacity sampling and temporary controller scenarios passed. All diagnostic bookmarks were removed. No services were started and no real subscription changes occurred.

Remaining qualification: actual native Premium chooser markup, localized/other folder entries, physical-device/TalkBack/large-text/dark-keyboard matrix and public multi-user provisioning. Existing Rust test commands completed successfully but these crates currently discover zero tests; temporary controller probes and real emulator acceptance supply the relevant behavior evidence. No new tests were created. The full-page flow uses covered location replacement and does not promise zero-frame suppression or restoration of arbitrary volatile source state. A complete blanket claim for every X folder entry remains open pending source qualification.
