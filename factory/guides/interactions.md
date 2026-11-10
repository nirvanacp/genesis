# Interactions

A control in the foreground performs a real action on the website, in the applet's own data, or opens the website for the user. It never only looks like it did.

## Choose where the action happens

| Action | Implement it as |
| --- | --- |
| A toggle the page exposes as a button or link (vote, follow, bookmark, like) | A record action in the adapter, run with `useAction` |
| A search or filter that is a website URL | `navigate({ url })` to the results URL |
| Loading the next page of a list | A page action that clicks the site's "more" link or scrolls |
| Sign-in, sign-up, password, payment, account settings, CAPTCHA or other challenge | The website: `requiresAccount` on the page, or View website from an explicit control |
| Writing a post, comment or message | The website by default. Rebuild the form only when the user asks and it is plain fields and one submit button. |
| Applet data (categories, notes, saved lists) | `useRecords` or the applet's service |

Applet code never fills credentials, never solves challenges, and never submits anything the user did not explicitly request in that moment. During development checks you sign in to test accounts yourself on the website's own form, as the [test accounts skill](../skills/genesis-test-accounts/SKILL.md) describes; that never becomes applet behavior.

## Website features on the revealed website

Some website features work only while the user is looking at the website, because Android or the user must see them:

- **Downloads** start only from the revealed website, and the second download from one page asks the user first. A download carries the website's sign-in. `blob:` and `data:` downloads are not saved.
- **Camera, microphone and location** prompts appear only on the revealed website, and only after the user allows them in Genesis and in Android. Covering the website reloads a page that was using the camera or microphone, which stops them.
- **Windows, file pickers, `mailto:` and app links, server sign-in prompts and client certificates** appear only on the revealed website.

A hidden context gets a refusal for each of these. When a journey needs one, send the user to the website with an explicit control, such as "Download in *website*", that calls `viewWebsite()`.

## Actions describe the desired state

An action is a function in the adapter. It receives the record's element (the item for a collection, the root for a single region, `null` for a page action) and the caller's args, looks at the page as it is now, and returns either `{ satisfied: true }` when the page already shows the wanted state, or the steps that get there and the evidence that they did:

```ts
// adapter
export function setVoted(doc: Document, id: string, args: { voted?: unknown }): ActionSpec {
  const voted = args?.voted;
  if (typeof voted !== "boolean") throw new Error("setVoted needs { voted: boolean }");
  const shows = (d: Document) => d.querySelector(`[id="un_${id}"]`) !== null;
  if (shows(doc) === voted) return { satisfied: true };
  const link = `[id="${voted ? "up" : "un"}_${id}"]`;
  if (!doc.querySelector(link)) throw new Error(voted ? "This item cannot be upvoted here" : "This vote cannot be undone here");
  return { steps: [{ click: link }], until: d => shows(d) === voted };
}

stories: collection({ /* ... */ actions: { setVoted: (row, args) => setVoted(row!.ownerDocument, row!.id, args) } }),
```

```tsx
// foreground
const setVoted = useAction<{ voted: boolean }>("setVoted", "stories");
const result = await setVoted(story.key, { voted: !story.data.voted });
if (result.outcome !== "observed") setNotice("The vote didn't go through. Try again.");
```

- Name actions after the state they set (`setVoted`, `setFollowing`) and pass the wanted value, not "toggle". A repeated call then does nothing harmful, and `{ satisfied: true }` resolves at once with `noop: true`.
- The action targets the record by its key; Genesis finds the element again when the action runs. A record that is gone fails with `TARGET_NOT_FOUND`.
- Use the site's own controls, which carry the site's tokens. Never read tokens into records or build requests yourself.
- Keep the function synchronous and free of side effects. A throw, a returned promise or an invalid spec fails with `INVALID_STEPS` and the message; throw with a sentence the screen can show.

## Steps

Steps run in order. Selectors are CSS selectors.

| Step | Effect |
| --- | --- |
| `{ click: selector }` | Clicks the first match. |
| `{ fill: selector, value }` | Sets an input or textarea the way typing does, firing `input` and `change`. |
| `{ submit: selector }` | Submits the form that is or contains the match. Target the form, or its submit button to use that button. Last step only. |
| `{ navigate: url }` | Loads `url` in the context. Last step only. |
| `{ waitFor: selector, timeoutMs }` | Waits until the selector matches. |
| `{ waitForUrl: pattern, timeoutMs }` | Waits until `location.href` matches the regular expression. |
| `{ scroll: { target, to } }` | Scrolls the element that `target` selects, or `"window"`, to `"end"` or to a pixel offset. |

