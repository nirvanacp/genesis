# Native feel

The person using an applet should not be able to tell where the app ends and the website begins, except when they asked to see the website. They judge the app at each moment: when it opens, when they tap, when a screen changes, when something is slow or fails. One website flash, one tap that shows nothing or one screen that jumps makes a correct applet feel like a web page.

This guide is the bar for every applet and the order of work that reaches it. It links to the guide that owns each rule instead of repeating it, and the [UI kit](ui-kit.md) holds the code. Read it before writing any UI, when building an applet or adding a screen or feature to one. The [polish skill](../skills/genesis-polish-applet/SKILL.md) audits an applet against it.

## The bar

1. **The website never flashes.** A routed page shows its applet screen from the first frame. The website appears only when the user asks for it, for sign-in and protected forms, and for pages the applet does not customize.
2. **Every tap answers within about 100 ms** with a pressed state, and every action ends in an outcome the user can see.
3. **Every change has a direction.** Forward pushes, Back pops, tabs fade through, sheets rise. Nothing waits for an animation.
4. **The screen tells the truth.** Loading, empty, stale, error, sign-in and unknown look different. Nothing shows a value the page has not confirmed, and nothing claims a success that was not observed.
5. **Nothing is lost.** Back restores the previous screen at once with its scroll position. Drafts, filters and selections survive Back, reloads, the website and the keyboard.
6. **It looks like the product's mobile app**, in light and dark, at large text and narrow widths.
7. **It works for everyone.** Screen readers, reduced motion, 48 dp touch targets and the system Back gesture all work.

## Order of work

