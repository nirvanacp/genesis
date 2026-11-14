# Interactions

A control in the UI performs a real action on the website, in the applet's own data, or opens the website for the user. It never only looks like it did.

## Choose where the action happens

| Action | Implement it as |
| --- | --- |
| A toggle the page exposes as a button or link (vote, follow, bookmark, like) | A page module command that sets the wanted state, run with `useCommand` |
| A search or filter that is a website URL | `navigate({ url })` to the results URL |
| Loading the next page of a list | A command that clicks the site's "more" link or scrolls |
| Sign-in, sign-up, password, payment, account settings, CAPTCHA or other challenge | The website: `requiresAccount` on the route, or View website from an explicit control |
| Writing a post, comment or message | The website by default. Rebuild the form only when the user asks and it is plain fields and one submit button. |
| Applet data (categories, notes, saved lists) | `useRecords` or the applet's service |
| Attaching a photo or file to a post, message or profile | `genesis.files.pick` from a tap in the UI, then `attachFiles` on the website's file input |
| Saving, sharing or opening something in another app | `genesis.downloads.save`, `genesis.share` or `genesis.links.openExternal`, from a tap in the UI |

Applet code never fills credentials, never solves challenges, and never submits anything the user did not explicitly request in that moment. The page agent refuses to `fill`, `type` or `press` into password, one-time code and card fields with `PROTECTED_FIELD`. During development checks you sign in to test accounts yourself on the website's own form, as the [test accounts skill](../skills/genesis-test-accounts/SKILL.md) describes; that never becomes applet behavior.

## Website features on the revealed website

Some website features work only while the user is looking at the website, because Android or the user must see them:

- Downloads start only from the revealed website, and the second download from one page asks the user first. A download carries the website's sign-in. `data:` downloads are saved, and so are `blob:` downloads on the manifest's origins, where the page agent reads them; other `blob:` downloads are not.
- Camera, microphone and location prompts appear only on the revealed website, and only after the user allows them in Genesis and in Android. Covering the website reloads a page that was using the camera or microphone, which stops them.
- Windows, file pickers, `mailto:` and app links, server sign-in prompts and client certificates appear only on the revealed website.

