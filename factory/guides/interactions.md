# Interactions

A control in the foreground performs a real action on the website, in the applet's own data, or opens the website for the user. It never only looks like it did.

## Choose where the action happens

| Action | Implement it as |
| --- | --- |
| A simple toggle the page exposes as a button or link (vote, follow, bookmark, like) | An adapter intent with driver steps, sent with `useIntent` |
| A search or filter that is a website URL | `navigate({ kind: "route", url })` to the results URL |
| Sign-in, sign-up, password, payment, account settings, CAPTCHA or other challenge | A website route, or `navigate({ kind: "website", url })` from an explicit control |
| Writing a post, comment or message | The website sheet by default. Rebuild the editor only when the user asks and the form is plain fields and one submit button. |
| Applet data (categories, notes, saved lists) | `useRecords` or the applet's service |

Never fill credentials, never solve challenges, and never submit anything the user did not explicitly request in that moment.

## Intents

```ts
// adapter
intents: {
  vote: (intent, doc) => {
    const button = `#up_${CSS.escape(intent.id)}`;
    if (!doc.querySelector(button)) return [];          // nothing to do; act() resolves
    return [{ click: button }, { waitFor: `#un_${CSS.escape(intent.id)}`, timeoutMs: 5000 }];
  },
  search: intent => [{ fill: "input[name=q]", value: String(intent.query) }, { submit: "form.search" }],
},
```

```tsx
// foreground
const { act, pending } = useIntent("main");
async function vote() {
  try { await act({ name: "vote", id: item.id }); }
  catch (error) { setNotice("The vote did not go through. Try again."); }
}
```

- Target the current entity by its stable id, never by its position on the page.
- End with a wait for the observable result, such as the new button state or the result URL, so `act` resolves only when the website accepted the action.
- After `act` resolves, read the new state from the next snapshot. Do not keep a separate optimistic copy that can disagree with the page. When you show an optimistic state, revert it on failure.
- Disable the control while `pending` and keep the rest of the screen usable.
- Intents that end in `navigate` or `submit` resolve when the new page starts loading. Wait for the destination screen's snapshot before claiming the outcome.
- When an intent fails, say so and leave the control as it was. `DEADLINE` after a submit means the outcome is unknown: reread before offering to try again.

## Controls

Every element that looks interactive does something: a menu icon opens a real menu, an image opens that image, a quoted post opens the quote, a username opens the profile. Do not invent destinations from appearance; use the URLs the adapter extracted. Mark controls that open the website sheet with the [website cue](defaults.md). Label icon buttons with what they do and their current state ("Upvote", "Remove upvote").

Pull to refresh and the Refresh control reload the current page with `useNavigation().reload()`. Navigating to the same URL does not reload it. The screen keeps showing its cached data, marked `stale`, until the new snapshot arrives; show the outcome then. `reload(sourceId)` reloads another source's last page, for example an account source after the app resumes.

## Interaction inventory

List every control on each screen in `.specs/current.md`: what it does, where it happens (intent, route, website or applet data), its pending and failure behavior, and whether it was exercised on the device. Opening a form proves the form opens; it does not prove submission.