1. **Foundation first.** Copy the [UI kit](ui-kit.md) into the applet before the first screen and set its tokens to the product's look ([design](design.md)). Screens written before the foundation tend to stay without motion, toasts and progress.
2. **Map the coverage.** List the URLs each core journey lands on, including redirects and signed-out variants, and route every one the applet customizes ([coverage](#coverage)).
3. **Build each screen with all of its states** before moving to the next screen ([screen states](#screen-states)).
4. **Wire every control to its feedback** ([taps and actions](#taps-and-actions)).
5. **Check motion and Back** ([navigation and motion](#navigation-and-motion)).
6. **Audit on a device** with the [polish skill](../skills/genesis-polish-applet/SKILL.md), and record the [acceptance bar](#acceptance-bar) in the current spec.

## Coverage

The website shows when the router has no screen for the page the context is on. Most website flashes come from a page the author never saw, not from a missing feature.

- **Route every landing URL.** Sites redirect: `/` to `/home` or the reverse, locale prefixes, trailing slashes, `m.` hosts, query variants and signed-out landing pages. Follow each journey on the device, signed in and signed out, note the URL it lands on, and route each one the applet customizes ([navigation](navigation.md#route-every-landing-url)).
- **Read the signed-out state on every variant.** The account reader returns `false` on each signed-out page the site serves, not only the usual one, or a route that `requiresAccount` waits out the 15 second deadline behind a skeleton ([page modules](page-modules.md#reading-rules)).
- **Ready readers prove the content.** A `ready` reader that never turns true shows a skeleton for 15 seconds, then the website. Treat that as a bug in the reader, never as a fallback. Throw the site's own error text from it, so the route shows an error at once ([page modules](page-modules.md#ready-readers)).
- **Expect the website only where you chose it.** Write down in the current spec which pages show the website on purpose (sign-in, editors, settings, unrouted links). Every other website appearance in a journey is a defect.

## Opening screens

- **Open details from their URL.** `navigate({ url })` with the URL the reader returned shows the destination screen with its skeleton at once, while the page loads. A click on the website's own link keeps the previous screen until the new page arrives, which looks like a dead tap, and can show the website in between. Click the link only when the URL is unknown or the click itself does something the URL does not ([presentation](presentation.md#opening-a-screen)).
- **Tabs and overlay screens are instant.** A tab selects its context or opens its overlay screen with `mode: "root"` ([navigation](navigation.md)).
- **Done after a required sign-in leaves the applet** when nothing else is behind it, so the user is never stuck on the sign-in page ([navigation](navigation.md#pins-view-website-and-done)).

## Screen states

Each routed screen draws every state below, in this order of precedence ([presentation](presentation.md), [UI kit](ui-kit.md#wiring)).

| State | What shows | Never |
| --- | --- | --- |
| Error with nothing to show | The site's or the router's message, Retry and View website with the [website cue](defaults.md) | A blank screen, a skeleton forever, a raw error code |
| Confirmed empty | A short message and the next useful action, only after the page is ready, not stale, and the page said there is nothing | "No results" from a page that is still loading |
| Loading, nothing cached | A skeleton shaped like this screen's content: the same rows, grid, header and tabs ([design](design.md#skeletons)) | A spinner in the middle, another screen's skeleton, placeholder text such as "(no subject)" |
| Content | The records, faded in once if a skeleton was shown | A value the reader could not read shown as zero or empty |
| Content, refreshing or stale | The content with the delayed progress bar and `aria-busy`; controls that act on the page disabled | A skeleton over content the user was reading |
| Content, refresh failed | The content and an inline "Couldn't refresh" message | Dropping the content |
| Signed out | The site's sign-in under the website bar, chosen by the router | An applet screen that pretends to be signed in |

**Unknown is not empty.** A field the reader has not found yet is `null`, and the screen shows the skeleton for it, not a fallback text. Render a fallback such as "(no subject)" only once the page is ready and the field is still missing ([presentation](presentation.md#loaders-and-skeletons)).

## Taps and actions

- **Pressed state at once** on every row, button, chip and icon button ([motion](motion.md#controls)). The kit's base styles remove the web tap highlight, the double-tap zoom delay and text selection on controls.
- **Optimistic toggles.** A star, vote, follow or save shows the requested state at once from `usePending`, then the page's state ([interactions](interactions.md)).
- **Busy for long enough to see.** A control whose work can fail fast stays in its ongoing state for at least 800 ms from the tap, up to about 4 seconds when no answer comes, and is disabled meanwhile ([motion](motion.md#feedback-after-an-action), `useBusy` and `RetryButton` in the [UI kit](ui-kit.md#feedback)).
- **One tap, one write.** A disabled busy control stops a second tap from sending a second write ([rules](rules.md#user-paced-writes)).
- **An outcome for every action.** A toast with Undo for removals and completions, the `unknown` message when the evidence never came, and the reason on failure ([motion](motion.md#feedback-after-an-action)).
- **The website only on intent.** A control that shows the website carries the external-arrow cue or says "View on website" ([defaults](defaults.md)).

## Navigation and motion

- Back closes the open menu, sheet or dialog first, then returns to the previous entry at once with its scroll position (`ScrollMemory`). It never waits for an animation or a page ([navigation](navigation.md#back)).
- Reselecting the current tab returns to its start page, then scrolls to the top.
- Screen changes take their motion from where the screens sit: push, pop, fade through, drawer, sheet ([motion](motion.md#screen-transitions), `Stage` in the [UI kit](ui-kit.md#motion-stage)).
- Loaders follow what is on screen: skeleton when nothing is, a progress bar after 250 ms when content is, a spinner inside Load more, an ongoing label on the control that runs ([motion](motion.md#loaders)).
- Pull to refresh where the product has it, plus a labeled Refresh control.
- Reduced motion swaps at once and keeps every state change, including pseudo-element animations such as a progress bar's `::before` ([motion](motion.md#reduced-motion)).

## Content and layout

- Keep the shell's menu corner clear on every screen's first row ([design](design.md#shell-and-navigation)).
- Reserve space for everything that loads: `aspect-ratio` on images and media, fixed avatar sizes, skeleton rows of the real row height. Nothing below moves when content arrives.
- Images fade in when they load and fall back to a neutral shape or initials when they fail. Show counts in the product's format (1.2K) and dates as the product does (relative for recent ones). An unknown count stays hidden, never 0.
- Truncate long titles and names with ellipsis or a line clamp, and check long words, long names and right-to-left text.
- Lists use stable keys, load more at the end with a spinner inside the control, and stay bounded ([patterns](patterns.md)).
- Inputs set `inputmode`, `enterkeyhint`, `autocapitalize` and `autocomplete` for what they hold. A composer focuses its field when it opens. Sheets keep Close, Cancel and the confirming action reachable with the keyboard open ([design](design.md#sheets-and-the-keyboard)).
- Both themes, 200% text and the narrowest supported width stay readable, with 4.5:1 contrast and accessible names that include state ([design](design.md#accessibility)).

## Mistakes seen in real applets

| Symptom | Cause | Fix |
| --- | --- | --- |
| The landing page shows as the website | The site redirected to a URL with no route, such as `/` instead of `/home` | Route every landing URL |
| A signed-out start shows a skeleton for 15 seconds, then the website | The account reader returned `null` on a signed-out page variant | Return `false` from positive signed-out evidence on every variant, narrowed so a signed-in page never matches |
| Opening a detail flashes the previous screen or the website | The screen clicked the site's link, so no pending screen was shown | `navigate({ url })` with the URL the reader read |
| The skeleton looks frozen | The shimmer rule lost on specificity to a shape rule, or the skeleton has no shimmer | Paint and animate only from one class, such as the kit's `.sk`, and check it moves on the device |
| A spinner keeps turning with Remove animations on | The reduced-motion rule did not cover `::before` and `::after` | Cover `*, *::before, *::after` |
| "(no subject)" or "0 comments" flashes before the content | A fallback was rendered from an incomplete read | Treat unknown as loading until the page is ready |
| Retry or Save shows nothing when tapped | The work failed faster than a frame could show it | A minimum busy time from the tap |
| The search screen's skeleton is a list but the results are a grid | One skeleton was reused for another destination | One skeleton per destination shape |
| Done on a required sign-in brings the sign-in back | The start page itself needs the account, so returning to it asks again | The router now leaves the applet in that case; a custom `decide` or Done handler must not reopen the start page |

## Acceptance bar

Copy this list into the current spec's Native feel section and mark each item verified on a device, failed, or not applicable, with the evidence ([records](applet-records.md), [verification](verification.md#native-feel-scenarios)).

- [ ] Cold start signed in and signed out: no website flash; the signed-out start reaches the sign-in at once.
- [ ] Every core journey's landing URLs are routed or recorded as website pages on purpose.
- [ ] Every routed screen has its own destination-shaped, shimmering skeleton, an error with Retry and View website, a confirmed empty state and a stale state.
- [ ] Opening a detail shows its screen and skeleton at once.
- [ ] Every control shows a pressed state; every action shows busy, then an outcome; removals offer Undo.
- [ ] Back closes overlays first, restores the previous screen at once with its scroll position, and the system gesture works.
- [ ] Screen changes push, pop, fade through and rise as [motion](motion.md) describes; no copy stays on screen after rapid Back.
- [ ] Pull to refresh and a labeled Refresh control where the product has refresh.
- [ ] Light and dark, 200% text, the narrowest width and reduced motion all checked on the changed screens.
- [ ] Controls that show the website carry the cue; the website appears nowhere else in the journeys.