A step whose selector finds nothing fails with `NOT_FOUND`. The target record is checked again after each wait. The whole action has a deadline of `deadlineMs`, or 15 seconds; running out fails with `DEADLINE` and reports `completedSteps`.

## Evidence: `until`

`until` is the evidence that the action worked: a function of the document that returns `true`, or a selector that must match. After the steps, Genesis waits for it to return `true` within the deadline, then reads the page and delivers the new records before the result. If it never does, the outcome is `unknown` with code `DEADLINE`: the click happened, but the page did not show the result, so the action may or may not have taken effect. Without `until`, the action is `observed` once its steps finish.

Write `until` from what the user would check: the new button state, the new item in the list, a changed count.

## Navigating actions and `expect`

An action that ends in `navigate` or `submit`, or that sets `navigates: true` because its click loads another page, ends on another page. A click that unloads the page partway through an action is handled the same way. The destination decides the outcome:

```ts
submit: () => ({ steps: [{ submit: FORM }], navigates: true, expect: { page: ["item", "feed"], notPage: "submit" } }),
loadMore: () => ({ steps: [{ click: "a.morelink" }], navigates: true, expect: { page: "feed" } }),
```

| Destination | Outcome |
| --- | --- |
| A ready page whose page id is in `expect.page` (any routed page when `expect.page` is unset) | `observed` |
| A page in `expect.notPage`, such as the form shown again with the site's error | `failed`, code `REJECTED` |
| An `auth` page | `failed`, code `AUTH_REQUIRED` |
| Anything else: no route, an error, a page outside `expect.page`, or no destination within the deadline | `unknown` |

After `REJECTED`, the destination page is the same form with the site's message; read it from the region and show it. After `unknown`, tell the user to check the website, and do not offer to submit again until they have looked.

## Outcomes

`useAction` returns a promise that never rejects. Handle each outcome:

| Outcome | Meaning | Show |
| --- | --- | --- |
| `observed` | The page shows the result. | The new state, from the records. |
| `failed` | The action did not take effect: `TARGET_NOT_FOUND`, `NOT_FOUND`, `INVALID_STEPS`, `NOT_READY`, `REJECTED`, `AUTH_REQUIRED`, or `DEADLINE` before the steps finished. | The previous state and what went wrong. |
| `unknown` | It may have taken effect: `DEADLINE` waiting for evidence, the context left the page for another reason, the account changed (`CONTEXT_REPLACED`), or the applet was retired (`RETIRED`). | That the outcome is uncertain, and a way to check the website. |
| `cancelled` | The action was stopped before it ran. The SDK has no call that cancels an action, so treat it like `failed`. | The previous state. |

Actions in one context run one at a time, in the order they arrive. Identical pending calls share one promise, so a double tap runs once.

## Optimistic display with `usePending`

Show the requested state while the action runs, from `usePending`, and the page's state otherwise. The pending list empties when the result arrives, and by then the records already show the page's state, so the control never flickers back.

```tsx
const pending = usePending("stories", story.key).find(action => action.name === "setVoted");
const voted = pending ? (pending.args as { voted: boolean }).voted : story.data.voted;
```

Do not keep a separate optimistic copy in React state that can disagree with the page. Keep the rest of the screen usable while an action runs.

## No retries

Genesis never retries an action, and the applet should not either. A retry after `unknown` can vote twice or post twice. After `failed`, let the user try again with the control. Desired-state actions make the user's second tap safe: if the first one took effect, the second is `satisfied`.

## Loading more

```ts
function loadMore(): ActionSpec {
  const before = lastKey(document);
  return { steps: [{ scroll: { target: "window", to: "end" } }], until: doc => lastKey(doc) !== before, deadlineMs: 10_000 };
}
```

A site with a "more" link loads the next page with a navigating click and `expect`. An infinite-scroll site scrolls to the end, with `until` comparing the last item, on a `virtualized` region. Disable the More control while the action is pending.

## Controls

Every element that looks interactive does something: a menu icon opens a real menu, an image opens that image, a quoted post opens the quote, a username opens the profile. Do not invent destinations from appearance; use the URLs the adapter read. Mark controls that open the website with the [website cue](defaults.md). Label icon buttons with what they do and their current state ("Upvote", "Remove upvote").

Pull to refresh and the Refresh control reload the current page with `useNavigation().reload()`. The screen keeps showing the last copy, marked `stale`, until the new page is ready; show the outcome then. `reload(contextId)` reloads another context, for example an account context after the app resumes.

## Interaction inventory

List every control on each screen in `.specs/current.md`: what it does, where it happens (action, navigation, website or applet data), its pending, failure and unknown behavior, and whether it was exercised on the device. Opening a form proves the form opens; it does not prove submission.
