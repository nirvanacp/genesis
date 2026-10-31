# X adaptive bookmark folders implementation plan

Project: Genesis X applet, `factory/applets/x.com`. Phase: `phase-4`, branch `proto/phase-4`. Created 31 October 2026, 12:06:56 Asia/Kolkata. This is a planning deliverable; no application implementation or live tier-transition verification was performed.

## Problem and intended outcome

The current applet exposes two independent systems: X bookmarks and its paid folder UI, and our backend-backed Categories. A free user can still enter X's folder flow and encounter an upgrade prompt despite the applet having its own category implementation. The user wants folder organization to remain available without buying X Premium, while accounts entitled to X folders continue using X's original feature. Subscription changes must not lose records, strand earlier saves, or submit an action to the wrong provider.

Preserve one applet ID, `x-bookmarks`, and the existing Home, Explore, Notifications, Saved and Profile shell. Preserve ordinary X bookmarks, Likes, source sessions, forms and social actions. The replacement is an independent applet service, not an entitlement change on X's servers.

Required observable result: an entitled account's folder controls continue opening X's original UI. A confirmed folder paywall leads to our category editor for the exact selected post, or our category library for folder-management intent. Subsequent known-unavailable folder actions go directly to the custom flow. Every save clearly identifies its destination and confirms success only after that destination acknowledges it.

## Evidence and applicable guidance

Read together with [factory instructions](../../../factory/AGENTS.md), [SDK reference](../../../factory/guides/sdk-reference.md), [X README](../../../factory/applets/x.com/README.md), [X architecture](../../../.architecture/x.md), and [browser runtime](../../../.architecture/browser-runtime.md). Adopt the compatible data and receipt contracts from the [phase-4 backend plan](../2026-10-30/195728-x-category-backend-plan.md) and preserve the single-app navigation requirements of the [two-app plan](../2026-10-30/214048-genesis-two-complete-applets-plan.md). The user's latest request supersedes always showing the same custom-save action regardless of native folder availability. It does not supersede separate data authorities or require automatic synchronization.

Inspected implementation:

- `src/main.tsx` activates `sourceNavigation` and `postControls`.
- `src/post-controls.ts` mounts custom actions beside groups containing `[data-testid="bookmark"]` or `removeBookmark`. `extractPost` provides the canonical post and bounded snapshot. Those selectors identify ordinary bookmarks, not a verified folder action.
- `src/source-navigation.ts` adds Categories to X's `/i/history` and `/i/history/likes` tabs. It already owns source Back handling, route cleanup and composer guards.
- `src/account.ts` supplies `currentHandle`, `verifyAccount`, `openLibrary`, `enterLibrary` and the one-use verification return ticket. It identifies the signed-in account, not subscription entitlement.
- `src/components/category-sheet.tsx` opens `Save to category`; `src/library.tsx` and the manager/filter components manage private categories.
- `src/repository.ts` maintains an operation ID and reconciles unknown outcomes. Its current `operations/pending` key is global to this applet, as are library preferences and the entry ticket.
- `src/backend.ts`, `backend/server.mjs`, `backend/store.mjs` implement one bearer-token-authorized personal library. `Library` includes `libraryId` and `expectedHandle`. The DOM handle check prevents accidental mixing; it is not server authentication.
- `applet.json` excludes `/i/premium_sign_up`, settings and authentication routes from customization. Entering excluded routes retires the applet binding. A source watcher cannot silently keep operating there.

