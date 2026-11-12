# Design

Build each screen to feel like the source product's mobile app, unless the user gave another design. Read this with [defaults](defaults.md) and [patterns](patterns.md).

## Choose the reference

Use the product's native mobile app as the reference when one exists, translated to Android conventions. Where the app is unavailable or a detail is uncertain, inspect the mobile website. Record the reference and any user corrections in `.specs/current.md`. A request such as "build an app for X" does not authorize a generic card dashboard, oversized buttons or an unrelated theme. Matching a reference does not add features, ads or account actions the user did not ask for.

## Shell and navigation

The shell draws a floating 44 dp Genesis menu button in the top-right corner, 8 dp from the edges, over every screen and over the website. Keep the first row of every screen clear of that corner, for example with a 44 px right float at the top of the scroll container. Do not draw a menu of your own, a back arrow or the applet's name in a bar. Use one bottom tab bar for the main sections. Keep content tabs, filters and contextual actions inside the screen. Do not copy the website's header, footer or sidebar.

When a context shows the website, the shell puts a website bar above it, at least 64 dp tall and taller with larger text, with the page title, the host and Done; the menu button stays on top at its right. The foreground does not draw this bar and cannot restyle it. Screens shown next to the website, such as overlay screens, should not imitate it.

The launcher marks an applet that this Genesis cannot run with a status line: "Needs update" when the applet was built for an older SDK, "Needs a newer Genesis" when it was built for a newer one. Opening it shows the reason instead of the applet. Rebuild the applet with the current SDK to clear "Needs update".

## Tokens

Define a small set of tokens in `src/theme.css` and use them everywhere, including in features the website does not have:

- Typography: system font stack unless a permitted font asset exists; body size and line height; heading scale; weights; truncation.
- Layout: edge padding, row density, avatar and icon sizes, separators, media ratios and corners.
- Color: canvas, surface, primary and secondary text, borders, links, selected and accent. Define light and dark values. Set the canvas and text colors explicitly on `html` and `body`.
- Controls: icon family and weight, button shapes, inputs, tab indicators, menus, sheets, pressed, focus and disabled states.
- Motion: easing curves, three durations and the pressed state layer. See [motion](motion.md#tokens).

Set `shell.accent` in the manifest to the brand color, and give the applet a `shell.icon` (a square PNG under `assets/`, see the [SDK reference](sdk-reference.md#manifest-appletjson)). The shell shows the icon in the launcher, on the launch splash, on home-screen shortcuts and in Recents, on the accent color. Without an icon it draws the first letter of the applet's name on the accent color.

## Building screens

Write semantic React from the adapter's models. The reference is a design input: do not copy its DOM or stylesheets, and never render its HTML. Show active states (voted, followed, saved) only when the page or the store confirmed them, or while a pending action requests them (see [interactions](interactions.md#optimistic-display-with-usepending)). Unknown counts and missing images get a neutral fallback, not a zero.

## Accessibility

- Buttons and links are real `button` and `a` elements, or have the matching role and keyboard behavior.
- Icon controls have an accessible name that includes their state.
- Focus is visible. Opening a sheet moves focus into it; closing returns focus to the control that opened it.
- Text contrast meets 4.5:1 for body text in both themes. Text scales with the system font size; layouts survive 200% text.
- Standalone controls have at least 48 by 48 dp of touch area. Inline links inside text may stay inline.
- Respect `prefers-reduced-motion`. See [motion](motion.md#reduced-motion).

## Skeletons

Show neutral, destination-shaped placeholders while a page loads: avatar and text rows for a feed, title and metadata rows for a news list, banner and avatar for a profile. Keep known headings, tabs and the Cancel or Close control available. Reserve the space content will take. Use neutral grays in light and dark, not the brand accent. Fade the skeleton in after about 120 ms, so a fast load shows nothing, and sweep a soft shimmer across it; under reduced motion it stays still. When the content arrives, fade it in once. [Motion](motion.md#loaders) covers the other loaders.

```tsx
function FeedSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-row" aria-hidden="true" />)}
    </div>
  );
}
```

```css
.skeleton { animation: fade .2s .12s both; }
.skeleton-row { background: linear-gradient(90deg, var(--skeleton) 30%, var(--shimmer) 50%, var(--skeleton) 70%) 0 0 / 300% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes fade { from { opacity: 0; } } /* --skeleton and --shimmer are theme tokens, lighter in dark mode */
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton, .skeleton-row { animation: none; } }
```

Keep existing content visible during refresh and show placeholders only where content is missing. Never cover an error, a sign-in prompt, an empty result or a draft with a skeleton.

## Sheets and the keyboard

Sheets and dialogs are opaque, scroll their body, and keep Close, Cancel and the confirming action reachable with the keyboard open and on short screens. Keep a warning beside the control it warns about. Back closes the sheet first (see [navigation](navigation.md#back)).

## Checking the design

Compare the applet with the reference at a typical phone width and the narrowest supported width, in light and dark, with large text. Check density, alignment, icon weight, touch areas, selected states, long text and media. A build pass is not a visual check, and a screenshot is not an interaction check.
