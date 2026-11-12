# Page control

An applet reads and drives the website through the page agent, a script Genesis runs in every page of the applet's contexts. The UI asks the agent to read the page, to keep a read up to date (a watch), and to send input. This guide covers what each of those does in the page and what the UI gets back.

The examples use `@genesis/sdk`. Every call is a `page.call` message underneath; [the protocol](protocol.md) specifies the messages, and [the SDK reference](sdk-reference.md) lists every function. Readers and commands that run inside the page are covered in [page modules](page-modules.md).

```ts
import { connect, css, field, record, role, text } from "@genesis/sdk";

const genesis = await connect();
const hn = genesis.context("primary");
```

A context handle always talks to the context's current document. When that document is replaced or not ready yet, reads try again on the next page within their budget, and inputs answer `failed` with `NOT_READY`.

To try locators and reads on a live page, open the website in a debuggable build of Genesis and inspect its WebView from Chrome's remote inspector (`chrome://inspect`).

## Locators

A locator says which element an operation acts on. It is plain JSON, and the agent resolves it when the operation runs, so a locator stays valid when the website re-renders the element.

| Helper | Locator | Finds |
| --- | --- | --- |
| `css(".titleline > a")` | `{ css }` | Elements matching a CSS selector. |
| `role("button", "Reply")` | `{ role, name }` | Elements with an ARIA role whose accessible name contains the text. |
| `text("More", { exact: true })` | `{ text, exact }` | The deepest elements whose text contains (or equals) the text. |
| `record("stories", key, ".votearrow")` | `{ record, css }` | Inside the element of one record of an open list watch. |

Each helper takes the other locator keys as options:

| Key | Use |
| --- | --- |
| `within` | Search inside the first match of another locator. |
| `has` | Keep only elements that contain a match of another locator. |
| `nth` | Pick one match by index; `-1` is the last. |
| `text` | With `css` or `role`, keep matches whose text contains it. |
| `strict` | Fail with `AMBIGUOUS_TARGET` when more than one element matches. |
| `pierce` | Also search open shadow roots. |
| `frame` | Search inside a same-origin iframe. |

```ts
const reply = role("link", "reply", { within: record("comments", "41234570") });
const firstStory = css("tr.athing", { nth: 0 });
const loginForm = css("form", { has: css("input[name=acct]") });
```

Prefer `record` for anything inside a list item: it finds the item by its key, not by its position, so it still finds the right row after the list changes. Prefer `role` and visible text over class names that a website build renames. Text comparisons ignore case and collapse white space.

A locator that matches nothing fails with `NOT_FOUND`, and a record key no longer on the page fails with `TARGET_NOT_FOUND`. A locator with several matches uses the first unless it is `strict`.

## Reads

`read` takes a read specification and returns its value once.

| Shape | Value |
| --- | --- |
| `{ one, fields }` | One record, or null when `one` matches nothing. |
| `{ list, key, fields }` | `{ order, records, truncated?, complete? }` |
| `{ reader, args? }` | Whatever the page module's reader returns. |

A field says where to look (`at`, a selector inside the element) and what to take. The `field` helpers build them: `field.text(at)`, `field.ownText(at)`, `field.number(at)`, `field.url(at)`, `field.value(at)`, `field.checked(at)`, `field.visible(at)`, `field.rect(at)`, `field.exists(at)`, `field.count(at)` and `field.attr(name, at)`.

```ts
interface Story {
  title: string;
  link: string | null;
  points: number | null;
}

const front = await hn.read<{ order: string[]; records: Record<string, Story> }>({
  list: css("tr.athing"),
  key: field.attr("id"),
  fields: {
    title: field.text(".titleline > a"),
    link: field.url(".titleline > a"),
    points: field.number(".score"),
  },
  limit: 30,
});
```

| Take | Value |
| --- | --- |
| `text` | Rendered text, white space collapsed, at most `max` characters (default 2000). |
| `ownText` | The element's own text, without its children's. |
| `number` | The first number in the text, thousands separators removed, or null. |
| `url` | `href` or `src` as an absolute URL. |
| `value` | A form control's value. |
| `checked` | A checkbox or radio state, or `aria-checked`, `aria-pressed` or `aria-selected`; null when none applies. |
| `visible` | Whether the element is rendered and not hidden. |
| `rect` | `{ x, y, width, height }` in CSS pixels. |
| `exists` | Whether `at` matches. |
| `count` | How many elements `at` matches. |
| `attr` | An attribute's value, or null. |