X documents its native folders as a paid feature in [its official help](https://help.x.com/en/using-x/x-premium-how-to). Exact folder controls, paywall structures, localized variants and entitlement signals have **not** been qualified in this planning task. Never manufacture selectors from labels in this document.

## Decisions, assumptions and boundaries

User requirements: automatic folder fallback for free accounts, native folders for entitled accounts, logical handling of upgrade/downgrade, and a plan only. No real subscription purchase/cancellation is required for qualification.

Agent design decisions:

1. Route by observed folder capability, not a blue badge or inferred paid tier. Paid variants, grace periods and source behavior can differ. Unknown is a real state.
2. Keep X folders and applet categories as separate authorities. No automatic import, copying, deletion, dual-write or simulated X success. This avoids losing records or pretending that inaccessible X folder contents were migrated.
3. Retain explicit access to custom saves even after Premium activates. Native folders become the default for new folder actions; existing custom records remain editable in their own library.
4. Replace only folder-related upgrade surfaces causally associated with a folder intent or a structurally qualified folder-management surface. Generic Premium promotions, ads, profile upgrades and subscription settings are unaffected.
5. “Any user” means either tier can use this routing with a separately authorized custom library. Existing personal deployment can support separately provisioned users, but the current single-token server cannot safely serve unrelated users together. Shared public onboarding or multiple libraries selected automatically on one device is a separate unresolved delivery requirement. Do not claim this plan delivers a multi-tenant service. If public shared hosting is intended, require an authentication/provisioning design before rollout; applet routing work can proceed independently.
6. Automatic migration between providers is not included. A future explicit copy/export flow would need supported source access, destination validation, deduplication and per-provider progress. Do not build it implicitly as part of tier detection.

Readiness: behavior and data-preservation design are specified. Implementation of interception is gated on DOM/route qualification in step 1. Full product readiness additionally requires every intended user to have an authorized reachable custom service. These are dependencies, not user-approved deferrals.

## Capability and intent contracts

Add `src/folder-capability.ts` with a pure state transition function and a per-context controller. Proposed applet-local contracts, not new SDK APIs:

- `FolderCapability`: `version:1`, normalized `accountKey`, `accountEpoch`, `state: unknown | native | custom`, `evidence: native-picker | folder-paywall | none`, `observedAtMs`, `expiresAtMs`, monotonic `revision`.
- `FolderIntent`: random `id`, `kind: save-post | manage-folders`, `accountKey`, `accountEpoch`, `sourceId`, `sourceUrl`, navigation generation, creation/expiry times, and for saving an immutable validated `Post` snapshot. Track `phase: armed | native-open | switching | custom-open | complete | canceled` and chosen provider.
- No native-folder IDs are stored as custom category IDs. Provider-specific selection state never shares a key.

Maintain the post snapshot and DOM references in memory only. A reusable DOM node is not identity. Re-extract and compare the post ID before handling a click and before native invocation; after opening a custom editor, use its frozen snapshot. For management intent, never invent a post from whichever article happens to be visible.

Capability is fresh for at most five minutes. Expiration, account ambiguity, sign-out, account change, cold start or subscription-settings return makes it unknown. Persist evidence only as an expiring hint scoped by account; a restored hint never authorizes private reads or overrides contradictory live evidence. A newly observed qualifying native folder picker immediately selects native; a qualifying folder paywall selects custom. Network errors, empty lists, unavailable DOM, missing controls or a backend failure do not establish a free account.

Unknown state lets the user initiate the original X folder action once, under a bounded intent observation window of ten seconds. A real native folder chooser is positive evidence without submitting a save. A qualifying paywall triggers custom fallback. Timeout leaves classification unknown and offers “Use applet categories” without falsely reporting successful native saving. Do not repeatedly click X to probe status.

Known-custom mode replaces only qualified folder controls with equivalent custom entry points. Recheck on fresh user folder intent when evidence expires. Offer “Check X folders” to clear the hint and make one user-initiated native attempt, enabling an immediate upgrade recovery. Never interrupt an already open custom form to probe.

## Source adapter and fallback sequence

Create `src/folder-source.ts` for the qualified source DOM adapter, with focused functions `classifyFolderControl`, `classifyFolderSurface`, `observeFolderOutcome` and `dispose`. Return discriminated observations rather than letting UI components inspect arbitrary X markup. Each observation must include account, activation, route and intent identity.

Step 1 must enumerate: folder creation in Saved, add-to-folder after bookmarking, per-post menus, any long-press behavior supported by the actual web app, native folder picker, upsell dialog and full-page upsell navigation. Record actual semantic attributes, post association, dialog boundary and dismiss control. Prefer stable attributes and structural scope; text-only matches such as “Premium” are insufficient. Treat locales without qualified evidence as unsupported, not free.

For an unknown/native attempt:

1. Capture the current signed-in account and exact folder intent before allowing the original event.
2. Preserve X's event handler and ordinary bookmark semantics. A plain bookmark click remains X's operation. A toast following it may offer folders; classify the folder action separately.
3. On native picker evidence, keep original controls and observe only. Do not submit, choose a folder, synthesize success or mirror the save to our service.
4. On a matching folder paywall, atomically claim the intent for fallback once. Recheck epoch, route generation and snapshot identity. Cancel if the user navigated away, signed out or already dismissed the flow.
5. Dismiss the exact qualifying X dialog through its observed close action. Do not delete arbitrary source nodes or broad-hide all dialogs. Confirm it is gone before opening the applet modal. Open a loading shell immediately, then verify account/service and load categories. A service failure presents retry and cancel, not an empty collection.
6. `save-post` opens the existing category sheet; `manage-folders` opens the existing library. Announce once: “Use applet categories to organize this post.” Label destination “Applet categories”; do not label the account as free.
7. Save only after the user's explicit category selection and confirmation. Fallback itself makes no record mutation. Dismissing either flow cancels its intent; repeated observer callbacks cannot reopen it.

For known-custom control replacement, retain the source element and reversible event/style changes, mount the usable replacement first, and intercept only the verified folder gesture. Never block the underlying ordinary bookmark action or a shared parent group. Restore originals on dispose, unknown identity, native capability or adapter failure. Avoid clone-and-replace of source React subtrees.

### Full-page Premium route constraint

Do not globally customize or block `/i/premium_sign_up`, remove ordinary-route exclusions, hook private host RPC, or guess an SDK interception API. Current `navigation.onChange` is a notification, not a cancellable before-navigation hook. Static manifest blocking cannot distinguish intent or account tier.

Prefer interception of a qualified folder-origin link/gesture while the source binding is active. For an unknown account, a link to the ordinary Premium route is denial evidence only when the adapter proves it is specifically the folder upsell; the URL alone is insufficient. For opaque SPA navigation that cannot be correlated and stopped with the current public contract, retain the gap as blocked. Supply a minimal reproduction and a separate platform proposal for a generic, intent-bound navigation interception capability. The platform must remain unaware of X tiers or categories. Do not mark “all folder paywalls instantly replaced” complete if this case remains unhandled.

“Instant” means replacement during the confirmed folder denial without another user retry, once the adapter can classify it. Zero-frame visual suppression before unknown markup is observed cannot be guaranteed. No hidden entitlement polling, screenshot overlays or source-wide CSS hiding.

## Account, lifecycle and pending writes

Extend `account.ts` with an applet-owned account epoch coordinator using revision-checked host documents and `storage.onChanged`. Account unknown, changed or logged out invalidates pending UI intents, hides private loaded rows, closes stale editors and clears displayed membership immediately. Each active source re-observes its own account on focus and relevant source changes; no cross-WebView DOM access. A stale observation cannot restore an older epoch.

Tickets must include and validate the epoch as well as nonce, time and phase. Preserve the current one-use source round trip, but reject tickets belonging to an earlier account session. An owned page must reverify on focus and before mutation; an existing `Library` prop alone is insufficient evidence of current identity. Recheck after awaits and before applying results.

Scope preferences and pending operation markers by `libraryId`; scope capability hints by verified account observation and epoch. Replace the global pending-key usage in `Repository.submit`, `reconcile`, `retry`, `abandon`, and `settled` consistently. Clearing a pending marker must compare its operation ID and expected document revision so one view cannot clear another view's operation. A local per-instance `submitting` flag alone is insufficient across retained contexts. Acquire the library's pending slot with a checked storage commit before sending a mutation.

A tier change does not change `libraryId`, cancel an already submitted request, or resubmit it to X. Reconcile the same operation ID against the original authorized library. Account switching prevents retry/UI display under the new account. A late commit may finish in the original library; report it when that library is verified again, never as a save for the new account.

On migration, adopt an existing global pending marker only into its recorded library's empty pending slot using one checked transaction; leave conflicting entries intact and present reconciliation. Migrate global preferences only after matching the configured library; reset an invalid filter without deleting records. Keep legacy data until successful migration is acknowledged. Never change manifest data schema to invent a migration mechanism.

Different signed-in account with the existing one-account backend: fail closed for custom private data, show “Connect the library for this account,” and retain X browsing and native folders if available. Do not retarget `expectedHandle` automatically. Account handle changes need operator-supported identity correction; bootstrap handles are not stable proof of ownership. A shared multi-account deployment requires genuine server-authorized identity binding before this restriction can be removed.

## Tier-transition behavior

| Event | Routing and data outcome |
| --- | --- |
| First visit, entitlement unknown | Original folder action remains; observe qualified success or denial. Custom library has an explicit accessible entry. |
| Free account receives folder upsell | Replace that intent with custom editor/library; remember bounded denial evidence. |
| Free account upgrades | Fresh native picker evidence restores native default. Keep all custom records and expose their library. No copying or deletion. |
| Premium account downgrades | Next qualified denial overrides old native evidence and routes to custom. Existing X folders remain X-owned; do not claim their contents were recovered. |
| Renewal/grace/refund changes | Actual folder capability wins. Dates or badges do not decide. |
| Tier changes while custom editor is dirty | Keep provider and selections pinned until cancel/save; apply new default to the next action. |
| Tier changes during custom request | Reconcile the original operation only; do not dual-write. |
| Native operation has uncertain outcome | Show X's state; do not auto-create a duplicate custom save. Offer a clearly separate custom action if needed. |
| Switch account or sign out | Invalidate epoch and UI, retain records at original authority, require fresh verification. |
| Same post saved in both systems | Keep independent memberships and removals; identify destination in each editor. |
| Backend unavailable | Native entitled users remain fully usable; custom users get retry/cancel with no phantom save. |
| Unknown source/localization/layout | Restore usable source controls; retain explicit custom entry; record unsupported routing gap. |

Upgrading users see one brief explanation that previous applet categories remain in Saved. Downgrading users see that X folder contents were not transferred. Do not promise unified counts, search, name uniqueness or folder equivalence across providers.

## UI and accessibility

Keep the existing single Saved tab row. Rename the custom location consistently to “Applet categories” where needed to distinguish it from X folders. Native-capable users retain X folder actions; the custom library remains available for previous saves. Existing custom membership may expose “Edit applet categories” as a secondary action without taking over the native folder control. Custom-mode users get the custom folder action in the source folder position; avoid duplicate primary actions for the same custom destination.

Reuse `openCategorySheet`, `CategoryManager`, `openCategoryFilter`, theme and library styles. Keep one modal at a time, Android Back/cancel, focus restoration to a connected opener, keyboard-visible confirmation, loading/error messages and 48 CSS-pixel touch targets. Preserve drafts within an editor when a recoverable service request fails. Do not retain private post snapshots across logout. Use the project design references, especially `modality.md` on dismissing one modal before another and `feedback.md` on actionable failure feedback, translated to Android. Reduced motion and text scaling must remain supported.

## Ordered implementation and commit boundaries

All paths below are relative to `factory/applets/x.com` unless stated otherwise. Each step has its own root development changelog and component commit. Do not create or modify tests without a separate coverage request.

1. **Qualify source integration and finalize routing contract.** Inspect existing emulator source without purchasing/changing subscriptions. Document actual folder controls, denial/picker structures, routes, dismiss behavior and unsupported locales in the active plan. Synthetic logical scenarios may represent tier transitions. Confirm full-page interception feasibility with the SDK. Reuse current extractors. Exit criterion: no guessed interception selector; unresolved platform dependency explicitly blocks the affected adapter. Commit documentation under `feat/(x-folder-plan): ...`.
2. **Account/session and operation isolation.** Update `account.ts`, `repository.ts`, `local-state.ts`, `library.tsx` and the category sheet to implement epoch checks, library-scoped preferences/pending state and checked migration. Preserve backend data model and operation receipt endpoints. Verify existing library entry/focus behavior and late-result rejection by controlled logical scenarios. Commit `feat/(x-account): isolate folder sessions and pending writes`.
3. **Capability policy.** Add `folder-capability.ts` with the contracts and transitions above. Implement bounded evidence, expiry, one-intent ownership and provider pinning. No DOM selectors in the reducer. Verify the transition table with temporary in-memory scenarios, not new repository test files or real subscription changes. Commit `feat/(x-folders): add capability-based provider routing`.
4. **Source adapter.** Add `folder-source.ts`, initialize/dispose it from `main.tsx`, and connect `post-controls.ts` and `source-navigation.ts`. Use qualified controls only, preserve original native event paths, suppress duplicate custom actions, dismiss scoped paywalls before modal opening and cancel stale intents. Modify manifest coverage only if justified by qualified routes and explicit lifecycle analysis; never broadly enable paid routes. Commit `feat/(x-folders): route denied folder actions to applet categories` only after its supported paths work.
5. **Library and transition UX.** Update `library.tsx`, `components/category-sheet.tsx`, relevant styles and source labels for destination clarity, retained custom access, settings-return recheck, upgrade/downgrade explanations and retry recovery. Keep category limits and delete-empty-only behavior. Commit `feat/(x-library): preserve category access across tier changes`.
6. **Qualification and handoff.** Update applet README, `.architecture/x.md` and this plan with actual support and limits. Run bounded logical scenarios and existing checks, optionally install-as-update into the existing applet for source UI acceptance when implementation is authorized. Do not install a second everyday app, start services without authorization, or change real subscription state. Remove disposable records/diagnostic forwarding, preserve neighboring HN and X data. Commit `feat/(x-folders): document adaptive folder verification`.

For steps 2–5, run from the applet directory `npx --no-install genesis-applet check . --json`; expected success includes manifest validation and TypeScript. Run `git diff --check` from the workspace root for each commit. Build after integration with `npx --no-install genesis-applet build . --out /private/tmp/x-adaptive-folders-build --json`; expected output is a valid API-2 bundle. If modifying backend modules in a separately approved prerequisite, run `node --check` for each changed `.mjs`, existing relevant backend checks, and explicitly qualify authorization isolation. A build or package receipt is not proof that X selectors or provider routing work.

## Acceptance matrix and completion gate

Logical checks may use temporary fake clocks, account observations, adapter observations and receipt responses. They must invoke the actual transition logic; fabricated screenshots do not qualify the source adapter. No new test files are prescribed.

| Scenario | Required result |
| --- | --- |
| Native-capable account opens folders | X picker unchanged, zero custom mutations, no duplicate primary custom action. |
| Qualified denied save intent | One custom sheet, exact post snapshot, one account, explicit confirmation before write. |
| Qualified denied management intent | Custom library opens without capturing any post. |
| Generic Premium promotion | No interception or capability change. |
| Repeated observer events/double tap | At most one editor and one intent transition. |
| Recycled post, delayed denial, route change | No action attached to a replacement post or new route. |
| Evidence expiry and negative clock anomalies | Unknown/recheck; no permanent tier inference. |
| Free → Premium → free | Defaults follow fresh evidence, both stores retain their records, old custom library stays reachable. |
| Account A → B during each await boundary | No A rows shown as B, no retry routed to B, late completion remains scoped to A. |
| Two retained views attempt writes | Checked pending slot serializes per library; one view cannot clear another operation. |
| Lost response, restart, late commit | Original receipt reconciliation; no duplicate operation or provider switch. |
| Custom service absent or auth mismatch | Clear recovery, no save-success claim, no blank-source takeover. |
| Keyboard, Back, cancel, reduced motion | One modal, reachable confirmation, predictable return and no automatic reopening. |
| DOM drift or excluded-route fallback | Source restored and gap reported; never silently claimed complete. |

Completion requires every supported folder entry path to satisfy the matrix, zero unaccounted mutations in X or the custom service, existing records accessible after both tier transitions, and documented user provisioning. Real tier purchases/cancellations are not required. Logical coverage must be reported separately from actual source/device checks. If selector qualification, full-page interception or multi-user provisioning remains unresolved, deliver the completed independent components with the exact blocked requirement, not a claim that automatic folders work for every account.
