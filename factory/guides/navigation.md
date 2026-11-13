# Navigation

An applet has one to three contexts. Each context is a live website session with one history, the website's own. The screen the user sees is the active context's current page rendered by the applet, or the website itself when the applet does not customize that page (see [presentation](presentation.md)). Overlay screens show applet data above the active context. The shell owns the floating Genesis menu button, the website bar and Android Back.

## Routes live in code

The manifest declares the origins and the contexts. The routes and screens are the router's options, kept in `src/routes.ts`:

```ts
import type { RouterRoute } from "@genesis/sdk/router";

export const ROUTES: RouterRoute[] = [
  { id: "home", pattern: "/", screen: "feed", context: "primary", ready: { reader: "ready" } },
  { id: "item", pattern: "/item", query: ["id"], screen: "item", ready: { reader: "ready" } },
  { id: "submit", pattern: "/submit", screen: "post", context: "post", ready: { reader: "ready.submit" }, requiresAccount: true },
  { id: "settings", pattern: "/settings", website: true },
];

export const OVERLAY_SCREENS = ["search", "saved"];

export function signInUrl(url: string) {
  const { pathname, search } = new URL(url);
  return `/login?goto=${encodeURIComponent(pathname.slice(1) + search)}`;
}
```

```tsx
void mount(<App />, {
  router: { routes: ROUTES, screens: OVERLAY_SCREENS, account: { signedIn: { reader: "account" }, signInUrl } },
});
```

Routes match in order: the first route whose `pattern` and `query` keys match a URL renders its `screen` (the route id by default). A URL without a route shows the website.

| Route field | Meaning |
| --- | --- |
| `id`, `pattern`, `query` | The route's name, its path pattern, and the query keys that must be present |
| `screen` | The screen it renders; defaults to `id` |
| `context` | The context a URL with this route opens in from a tab root or an overlay screen |
| `ready` | A read whose truthy value says the page is ready; without it, a bound page is ready |
| `requiresAccount` | A signed-out account shows the website's sign-in instead of the screen |
| `website: true` | The route is known but always shows the website |
| `onError: "applet"` | The screen stays up on error and past the loading deadline, and shows its own error state |

`account.signedIn` is a read whose value names the account while signed in, such as the user name, `false` while signed out, and `null` while the page does not say. A `one` read without a match and an empty list read count as `null`, so a read that can see a signed-out page should return `false` there. The router compares account values by their JSON value, and any other value counts as another account. Return a value that stays the same while the same person is signed in; a plain `true` works but cannot tell two accounts apart. A page that shows nothing about the account keeps the account already known. `account.signInUrl` turns a URL that needs the account into the site's sign-in URL, or returns `null`.

When the account changes (signed in, signed out, or another person), no copy of an earlier account's pages may show. Every context forgets the copies its watches kept for Back. The other contexts settle their pending inputs as `unknown` with `CONTEXT_REPLACED`. Those whose website is not shown also clear their data and reload; the context whose website is shown keeps its page and reads it again. `decide` replaces the presentation rules ([presentation](presentation.md#who-decides)).

### Route patterns

Routes match only `https:` URLs on the manifest's origins; any other URL shows the website. A `pattern` starts with `/` and is at most 256 characters. Its segments are:

| Segment | Matches |
| --- | --- |
| A literal, such as `news` or `item.php` | That exact path segment, case-sensitive. Letters, digits and `_ . ~ @ -`. |
| `:name` | Any one non-empty segment. Its decoded value becomes `params.name`. The name starts with a letter and has letters, digits and `_`. |
| A trailing `*` | The rest of the path, in `params.rest` (`/user/*` matches `/user/ada/posts` with `rest` `ada/posts`). The bare prefix matches too, with an empty `rest`. |

- `/` matches only the site root.
- A trailing slash in the URL is ignored: `/news/` matches `/news`. An empty segment in the middle, as in `/news//2`, matches no literal or `:name` segment.
- Path segments are percent-decoded before matching.
- `query` lists keys that must be present in the URL. Their values become params under the same names, and other query keys are ignored. A route cannot select by a query value; read the value in the screen.
- A pattern outside this syntax, such as `/item?id` or `/:id-:slug`, never matches, and nothing reports it. Check that each route's screen appears on its page.

There is no exclusion syntax: the first route that matches wins, so put a narrower route before a broader one (`/user/settings` before `/user/:name`). `createRouter` warns in the console about a route that an earlier route always matches first, because no URL can reach it.

## One history per context

Every route screen is a history entry of its context. Opening an item pushes the item's URL in the context, and Back goes back in the context's history, so the applet and the website share one history and the user can move between them without losing their place. There is no separate screen stack for route screens.

```ts
const { navigate } = useRouter();

navigate({ url: "https://example.com/item?id=42" });                 // a page in the active context
navigate({ url: "/newest", mode: "replace" });                        // relative to the current page, replacing it
navigate({ url: "https://example.com/account", context: "me" });     // a page in another context
navigate({ screen: "saved", mode: "root" });                          // an overlay screen
```

| Target | What happens |
| --- | --- |
| `{ url, context?, mode? }` | Loads the URL in a context and makes that context active. The routes decide what shows: a route renders its screen, anything else shows the website. Relative URLs resolve against the active context's page. `mode` is `push` (default) or `replace`. It closes the overlay screens. |
| `{ screen, params?, mode? }` | Opens an overlay screen named in the router's `screens`. `push` (default) adds it, `replace` swaps the top one, `root` makes it the only one. |

Use `{ url }` for every link that came from the website, so the routes decide where it goes. Navigating to the URL a context already shows switches to that context instead of adding an entry. Navigating to the same URL does not reload it; use `reload()`.

## Which context a URL opens in