A field whose `at` matches nothing is null, so a missing score reads `points: null` rather than failing the read. `all: true` reads every match of `at` into an array. `fields` in place of `take` reads a nested record.

The `key` of a list reads one value per item and must be unique and non-empty: two items with one key fail with `CONFLICT`. Use the website's own id (an `id` attribute, a URL), not the item's text.

### Protected values

The agent never reads a password, a hidden input, or a field marked for one-time codes, new or current passwords, or card details (`autocomplete` of `current-password`, `new-password`, `one-time-code` or `cc-*`). Their `value` reads null. `fill`, `type` and `press` into one fail with `PROTECTED_FIELD`. The user types those on the website.

## Watches

A watch keeps a read up to date. The agent observes the page, re-reads what changed, and sends the difference; the handle holds the current value.

```ts
const stories = hn.watch<never, Story>(
  "stories",
  {
    list: css("tr.athing"),
    key: field.attr("id"),
    fields: { title: field.text(".titleline > a"), link: field.url(".titleline > a") },
  },
  { when: [{ pattern: "/" }, { pattern: "/news" }] },
);

const stop = stories.subscribe(() => {
  const value = stories.get();
  if (value.status === "ready") console.log(value.order.length, "stories");
});
```

`get()` returns a `WatchValue`:

| Field | Meaning |
| --- | --- |
| `status` | `loading` until the first snapshot of the current page, then `ready` or `error`. |
| `idle` | The page URL matches none of the `when` guards, so the agent is not reading. |
| `stale` | The data comes from an earlier copy of this page. |
| `value` | A `one` or `reader` read's value; null for a list. |
| `order`, `records` | A list's keys in page order and its records by key. |
| `error` | The failure when `status` is `error`. |
| `truncated` | The list has more items than the read keeps. |
| `complete` | For a reader with a "more" link: false while the page offers more. |
| `view` | The page the data was read from. |

Records keep their object identity while their data is unchanged, so a UI can compare them by reference.

Opening the same id with the same specification returns a handle to the same watch; each handle is counted, and the watch closes when every handle is closed. Opening the same id with another specification throws `CONFLICT`. A context document allows `limits.watchesMax` open watches.

### `when` and idle

`when` lists URL guards, `{ pattern, query? }`, in route syntax. While the URL matches none, the watch is `idle` and costs nothing; when the URL matches again, a fresh snapshot arrives. Give every watch a `when` that names the pages it belongs to, so a watch of the front page does not read a comment page and report an empty list.

A single-page website changes its URL without loading a new document. The agent counts such route changes as a new view, waits for the DOM to settle, and sends a fresh snapshot, so records of the old route never mix with the new one.

### Stale data

The client keeps the last ready copy of each watch per history entry, for up to `limits.historyEntriesMax` entries. Back to an entry, or a reload of the same URL, shows that copy at once with `stale: true` and `status: "loading"` until the new snapshot arrives. When the page fails after it was ready, the watch keeps its data with `stale: true` and sets `error`. Show stale data, marked as updating, rather than a blank screen.

After the applet comes back from the background, every watch asks for a fresh snapshot. When a patch arrives out of order, the client asks for one too.

### Virtualized lists

Some websites keep only the visible rows in the DOM. Mark such a list `virtualized: true`: records whose elements leave the DOM stay in the list with `present: false` in their data, so the list grows as the user scrolls the website instead of losing rows. A record with `present: false` cannot be the target of input until it is back on the page; scroll it into view first.

### Large lists

A list keeps at most `limit` items, and never more than five times `limits.patchRecordsMax`. Past that, the value has `truncated: true`. Set `limit` to what the screen shows. A virtualized list that grows past `limits.pageMaxBytes` drops the records farthest from the screen; any other watch over that size reports `error` with `PAGE_TOO_LARGE`.

## Input

Input operations act on the page as a user would. Each answers an `ActionResult` and never rejects for a problem in the page.