A hidden context gets a refusal for each of these. When a journey needs one, send the user to the website with an explicit control, such as "Download in *website*", that calls `viewWebsite()` from `useRouter`. For files, downloads, sharing and links, the applet UI can also act itself; see [User actions](#user-actions). For fullscreen, a download, a window, a link to another app or the location prompt, the applet can instead give the hidden page a one-time grant.

## One-time grants

`context.allow(grant)` lets a hidden page use one of these features once, within 5 seconds: `fullscreen`, `download`, `window`, `handoff` (a link that opens another app) or `location`. It is a user action, so call it straight from the handler of a tap on the applet control that asks for the feature, then drive the page to it, usually with a trusted click:

```tsx
<button onClick={async () => {
  await video.allow("fullscreen");
  await video.click(css("button.fullscreen"), { input: "trusted" });
}}>Full screen</button>
```

- Fullscreen shows over the applet while the context stays hidden; Back or the page's own exit returns to the applet. A window opens in a sheet over the applet, under the website bar; closing it returns to the applet. A download goes to Downloads, and the location prompt shows over the applet.
- A grant ends when the page uses it, after 5 seconds, and when the page navigates, the context is revealed or covered, or a window opens. A new grant replaces an unused one. `onGrantEnded` and `useGrant` report the end, with `used`.
- A revealed context needs no grant: `allow` resolves with `expiresInMs: 0`.
- Ask only for the feature the user's control names, never ahead of time. Without a fresh tap `allow` rejects with `USER_ACTION_REQUIRED`; it needs `limits.grants`.

## User actions

Picking files, saving to Downloads, sharing, opening another app and turning notifications on are things only the user starts. Call `genesis.files.pick`, `downloads.save`, `share`, `links.openExternal` or `notifications.enable` straight from the handler of a tap on the applet UI: each runs only within 3 seconds of that tap, once per tap, and otherwise rejects with `USER_ACTION_REQUIRED`. Do not call them after a slow await, from a timer or from a page event; when one rejects that way, ask the user to tap again. An `<input type="file">` in the applet UI opens no picker. Show picked files with their `previewUrl` and give them to the website with `attachFiles`; keep the ids in memory only, as `useFilePicker` does, and never store them. See [User actions](sdk-reference.md#user-actions).

## Website dialogs

A website can ask with `confirm`, `alert`, `prompt` or a "leave this page?" question, often before it deletes, discards or leaves something. In a hidden context the page waits for the answer. Every routed screen whose actions can lead to such a dialog renders `useDialog()`, for example through `WebsiteDialog` or the applet's own sheet, showing the site's origin and its exact message. Answer only with the user's choice: never accept or dismiss a dialog in code. An applet that does not claim a dialog within about a second sees the website revealed with the dialog over it, which is safe but shows the website. See [Website dialogs](sdk-reference.md#website-dialogs).

## Commands describe the desired state

A command is a function in the page module. It receives the page as it is now and the caller's args, and returns one of three things: `{ satisfied: true }` when the page already shows the wanted state, the steps that get there with the evidence that they did, or a plain JSON value:

```ts
// page module
import { definePageModule, type CommandSteps } from "@genesis/sdk/page";

function setVoted(doc: Document, args: unknown): CommandSteps | { satisfied: true } {
  const { id, voted } = (args ?? {}) as { id?: unknown; voted?: unknown };
  if (typeof id !== "string" || typeof voted !== "boolean") throw new Error("setVoted needs { id, voted: boolean }");
  const shows = (d: Document) => d.querySelector(`[id="un_${id}"]`) !== null;
  if (shows(doc) === voted) return { satisfied: true };
  const link = `[id="${voted ? "up" : "un"}_${id}"]`;
  if (!doc.querySelector(link)) throw new Error(voted ? "This item cannot be upvoted here" : "This vote cannot be undone here");
  return { steps: [{ op: "click", target: { css: link } }], until: d => shows(d) === voted };
}

export default definePageModule({
  commands: {
    setVoted: ({ document }, args) => setVoted(document, args),
  },
});
```

```tsx
// UI
const setVoted = useCommand<{ id: string; voted: boolean }>("setVoted");
const result = await setVoted({ id: story.id, voted: !story.voted });
if (result.outcome !== "observed") setNotice("The vote didn't go through. Try again.");
```

- Name commands after the state they set (`setVoted`, `setFollowing`) and pass the wanted value, not "toggle". A repeated call then does nothing harmful, and `{ satisfied: true }` resolves at once as `observed` with `noop: true`.
- Pass a `target` locator to have the page agent find an element first; the command receives it as `element`. A record locator, `record(watchId, key)`, finds the record's element again when the command runs. A record that is gone fails with `TARGET_NOT_FOUND`.
- Use the site's own controls, which carry the site's tokens. Never read tokens into records or build requests yourself.
- Keep the function synchronous and free of side effects. A throw, a returned promise or invalid steps fail with `INVALID_STEPS` and the message, so throw with a sentence the screen can show.
- A command that returns a JSON value answers `observed` with that `value`.

[Page modules](page-modules.md) covers commands and readers in full.

## Page operations

Steps are page operations, written as `{ op, ...args }`. The same operations are methods of a context handle (`genesis.context(id).click(target)`), steps of `run`, and steps a command returns. Targets are locators: a CSS selector, a role and name, text, or a record of an open list watch, narrowed with `within`, `nth` or `frame`, as [page control](page-control.md) describes.

| Operation | Effect |
| --- | --- |
| `click` | Clicks the target. `gesture` is `click` (default), `tap` or `mouse`; `count: 2` double-clicks. |
| `longPress` | Presses and holds the target for `ms`. |
| `hover`, `unhover` | Moves the pointer over the target, or away. |
| `focus`, `blur` | Moves focus to the target, or away from it. |
| `fill` | Sets an input, textarea or editable element to `value`, firing `input` and `change`. |
| `type` | Types `text` into the target key by key. |
| `press` | Presses `key` with optional `modifiers`, on `target` or on the focused element. |
| `select` | Chooses options of a `select` by `values` or `labels`. |
| `check` | Sets a checkbox or radio to `checked`. |
| `scroll` | Scrolls `target`, or the page, to `"start"`, `"end"`, `"intoView"`, `{ x, y }` or `{ by: { x, y } }`. |
| `submit` | Submits the form that is or contains the target. Target the form, or its submit button to use that button. Last step only. |
| `attachFiles` | Gives picked `files` to the target: a file input (default), or a drop zone or editor with `via: "drop"` or `"paste"`. |
| `wait` | Waits up to `timeoutMs` for an element state, a URL guard or a truthy read. |
| `navigate` | Loads `url` in the context. Last step only. |

Each input waits up to its `timeoutMs` (default 0) for the target to exist and be actionable, unless `force` skips that check. Steps run in order inside the page, with no round trip between them. A run has a deadline of `deadlineMs`, or the call's time limit, 15 seconds by default; running out fails with `DEADLINE` and reports `completedSteps`. Inputs in one context run one at a time, in the order they arrive.

### Trusted input

By default the page agent dispatches DOM events, which the page sees as synthetic. `input: "trusted"` asks the shell to send real Android input to the hidden page instead: the events are trusted, CSS `:hover` applies, and a tap or key gives the page user activation. Only `click` (as one touch tap), `hover`, `unhover`, `type` and `press` take it. It needs `limits.trustedInput`; where that is off, and in a context whose website is revealed, the input fails with `INPUT_UNAVAILABLE`. Use it only when the site ignores synthetic events.

## Evidence: `until`

`until` is the evidence that the input worked: an element reaching a state (`{ target, state: "visible" }`, `"hidden"`, `"attached"` or `"detached"`), or a read whose value is truthy (`{ read }`). In a page module it may also be a function of the document that returns `true`. After the steps, the page agent waits for it within the deadline, and delivers the watches' new records before the result. If it never holds, the outcome is `unknown` with code `DEADLINE`: the click happened, but the page did not show the result, so the input may or may not have taken effect. Without `until`, an input is `observed` once its steps finish.

Write `until` from what the user would check: the new button state, the new item in the list, a changed count.

## Inputs that leave the page, and `expect`

An input that ends in `navigate` or `submit`, that sets `navigates: true` because its click loads another page, or that passes `expect`, ends on another page. A click that unloads the page partway through is handled the same way. The client waits up to 15 seconds for the destination and judges it against `expect`, which takes URL guards and an optional read:

```tsx
const submit = useCommand("submit");
const loadMore = useCommand("loadMore");

void submit(undefined, { navigates: true, expect: { url: [{ pattern: "/item", query: ["id"] }, { pattern: "/newest" }], notUrl: [{ pattern: "/r" }] } });
void loadMore(undefined, { expect: { url: [{ pattern: "/news" }] } });
```

| Destination | Outcome |
| --- | --- |
| A URL in `expect.notUrl`, such as the form shown again with the site's error | `failed`, code `REJECTED` |
| A URL in `expect.url` (any URL when it is unset) whose `expect.read`, when given, is truthy | `observed` |
| Any other URL, a falsy read, or a call without `expect` | `unknown` |
| No destination within the deadline | `unknown`, code `DEADLINE` |

After `REJECTED`, the destination is the same form with the site's message; read it with a watch and show it. After `unknown`, tell the user to check the website, and do not offer to submit again until they have looked. A destination that needs an account is not judged specially: write its URL into `notUrl` when the site has a sign-in page of its own, and let the router show it.

## Outcomes

Every input and command returns a promise that never rejects. Handle each outcome:

| Outcome | Meaning | Show |
| --- | --- | --- |
| `observed` | The page shows the result. | The new state, from the watches. |
| `failed` | The input did not take effect: `TARGET_NOT_FOUND`, `NOT_FOUND`, `NOT_ACTIONABLE`, `AMBIGUOUS_TARGET`, `PROTECTED_FIELD`, `INVALID_STEPS`, `INVALID_ARGUMENT`, `NOT_READY`, `INPUT_UNAVAILABLE`, `REJECTED`, or `DEADLINE` before any step had an effect. | The previous state and what went wrong. |
| `unknown` | It may have taken effect: `DEADLINE` waiting for evidence or a destination, or when the client stopped waiting for an answer that never arrived; an error after a step had an effect; a destination outside `expect`; the account changed (`CONTEXT_REPLACED`); or the applet was retired (`RETIRED`). | That the outcome is uncertain, and a way to check the website. |
| `cancelled` | The input was stopped before it reached the page, by `cancel()` on the context. | The previous state. |

Identical pending calls share one promise, so a double tap runs once. `partial: true` with `completedSteps` says how far a multi-step input got.

## Optimistic display with `usePending`

Show the requested state while the input runs, from `usePending`, and the page's state otherwise. An entry leaves the pending list when its result arrives, and by then the watches already show the page's state, so the control never flickers back. A command shows up as op `invoke` with its name in `args.command` and its own args in `args.args`:

```tsx
const pending = usePending().find(input => input.op === "invoke" && input.args.command === "setVoted"
  && (input.args.args as { id?: string } | undefined)?.id === story.id);
const voted = pending ? (pending.args.args as { voted: boolean }).voted : story.voted;
```

Do not keep a separate optimistic copy in React state that can disagree with the page. Keep the rest of the screen usable while an input runs.

## No retries

Genesis never retries an input, and the applet should not either. A retry after `unknown` can vote twice or post twice. After `failed`, let the user try again with the control. Desired-state commands make the user's second tap safe: if the first one took effect, the second is `satisfied`.

Inputs follow the user's pace: one tap, one write (see [User-paced writes](rules.md#user-paced-writes)). Each context takes `limits.inputBurst` input calls at once and then one more each `limits.inputRefillMs`; reads, watches, waits, scrolling, focus and hover are free. An input over the budget is `failed` with `RATE_LIMITED`, and nothing reached the page. Show it like any failure and let the user tap again; never queue or retry it on a timer.

## Loading more

```ts
import type { CommandSteps } from "@genesis/sdk/page";

const lastKey = (doc: Document) => doc.querySelector("article:last-of-type")?.id ?? null;

function loadMore(doc: Document): CommandSteps {
  const before = lastKey(doc);
  return { steps: [{ op: "scroll", to: "end" }], until: d => lastKey(d) !== before, deadlineMs: 10_000 };
}
```

A site with a "more" link loads the next page with a navigating click and `expect`. An infinite-scroll site scrolls to the end, with `until` comparing the last item, on a `virtualized` list reader. Disable the More control while the command is pending.

## Controls

Every element that looks interactive does something: a menu icon opens a real menu, an image opens that image, a quoted post opens the quote, a username opens the profile. Do not invent destinations from appearance; use the URLs the page module read. Mark controls that open the website with the [website cue](defaults.md). Label icon buttons with what they do and their current state ("Upvote", "Remove upvote").

Pull to refresh and the Refresh control reload the current page with `useRouter().reload()`. The screen keeps showing the last copy, marked `stale`, until the new page is ready; show the outcome then. `reload(contextId)` reloads another context, for example an account context after the app resumes.

## Interaction inventory

List every control on each screen in `.specs/current.md`: what it does, where it happens (command, input, navigation, website or applet data), its pending, failure and unknown behavior, and whether it was exercised on the device. Opening a form proves the form opens; it does not prove submission.
