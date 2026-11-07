# Navigation

The foreground owns a stack of screens. The shell owns the floating Genesis menu button, Android Back and the website sheet. Hidden source pages never appear on screen.

## The three ways to navigate

```ts
const { navigate } = useNavigation();

navigate({ kind: "route", url: "https://example.com/item?id=42" });          // a website URL
navigate({ kind: "screen", id: "saved", mode: "root" });                     // an applet-only screen
navigate({ kind: "website", url: "https://example.com/item?id=42" });        // the website sheet
```

| Target | What happens |
| --- | --- |
| `route` | The URL is classified by the manifest. An adapted route pushes its screen and loads the page in its source. A website route opens the sheet. A declared-origin URL that matches no route pushes the `unsupported` screen with `params.url`, or opens the sheet when the applet has no such screen. A URL on any other origin opens the sheet. |
| `screen` | Pushes a declared screen with `params`. Pass `source: { sourceId, url, routeId }` only when you already know which page the screen shows; otherwise it has no page. |
| `website` | Opens the URL in the website sheet. Use it only when the user asked for the website. |

`route` and `screen` take `mode`: `push` (default) adds an entry, `replace` swaps the current entry, `root` makes the new screen the whole stack. Use `root` for bottom tabs. Use `route` for every link that came from the website, so the manifest decides where it goes.

## Back

Android Back and `back()` follow the same order:

1. An open website sheet goes back in its own history, then closes.
2. A leave guard on the current screen asks for confirmation.
3. A stacked screen pops and the previous one returns with its scroll position.
4. On the root screen, Android Back leaves the applet. `back()` does nothing there.

The foreground must answer Back within 300 ms, so keep Back handling synchronous. `navigate` to another screen asks the same question first. Changing screens clears the leave guard. Set a guard while a draft is unsaved; replace the default `confirm()` with `useForeground().navigation.onConfirmLeave` when the product has its own dialog.

Menus, sheets and dialogs drawn by the foreground are not stack entries. Close them before Back leaves the screen: either render them as screens, or set a leave guard while they are open and close them from `onConfirmLeave`. A menu item that navigates clears that guard first, so the confirmation does not intercept it.

## The website sheet

The sheet shows the real website over the applet. It loads the URL it was given and pages on the applet's declared origins and on the opened URL's origin. A link to any other origin opens the system browser. Closing the sheet, by its close control or by Back, returns to the screen that opened it and fires `useAppResume`, so reread anything the user may have changed there.

Open the sheet only on an explicit action: a control whose label or cue says it opens the website, a sign-in prompt, a form the applet does not rebuild, or the Genesis menu's Open website item. Never open it to cover a loading or failed screen.

## The Genesis menu

The shell's menu offers Home, Reload applet, Open website, Service connections and Applet info. Do not rebuild these in the foreground. Reload applet recreates the foreground and its sources; the stack restarts at the first source's start page.

## Tabs and sections

Bottom tabs belong to the foreground. Each tab opens its root with `mode: "root"`. Reselecting the current tab scrolls to the top or pops to its root. Content tabs, filters and sort controls belong inside the screen and change the page with `route` navigation in `replace` mode when they correspond to website URLs. Show the destination's title and skeleton immediately while its page loads.

## Route inventory

Record every route in `.specs/current.md` by manifest route id: an example URL, the screen or website handling, its loading, empty, sign-in and error behavior, how the user gets back, and its verification status. A declared route is not evidence that the page renders; verify it on the device.