`navigate({ url })` without `context` uses the active context, so a link followed from a page stays in that page's history. A route's `context` applies only from a tab root (the active context on its start page) and from an overlay screen. That way a profile link on the Home tab's feed opens in the Home history, while the same link from Search opens in the route's context.

## Tabs and overlay screens

Bottom tabs belong to the UI. A tab is either a context or an overlay screen:

```tsx
const choose = () => tab.context ? select(tab.id) : navigate({ screen: tab.id, mode: "root" });
```

- `select(contextId)` switches to that context and closes the overlay screens. The context keeps its history, so each website tab returns where the user left it. Reselecting the current tab off its start page goes to the start page (as a new entry); on the start page it scrolls `ScrollMemory` to the top.
- Overlay screens are applet-only screens (search, saved, settings, a save sheet) that render above the active context. They have no page of their own; read their data from the store, a service, or another context with `useWatch(id, spec, { context })` and `useRouter().status(contextId)`. Open a screen tab with `mode: "root"`.
- Mark a tab current from `active`, or from `state.overlay[0]` when an overlay is open.

Content tabs, filters and sort controls belong inside the screen. When they correspond to website URLs, navigate to that URL with `mode: "replace"`.

## Pins: View website and Done

The user can look at the website for any page: the Genesis menu's View website item, or a screen control that calls `viewWebsite()`. The router pins the context to the website and shows it under the website bar. Viewing the website closes any overlay screens above that context; a screen with a leave guard asks first, and Done returns to the context's route screen, not the overlay. Done on the bar (or `done()`) unpins it and shows the applet screen again. When the website page has no route, Done goes back one entry, or to the context's start page when there is none.

The router also pins a context when a route that `requiresAccount` reads signed out, and opens the `account.signInUrl` there. The pin clears when a ready page with an account arrives. If the user leaves that sign-in with Done or Back, the router goes back past the page that needed the account; when that page was the start page, it selects the primary context instead.

Open the website only on an explicit action: View website, a control whose label or cue says it opens the website, or a sign-in prompt. Never open it to cover a loading or failed screen; the router does that itself after the deadline.

## Back

Android Back reaches the UI through `genesis.onBack(handler)`. The newest handler runs first, and returning `true` means it handled Back; when none does, Android Back leaves the applet. The router registers one and handles Back in this order, and `useRouter().back()` follows the same order:

1. A leave guard asks for confirmation.
2. The top overlay screen closes.
3. A sign-in that the router opened is left, as described above.
4. The active context goes back one entry in its history. The previous entry shows its last copy at once, marked `stale`, with its scroll position.
5. Otherwise Android Back leaves the applet, as Back leaves any Android app: its window moves behind the screen it was opened from, and reopening it from Recents within a short while shows the same screen. `back()` does nothing there.

The UI must answer Back within 300 ms, so keep Back handlers synchronous. A screen that draws its own layer, such as an image viewer, can register a handler with `genesis.onBack` that closes it and returns `true`. Navigating, selecting a tab and opening an overlay screen ask the leave guard first, and any navigation clears it. Set a guard with `setLeaveGuard(message)` while a draft is unsaved; replace the default `confirm()` with `onConfirmLeave` when the product has its own dialog.

Menus, sheets and dialogs drawn inside a screen are not history entries. Close them before Back leaves the screen: render them as overlay screens, or set a leave guard while they are open and close them from `onConfirmLeave`. A menu item that navigates clears that guard first, so the confirmation does not intercept it.

## External origins

A context can browse any web page. A link to an origin the manifest does not declare loads in the same context and shows as the website, under the website bar; the page module does not run there. Done or Back returns to the previous entry. Links with other schemes (`mailto:`, `tel:`, `intent:`, app links) open in Android only when the user taps them on the revealed website; a hidden context launches nothing.

## Links that open a new window

A tapped link that opens a new window (`target="_blank"`) on the revealed website goes where its address belongs:

| The link's site | Where it opens |
| --- | --- |
| One of this applet's origins | The same context, as a new entry. The routes decide what shows. |
| A site another installed applet uses | That applet, with its own screen for the page. Several such applets ask the user to choose. |
| Any other site | A website sheet over the revealed website, in the same sign-in. Back goes back inside the sheet, then closes it. |

A window that a script opens from a tap, such as a sign-in with another account provider, opens as the sheet so the page keeps `window.opener`. A hidden context never opens a window, and a window without a tap is refused, so a page module must not rely on `window.open` or on clicking a `target="_blank"` link; navigate to the link's URL instead.

## Links from other apps

A link the user shares with Genesis, or types in Open a link on the Home screen, asks first. The chooser lists Open in *applet* for each applet whose manifest declares the link's origin, then Create a new applet. An applet opened this way starts again with the link loaded in the context whose start page is on that origin, or in the first context, and the UI hears `showContext` for it. The router then decides what shows: a route renders its screen, any other page shows the website. Genesis does not pin the website for a shared link. The link has a fresh history, so Back from its first entry leaves the applet and, for a link shared from another app, returns to that app. Genesis opens only `https` links: an `http` link from another app or Open a link is refused with a message, and a website page cannot load `http`. Manifest origins and start URLs are `https`.

## The Genesis menu

The shell's menu offers Open Genesis, Reload applet, View website, Service connections and Applet info. Do not rebuild these in the UI. Open Genesis shows the Genesis app and leaves the applet where it is. Reload applet recreates the UI and its contexts at their start pages.

## Route inventory

Record every route in `.specs/current.md` by its id in `src/routes.ts`: an example URL, its screen and context, its `ready` read, its loading, empty, sign-in and error behavior, how the user gets back, and its verification status. A route in the table is not evidence that the page renders; verify it on the device.
