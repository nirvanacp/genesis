# Design

Build each screen to feel like the source product's mobile app, unless the user gave another design. Read this with [defaults](defaults.md) and [patterns](patterns.md).

## Choose the reference

Use the product's native mobile app as the reference when one exists, translated to Android conventions. Where the app is unavailable or a detail is uncertain, inspect the mobile website. Record the reference and any user corrections in `.specs/current.md`. A request such as "build an app for X" does not authorize a generic card dashboard, oversized buttons or an unrelated theme. Matching a reference does not add features, ads or account actions the user did not ask for.

## Shell and navigation

The shell draws a floating 44 dp Genesis menu button in the top-right corner, 8 dp from the edges, and handles Android Back. Keep the first row of every screen clear of that corner, for example with a 44 px right float at the top of the scroll container. Do not draw a menu of your own, a back arrow or the applet's name in a bar. Use one bottom tab bar for the main sections. Keep content tabs, filters and contextual actions inside the screen. Do not copy the website's header, footer or sidebar.

## Tokens

Define a small set of tokens in `src/theme.css` and use them everywhere, including in features the website does not have:

- Typography: system font stack unless a permitted font asset exists; body size and line height; heading scale; weights; truncation.
- Layout: edge padding, row density, avatar and icon sizes, separators, media ratios and corners.
- Color: canvas, surface, primary and secondary text, borders, links, selected and accent. Define light and dark values. Set the canvas and text colors explicitly on `html` and `body`.
- Controls: icon family and weight, button shapes, inputs, tab indicators, menus, sheets, pressed, focus and disabled states.

Set `shell.accent` in the manifest to the brand color; the shell uses it for the applet name on the launch splash.

## Building screens

Write semantic React from the adapter's models. The reference is a design input: do not copy its DOM or stylesheets, and never render its HTML. Show active states (voted, followed, saved) only when the page or the store confirmed them. Unknown counts and missing images get a neutral fallback, not a zero.

## Accessibility

- Buttons and links are real `button` and `a` elements, or have the matching role and keyboard behavior.
- Icon controls have an accessible name that includes their state.
- Focus is visible. Opening a sheet moves focus into it; closing returns focus to the control that opened it.
- Text contrast meets 4.5:1 for body text in both themes. Text scales with the system font size; layouts survive 200% text.
- Standalone controls have at least 48 by 48 dp of touch area. Inline links inside text may stay inline.
- Respect `prefers-reduced-motion`.

## Skeletons

Show neutral, static, destination-shaped placeholders while a page loads: avatar and text rows for a feed, title and metadata rows for a news list, banner and avatar for a profile. Keep known headings, tabs and the Cancel or Close control available. Reserve the space content will take. Use neutral grays in light and dark, not the brand accent.

```tsx
function FeedSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton-row" aria-hidden="true" />)}
    </div>
  );
}
```

Keep existing content visible during refresh and show placeholders only where content is missing. Never cover an error, a sign-in prompt, an empty result or a draft with a skeleton.

## Sheets and the keyboard

Sheets and dialogs are opaque, scroll their body, and keep Close, Cancel and the confirming action reachable with the keyboard open and on short screens. Keep a warning beside the control it warns about. Back closes the sheet first (see [navigation](navigation.md#back)).

## Checking the design

Compare the applet with the reference at a typical phone width and the narrowest supported width, in light and dark, with large text. Check density, alignment, icon weight, touch areas, selected states, long text and media. A build pass is not a visual check, and a screenshot is not an interaction check.
