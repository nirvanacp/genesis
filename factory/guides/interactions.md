# Actions and navigation

Classify every control before implementing it. URL coverage and action support are separate contracts.

| Control | Execution | Acceptance |
| --- | --- | --- |
| Post/profile/discussion/URL tab | Resolve and activate the declared destination | Correct custom screen and Back |
| External article or original website | Resolve, show website cue, activate explicit website intent | Correct destination/session and Return |
| Like, Bookmark, Follow | Semantic button and validated source action | Observe requested state and reconcile rollback |
| Repost/More/Share | Owned menu or sheet | Opens its named choices, Cancel/Back restores focus |
| Save/category editor | Owned button and applet repository | Existing receipt/conflict/read-back rules |
| Reply/Post/Quote editor | Context-specific website workflow | Correct editor context, no automatic submission, Return |

An icon labeled Like must not merely open the containing post. A website action declaration grants presentation, not execution of that action. Keep generic Open page on website in an explicitly named recovery/menu item. Source DOM remains hidden through loading, errors and transitions. Never transfer HTML, form tokens, cookies or selectors to the foreground.

## Source actions

Use the existing public source command/publication channel. The following names and payload are applet-defined, not SDK action APIs:

```ts
await context.source.command({
  name: 'x.action',
  epoch: snapshot.epoch,
  payload: {visitId, requestId, token, account, desired: true},
});
```

The promise acknowledges dispatch. It does not prove an upstream write. Publish validated bounded action descriptors and retained request results alongside normal source models. Preserve results across coalesced publication. Use pending, observed, rejected and uncertain outcomes, an observation deadline, and fixed safe errors. Observed source UI may be optimistic; keep accepting rollback. Persistence requires separately authorized write/reload/read-back qualification.

Bind action tokens to current source visit, account, exact entity, URL, selected tab and live control. Revalidate immediately before clicking and each later confirmation. Reject disabled controls, recycled nodes, unknown state, stale requests and mismatched accounts. Desired-state operations are preferable to blind toggles. Deduplicate requests with a monotonic sequence; retain a high-water mark after evicting old receipts. Serialize mutations. Never automatically retry uncertain writes or send an opposite action to compensate.

Cached content can remain readable after its live source action token expires. Offer internal Open live post to interact. Never queue a mutation across that navigation or obtain authority from cached text/counts. Provider/recovery entry cancels later confirmation steps. Disposal cancels timers, not a remote write already sent.

Keep upstream bookmarks separate from applet Categories unless the product explicitly requests synchronization. Account confirmation for website actions is distinct from backend credentials and backend-account matching.

## Editors and sharing

Keep original forms, authentication, uploads, settings and protected playback in explicit website workflows unless separately implemented and qualified. Inspect contextual editor URLs. Opening the containing post is not a successful Reply action. Never prepare source dialogs on mount, hover or resolve. Any source preparation must be a non-submitting user action bound to the same context; a URL/epoch change invalidates preparation.

SDK 0.5.1 adds optional foreground-only native sharing:

```ts
if (context.sharing.supported) {
  await context.sharing.shareUrl({url: canonicalUrl, title: 'Post'});
}
```

The returned status is `presented`, not sent. Old hosts report unsupported; keep Copy link available. Copy only on explicit click and report success after `navigator.clipboard.writeText` resolves. If copying fails, provide a selectable URL and honest error. Never open the website to share a foreground URL.

## Design and qualification

Use buttons for actions, links for destinations, pressed state only for known state, disabled/busy feedback and accessible labels. Preserve 48 CSS-pixel action targets, keyboard focus, scalable text and light/dark themes. Menus must open menus. Website cues belong to actual website transitions, not every interactive element.

Maintain an interaction inventory beside the route inventory. Record each control, entity identity, execution owner, expected result, mutation status, readiness/disabled evidence, pending/error behavior, Back/Return and actual qualification. Test nested controls separately from parent cards; selection and modified clicks must not also activate the parent.

Check disabled/unknown source controls, recycled rows, account/tab changes, duplicate requests, coalesced receipts, source rollback, timeout, provider return and chooser cancellation. Screenshots and typechecks cannot qualify mutations. Do not submit social/account actions as routine QA without explicit mutation scope. Keep blocked read-back or source variants visible in the handoff.