| Method | What it sends |
| --- | --- |
| `click(target, { gesture, count })` | `gesture: "click"` (default) calls the element's `click()`, twice plus `dblclick` for `count: 2`. `"tap"` sends pointer and touch events, then the mouse events and `click` unless the page cancelled `touchend`. `"mouse"` sends pointer and mouse events with `click`, and `dblclick` for `count: 2`. |
| `longPress(target, { ms })` | `pointerdown`, a wait of `ms` (default 600), then `contextmenu` and `pointerup`. |
| `hover(target)` | Pointer and mouse over, enter and move. Unhovers the previous element first. |
| `unhover()` | Pointer and mouse out and leave on the last hovered element. |
| `focus(target)`, `blur(target)` | Focuses or blurs the element. |
| `fill(target, value)` | Sets an input's or textarea's value at once, with `input` and `change`. |
| `type(target, text)` | Per character: `keydown`, `keypress`, `beforeinput`, the value, `input`, `keyup`. In a contenteditable element, inserts the text as an editing command. |
| `press(key, { target, modifiers })` | `keydown`, `keypress` for characters and Enter, `keyup`, to the target or the focused element. Unless the page cancels the key, Enter in a text field submits its form, Enter or Space on a button or link clicks it, Tab moves focus, and a character is inserted into a text field. |
| `select(target, { values, labels })` | Chooses options of a `select` by value or label, with `input` and `change`. |
| `check(target, checked)` | Clicks the control when its checked state (or `aria-checked`) differs, then waits until it holds. |
| `submit(target)` | Submits the form. |
| `scroll(to, { target })` | Scrolls the page or the target: `"start"`, `"end"`, `"intoView"`, `{ x, y }` or `{ by: { x, y } }`. Answers the scroll position with `atEnd`. |

```ts
await hn.fill(css("input[name=q]"), "rust");
await hn.press("Enter", { target: css("input[name=q]"), expect: { url: [{ pattern: "/search" }] } });
await hn.check(css("input[name=showdead]"), true);
const position = await hn.scroll("end");
if (position.atEnd) console.log("at the bottom");
```

Inputs to one context run one at a time, in the order the UI sent them. Reads do not wait behind them.

An input sent twice while the first is still pending (the same operation, arguments, `expect` and `navigates`) shares the first one's promise, so a double tap on an applet button sends the input once. `pending(target?)` lists the inputs not settled yet, for optimistic display; `cancel()` cancels the ones that have not reached the page.

### Steps

`run` sends several steps that the agent runs inside the page without a round trip between them. `navigate` and `submit` may only be the last step.

```ts
await hn.run(
  [
    { op: "fill", target: css("textarea[name=text]"), value: "Thanks for writing this up." },
    { op: "submit", target: css("form[action=comment]") },
  ],
  { expect: { url: [{ pattern: "/item" }] } },
);
```

A step can also wait: `{ op: "wait", for: { target, state }, timeoutMs }`, with `for` also accepting `{ url }` or `{ read }`.

## Actionability

Before an input, the agent checks that the target can take it, and polls every 50 ms until it can or `timeoutMs` (default 0) runs out. The check scrolls the target into the middle of the view first.

| Reason | The target is |
| --- | --- |
| `detached` | no longer in the document. |
| `hidden` | without a box, `display: none`, or `visibility: hidden` or `collapse`. |
| `disabled` | `disabled`, inside a disabled fieldset, or `aria-disabled`. |
| `covered` | under another element at its center (its own label does not count). |

A failed check answers `failed` with `NOT_ACTIONABLE` and the reason in `reason`. Give `timeoutMs` when the target appears after an animation or a load. `force: true` skips the check; use it only for an element the website hides on purpose but still handles.

Other `NOT_ACTIONABLE` reasons come from the operation itself: `not-a-text-field` (`fill`), `not-editable` (`type`), `not-a-select` (`select`), and `editor-needs-trusted-input` (`type` into a rich text editor that ignores the editing command). A `check` whose control does not reach the wanted state answers `DEADLINE` with the reason `state-unchanged`.

## Fidelity

Input is synthetic by default: the agent dispatches DOM events from the page. Synthetic events have `isTrusted` false, CSS `:hover` does not apply, and they give the page no user activation, so a website that checks any of these ignores them.

`input: "trusted"` asks the shell to send real Android input to the hidden context. It works for `click` (one touch tap, with no other `gesture` or `count`), `hover`, `unhover`, `type` and `press`.

```ts
if (genesis.limits.trustedInput) {
  await hn.hover(css(".menu-trigger"), { input: "trusted" });
  await hn.type(css("[contenteditable]"), "Hello", { input: "trusted" });
}
```

| | Synthetic | Trusted |
| --- | --- | --- |
| `isTrusted` | false | true |
| CSS `:hover` | no | yes |
| User activation | no | a tap or key gives it; hover does not |
| Rich text editors | often ignore it | work |
| Available | always | when `limits.trustedInput` is true and the context is not revealed |

Trusted input fails with `INPUT_UNAVAILABLE` when this Genesis cannot send it, and while the context is revealed, because the user is then looking at the website and applet input would pass as theirs. Use trusted input only where synthetic input does not work.

