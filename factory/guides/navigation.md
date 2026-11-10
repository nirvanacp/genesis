# Navigation

An applet has one to three contexts. Each context is a live website session with one history, the website's own. The screen the user sees is the active context's current page rendered by the applet, or the website itself when the applet does not customize that page (see [presentation](presentation.md)). Overlay screens show applet data above the active context. The shell owns the floating Genesis menu button, the website bar and Android Back.

## One history per context

Every route screen is a history entry of its context. Opening an item pushes the item's URL in the context, and Back goes back in the context's history, so the applet and the website share one history and the user can move between them without losing their place. There is no separate screen stack for route screens.

```ts
const { navigate } = useNavigation();

navigate({ url: "https://example.com/item?id=42" });                 // a page in the active context
navigate({ url: "/newest", mode: "replace" });                        // relative to the current page, replacing it
navigate({ url: "https://example.com/account", context: "me" });     // a page in another context
navigate({ screen: "saved", mode: "root" });                          // an overlay screen
```

| Target | What happens |
| --- | --- |
| `{ url, context?, mode? }` | Loads the URL in a context and makes that context active. The manifest decides what shows: a route renders its screen, anything else shows the website. Relative URLs resolve against the active context's page. `mode` is `push` (default) or `replace`. It closes the overlay screens. |
| `{ screen, params?, mode? }` | Opens an overlay screen. `push` (default) adds it, `replace` swaps the top one, `root` makes it the only one. |

Use `{ url }` for every link that came from the website, so the manifest decides where it goes. Navigating to the URL a context already shows switches to that context instead of adding an entry. Navigating to the same URL does not reload it; use `reload()`.

## Which context a URL opens in

`navigate({ url })` without `context` uses the active context, so a link followed from a page stays in that page's history. A route's `context` applies only from a tab root (the active context on its start page) and from an overlay screen. That way a profile link on the Home tab's feed opens in the Home history, while the same link from Search opens in the route's context.

## Tabs and overlay screens

Bottom tabs belong to the foreground. A tab is either a context or an overlay screen:

```tsx
const choose = () => tab.context ? select(tab.id) : navigate({ screen: tab.id, mode: "root" });
```

- `select(contextId)` switches to that context and closes the overlay screens. The context keeps its history, so each website tab returns where the user left it. Reselecting the current tab off its start page goes to the start page (as a new entry); on the start page it scrolls `ScrollMemory` to the top.
- Overlay screens are applet-only screens (search, saved, settings, a save sheet) that render above the active context. They have no page of their own; read their data from the store, a service or another context with `usePage(contextId)` and `useRegion(name, contextId)`. Open a screen tab with `mode: "root"`.
- Mark a tab current from `active`, or from `overlay[0]` when an overlay is open.

Content tabs, filters and sort controls belong inside the screen. When they correspond to website URLs, navigate to that URL with `mode: "replace"`.

## Pins: View website and Done

The user can look at the website for any page: the Genesis menu's View website item, or a screen control that calls `viewWebsite()`. Genesis pins the context to the website and shows it under the website bar. Viewing the website closes any overlay screens above that context; a screen with a leave guard asks first, and Done returns to the context's route screen, not the overlay. Done on the bar (or `done()`) unpins it and shows the applet screen again. When the website page has no route, Done goes back one entry, or to the context's start page when there is none.

Genesis also pins a context when a page is `auth` and opens the adapter's `signInUrl` there. The pin clears when a ready page with an account arrives. If the user leaves that sign-in with Done or Back, Genesis goes back past the page that needed the account; when that page was the start page, it selects the primary context instead.

Open the website only on an explicit action: View website, a control whose label or cue says it opens the website, or a sign-in prompt. Never open it to cover a loading or failed screen; Genesis does that itself after the deadline.

## Back

Android Back and `back()` follow the same order:

1. A leave guard asks for confirmation.
2. The top overlay screen closes.
3. A sign-in that Genesis opened is left, as described above.
4. The active context goes back one entry in its history. The previous entry shows its last copy at once, marked `stale`, with its scroll position.
5. Otherwise Android Back leaves the applet. `back()` does nothing there.

The foreground must answer Back within 300 ms, so keep Back handling synchronous. Navigating, selecting a tab and opening an overlay screen ask the leave guard first, and any navigation clears it. Set a guard while a draft is unsaved; replace the default `confirm()` with `useForeground().navigation.onConfirmLeave` when the product has its own dialog.

Menus, sheets and dialogs drawn inside a screen are not history entries. Close them before Back leaves the screen: render them as overlay screens, or set a leave guard while they are open and close them from `onConfirmLeave`. A menu item that navigates clears that guard first, so the confirmation does not intercept it.

## External origins

A context can browse any web page. A link to an origin the manifest does not declare loads in the same context and shows as the website, under the website bar; the adapter does not run there. Done or Back returns to the previous entry. Links with other schemes (`mailto:`, `tel:`, `intent:`, app links) open in Android only when the user taps them on the revealed website; a hidden context launches nothing.

## Links that open a new window

A tapped link that opens a new window (`target="_blank"`) on the revealed website goes where its address belongs:

| The link's site | Where it opens |
| --- | --- |
| One of this applet's origins | The same context, as a new entry. The manifest decides what shows. |
| A site another installed applet uses | That applet, with its own screen for the page. Several such applets ask the user to choose. |
| Any other site | A website sheet over the revealed website, in the same sign-in. Back goes back inside the sheet, then closes it. |

A window that a script opens from a tap, such as a sign-in with another account provider, opens as the sheet so the page keeps `window.opener`. A hidden context never opens a window, and a window without a tap is refused, so an adapter must not rely on `window.open` or on clicking a `target="_blank"` link; navigate to the link's URL instead.

## Links from other apps

A link the user shares with Genesis, or types in Open a link on the Home screen, asks first. The chooser lists Open in *applet* for each applet whose manifest declares the link's origin, then Create a new applet. An applet opened this way starts again with the link loaded in the context whose start page is on that origin, or in the first context, and the presentation coordinator decides what shows: a route renders its screen, any other page shows the website. Genesis does not pin the website for a shared link. The link has a fresh history, so Back from its first entry leaves the applet and, for a link shared from another app, returns to that app. Genesis opens only `https` links: an `http` link from another app or Open a link is refused with a message, and a website page cannot load `http`. Manifest origins and start URLs are `https`.

## The Genesis menu

The shell's menu offers Home, Reload applet, View website, Service connections and Applet info. Do not rebuild these in the foreground. Reload applet recreates the foreground and its contexts at their start pages.

## Route inventory

Record every route in `.specs/current.md` by manifest route id: an example URL, its page and screen, its context, its loading, empty, sign-in and error behavior, how the user gets back, and its verification status. A declared route is not evidence that the page renders; verify it on the device.
