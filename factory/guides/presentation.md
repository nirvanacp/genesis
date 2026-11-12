# Presentation

At any moment each context shows either the applet's screen for its page or the website itself. The UI decides which. It renders the screen and its loading, stale and error states, and it shows a context's website with `genesis.website.show(contextId)` and covers it again with `genesis.website.hide()`. This guide covers what the user sees while pages load and change.

## Who decides

The router helper, `createRouter` from `@genesis/sdk/router` (or `mount(element, { router })` in React), makes the decision for you with the default table below. It reads the routes in `src/routes.ts`, opens a watch of each route's `ready` read and of the account, and calls `website.show` and `website.hide` as the table says. Use it unless the product needs other rules.

- Pass `decide(context, route)` in the router options to replace the table. It returns `"custom"` for the applet screen or `"website"`, and the router still makes the calls.
- Without the router, call `website.show` and `website.hide` yourself, and listen with `genesis.website.on("viewWebsite" | "showContext" | "done", fn)` for the user's choices in the shell. Without a listener, the client shows the website for View website and for a link opened from outside, and hides it on Done.

Whoever decides, keep the rules below: the user is never left on a blank or stuck screen, and the website shows only when the table says so or the user asks.

## When the applet shows and when the website shows

The router's default table:

| Context state | What shows |
| --- | --- |
| A ready page on a route | The applet screen |
| A route page that is loading, within 15 seconds | The applet screen, with its skeleton or the last copy |
| A route page still loading after 15 seconds | The website |
| A route page in `error` while the last copy of that entry is still shown, within the deadline | The applet screen, with an inline error |
| Any other `error` | The website |
| A route with `requiresAccount` while the account watch reads signed out (`auth`) | The website, at the router's `account.signInUrl` when it returns one |
| A route with `onError: "applet"` that is loading past the deadline or in error | The applet screen, with its own error state |
| A route with `website: true`, a URL with no route, or another origin | The website |
| The user chose View website | The website, until Done |

A route's page is ready when its `ready` read is truthy; a route without `ready` is ready once the page is bound. The website appears under a website bar with Done, below the floating menu button. A window the website opens for another site appears as a sheet over the revealed website, only from a tap; hidden contexts never open windows. Overlay screens always render over the active context, whatever it shows. Screens never decide this themselves: `useRouter().presentation(contextId)` reports it, and `useRouter().revealed` names the context whose website is shown.

## Loaders and skeletons

While a page loads and nothing is cached, the screen renders a skeleton shaped like its destination: rows for a feed, a title and metadata block for a detail, a banner and avatar for a profile. Keep known headings, tabs and the Cancel or Close control available. See [design](design.md#skeletons) for the look.

```tsx
const page = useRouter().status();
const stories = useWatch<never, Story>("feed:stories", { reader: "stories" }, { when: FEED_PAGES });
if (stories.order.length === 0) {
  if (page.status === "ready" && stories.status === "ready") return <Empty />;
  if (page.status === "error" || stories.status === "error") return <LoadError error={page.error ?? stories.error} />;
  return <FeedSkeleton />;
}
```

`status()` is the route's status for the active context, or for the context you name: `loading`, `ready`, `error`, `auth` or `unsupported`, with `stale`, `error`, `params` and `signedIn`. Treat empty as a ready page with an empty list, never as "no records yet".

## Stale pages

Each watch keeps the last ready copy of each history entry (up to 16 per context). When the user goes Back, or a page reloads, the screen shows that copy at once with `stale: true`, on the watch's value and on `status()`, while the page loads again, and updates in place when the new page is ready.

- Render stale content normally with an unobtrusive refreshing state: `aria-busy` on the scroll container and a thin progress bar under the header that appears after a short delay (see [motion](motion.md#loaders)). Do not replace it with a skeleton.
- Disable controls that act on the page while it is stale; the records may no longer match what the site shows.
- When the reload fails, keep the stale content and show a short inline error ("Couldn't refresh. Showing the last copy."). After the deadline the website takes over, unless the route sets `onError: "applet"`.

## Errors

A route in `error` carries `status().error` with a code and message, and a watch in `error` carries its own `error`. Show the message, a Retry that calls `reload()`, and a View website control that calls `viewWebsite()`, both from `useRouter`, so the user can see what the site shows. A watch's error affects only what that watch reads: keep the rest of the screen and say which part could not be read.

## The switch to the website

When a context starts showing the website, the shell reveals that context's page under the website bar; when it returns to the applet, the shell covers it again. No screen code runs for the switch. Design for it:

- A signed-out user who opens a page that needs an account sees the site's sign-in. Done or Back leaves it and returns past the page that needed the account. After signing in, the applet screen returns on its own.
- A link to a page the applet does not customize opens the website in the same session, with the same history. Back goes to the previous entry, which shows the applet screen again if it has a route.
- A link shared from another app shows the applet screen when it matches a route, like any other navigation, and the website otherwise (see [navigation](navigation.md#links-from-other-apps)).
- A page that never becomes ready shows the website after 15 seconds. Fix the route's `ready` read rather than hiding this.

## Motion

Genesis does not animate the switch between the applet and the website, and the router swaps the screen at once when the page changes. The UI gives its own changes direction and feedback, following [motion](motion.md):

- Animate screen changes from where the screens sit: forward pushes, Back pops, tab roots fade through, sheets rise. Animate a copy of the outgoing screen, so the new screen is live from its first frame and Back never waits for motion. A stale copy shown on Back appears at once, inside the same pop.
- Fade skeletons in after a short delay and let them shimmer; fade content in once where it replaces a skeleton. Cached content shows without a fade.
- Animate state changes on a control the user touched, such as a vote arrow or a saved icon, within about 200 ms.
- Respect `prefers-reduced-motion`: drop non-essential motion entirely, and keep every state change and progress indicator.