## Evidence and outcomes

An input's result says what is known about its effect:

| Outcome | Meaning | What the UI does |
| --- | --- | --- |
| `observed` | The input ran and its evidence held. | Show the new state. |
| `failed` | Nothing reached the page. `code` and `reason` say why. | Safe to offer again. |
| `unknown` | Input reached the page, but its effect was not seen. | Never repeat it blindly; read the page or send the user to the website. |
| `cancelled` | Cancelled before any input reached the page. | Nothing happened. |

`noop: true` with `observed` means the wanted state already held and no input was sent, as with `check` on a box that is already checked. `completedSteps` and `partial` say how far a sequence got.

### `until`

`until` is evidence that the input worked on the same page: `{ target, state }` with `state` of `attached`, `visible`, `hidden` or `detached`, or `{ read }`, which holds when the value is truthy (a list, when it has a record). The agent waits for it after the input, until the call's budget runs out. Without `until`, an input that does not leave the page is `observed` once it ran.

```ts
const vote = record("stories", "41234567", ".votearrow");
const result = await hn.click(vote, { until: { target: vote, state: "hidden" } });
if (result.outcome === "unknown") await hn.read({ one: css("#hnmain"), fields: { ok: field.exists() } });
```

A missing `until` on an input whose effect matters makes `observed` mean only "the events were sent". Give evidence for every input that changes something.

### `expect`

`expect` judges an input that leaves the page, by the page it lands on:

| Key | Meaning |
| --- | --- |
| `url` | The destination must match one of these guards. |
| `notUrl` | A destination matching one of these means the website refused: `failed` with `REJECTED`. |
| `read` | Read on the destination; it must be truthy. |

```ts
const login = await hn.submit(css("form[action=login]"), {
  expect: { url: [{ pattern: "/news" }, { pattern: "/" }], notUrl: [{ pattern: "/login" }] },
});
```

The client waits up to `limits.actionTimeoutMs` for the destination to bind. A destination that matches `url` and passes `read` is `observed`; one that matches `notUrl` is `failed` `REJECTED`; anything else is `unknown`. Without `expect`, an input that navigates answers `unknown`. Pass `navigates: true` on an input that leaves the page but is not `submit`, such as a click on a link.

## Edge cases

| Situation | What happens |
| --- | --- |
| The page navigates during a read | The call fails with `CONTEXT_REPLACED`; the client sends it again to the next page within its budget. |
| The page navigates during an input | The input is judged by how far it got: not dispatched is `failed`; dispatched is `unknown` or judged on the destination with `expect`. It is never sent again. |
| The website re-renders an element | Locators resolve when the operation runs, so the new element is used. |
| A record's row is gone | `TARGET_NOT_FOUND`. |
| A single-page website changes route | A new view: watches send a snapshot of the new route, and watches whose `when` no longer matches go idle. |
| A virtualized list scrolls | Records that left the DOM stay with `present: false`. |
| Infinite scroll | `scroll("end")`, with `until` on the row count or a reader's `complete`. |
| The target is hidden, disabled or covered | `failed` with `NOT_ACTIONABLE` and the reason. |
| An input's effect is unknown | `unknown`. The SDK never repeats it. |
| The user double-taps an applet button | One input, one shared promise. |
| The website changes many rows at once | The agent batches changes and splits large patches. |
| A patch is lost or out of order | The client asks for a fresh snapshot. |
| The user goes Back | The watch shows its earlier copy as stale until the new snapshot. |
| The page never binds | The router shows the website after `limits.documentReadyMs`, or the applet's error screen with `onError: "applet"`. |
| The website needs sign-in | A route with `requiresAccount` reports `auth`; protected fields are never read or written. |
| A link leads to an undeclared origin | No agent runs there; the page shows as the website. |
| The applet UI reloads | Every context gets `reset`, and watches open again when the contexts bind. |
| The applet resumes from the background | Every watch asks for a fresh snapshot. |
| The content is in a cross-origin iframe or a closed shadow root | It cannot be read or targeted; `frame` reports `cross-origin-frame`. |
| A rich text editor ignores typing | `type` fails with `editor-needs-trusted-input`; use `input: "trusted"`. |
| A menu opens only on CSS `:hover` | Use `hover` with `input: "trusted"`. |
| The website's scripts try to call Genesis | The agent removes the bridge before any website script runs, and the host checks every message's size and role. |
| The page's renderer stops | Genesis closes the whole applet and shows the launcher; Reload opens it again where it was. |
