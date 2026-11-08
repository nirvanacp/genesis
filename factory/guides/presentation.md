# Presentation

At any moment each context shows either the applet's screen for its page or the website itself. Genesis decides which; the foreground renders the screen and its loading, stale and error states. This guide covers what the user sees while pages load and change.

## When the applet shows and when the website shows

| Context state | What shows |
| --- | --- |
| A ready page on a route | The applet screen |
| A route page that is loading, within 15 seconds | The applet screen, with its skeleton or the last copy |
| A route page still loading after 15 seconds | The website |
| A route page in `error` while the last copy of that entry is still shown, within the deadline | The applet screen, with an inline error |
| Any other `error` | The website |
| `auth` | The website, at the adapter's `signInUrl` when it has one |
| A URL with no route, or on another origin | The website |
| The user chose View website | The website, until Done |

The website appears under a website bar with Done, below the floating menu button. Overlay screens always render over the active context, whatever it shows. Screens never decide this themselves; `useNavigation().presentation` reports it for the active context.

## Loaders and skeletons

While a page loads and nothing is cached, the screen renders a skeleton shaped like its destination: rows for a feed, a title and metadata block for a detail, a banner and avatar for a profile. Keep known headings, tabs and the Cancel or Close control available. See [design](design.md#skeletons) for the look.

```tsx
const page = usePage();
const stories = useRegion<Story>("stories");
if (stories.order.length === 0) {
  if (page.status === "ready" && stories.status === "ready") return <Empty />;
  if (page.status === "error" || stories.status === "error") return <LoadError error={page.error ?? stories.error} />;
  return <FeedSkeleton />;
}
```

Treat empty as a ready page with an empty region, never as "no records yet".

## Stale pages

Genesis keeps the last ready copy of each history entry (up to 16 per context). When the user goes Back, or a page reloads, the screen shows that copy at once with `page.stale === true` while the page loads again, and updates in place when the new page is ready.

- Render stale content normally with an unobtrusive refreshing state, such as `aria-busy` on the scroll container. Do not replace it with a skeleton.
- Disable controls that act on the page while it is stale; the records may no longer match what the site shows.
- When the reload fails, keep the stale content and show a short inline error ("Couldn't refresh. Showing the last copy."). After the deadline the website takes over.

## Errors

A page `error` carries `page.error` with a code and message. Show the message, a Retry that calls `reload()`, and a View website control that calls `viewWebsite()` so the user can see what the site shows. A region `error` affects only that region: keep the rest of the screen and say which part could not be read.

## The switch to the website

When a context starts showing the website, the shell reveals that context's page under the website bar; when it returns to the applet, the shell covers it again. No screen code runs for the switch. Design for it:

- A signed-out user who opens a page that needs an account sees the site's sign-in. Done or Back leaves it and returns past the page that needed the account. After signing in, the applet screen returns on its own.
- A link to a page the applet does not customize opens the website in the same session, with the same history. Back goes to the previous entry, which shows the applet screen again if it has a route.
- A page that never becomes ready shows the website after 15 seconds. Fix the adapter's readiness rather than hiding this.

## Motion

Genesis does not animate the switch between the applet and the website, or between history entries. Keep the foreground's own motion small and purposeful:

- Do not animate a whole screen in when the page changes; the user expects the next screen at once, and Back should feel instant over a stale copy.
- Keep skeletons static. Fade content in only where it replaces a skeleton, briefly.
- Animate state changes on a control the user touched, such as a vote arrow or a saved icon, within about 200 ms.
- Respect `prefers-reduced-motion`: drop non-essential motion entirely.
