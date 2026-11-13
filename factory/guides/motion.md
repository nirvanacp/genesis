# Motion and feedback

The router helper swaps the UI's screen at once when the page changes, and the shell does not animate anything inside the applet. Motion, loaders and the feedback after a tap are the UI's job. Build them into every new applet from the start, with the same care as the layout: a screen that changes without direction, a tap that shows nothing, or a list that jumps when it loads makes a correct applet feel broken.

Read this with [presentation](presentation.md) for which state to show, [design](design.md) for tokens, and [interactions](interactions.md) for action outcomes. The sections below are defaults (see [default-motion-and-feedback](defaults.md)); a user's own motion choices override them.

## Principles

- **Motion explains a change.** It shows where a screen came from, which control did something and what happened. Do not add motion that explains nothing, such as a bounce on every row.
- **Motion never blocks.** The new screen is live from its first frame. Taps, records, Back and the 300 ms Back deadline never wait for an animation. Animate a copy of what left, never hold the real screen back.
- **Every tap answers within about 100 ms.** It shows a pressed state at once. A change the page will confirm shows the requested state at once (see [optimistic display](interactions.md)). Work that takes longer shows progress.
- **Reduced motion gets the same information without the movement.** Under `prefers-reduced-motion: reduce`, swap at once, keep state changes and progress, and drop slides, scales, shimmer and spins.

## Tokens

Define motion tokens in `src/theme.css` next to the color and layout tokens, and use them in every rule:

```css
:root {
  --ease-out: cubic-bezier(.2, 0, 0, 1);       /* entrances: fast start, gentle stop */
  --ease-in: cubic-bezier(.3, 0, .8, .15);     /* exits: leave quickly */
  --ease-spring: cubic-bezier(.34, 1.4, .64, 1); /* small pops: badges, checks, stars */
  --dur-short: .15s;   /* pressed states, color changes */
  --dur-medium: .25s;  /* popovers, toasts, crossfades */
  --dur-long: .35s;    /* sheets, the drawer */
  --press: rgba(0, 0, 0, .08); /* the state layer; lighter in dark mode */
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; animation: none !important; transition: none !important; }
}
```

Keep durations between 150 and 350 ms. Entrances use `--ease-out` and run a little longer than exits, which use `--ease-in`, so the outgoing screen is gone before the new one settles. Use `--ease-spring` only for small elements.

## Screen transitions

Choose the motion from where the two screens sit, never from which button was tapped, so Android Back, the website's own links and `navigate` all animate the same way.

| Change | Motion |
| --- | --- |
| A new history entry (higher index in `context:index`) or a new overlay screen | Push: the new screen slides in from the end edge about 32 px while fading in; the old one shifts toward the start and fades out |
| Back to a lower index, or an overlay screen closing | Pop: the reverse of push |
| One tab root to another | Fade through: the old screen fades out quickly, the new one fades in from 98% scale |
| A drawer or navigation page | Slides in from the start edge over the dimmed screen, and slides back out |
| A sheet-like overlay screen (compose, a form, a picker) | Rises from the bottom edge over a fading backdrop. The screen under it stays mounted. Closing sinks it, and one sheet replacing another swaps the panel while the backdrop stays |
| The same screen with new content (a filter, a sort) | Crossfade the content only, keyed by the filter |
| Anything else, or no previous screen | Fade, or nothing on first open |

Under right-to-left layouts, mirror the horizontal directions.

### Where a screen sits

With the router helper, `useRouter().screen.key` is `${contextId}:${index}` for a context screen; a higher index is forward. Overlay screens have no index, so carry the last context index you saw and use the overlay count as depth. Mark tab roots and the drawer yourself. A screen whose content depends on a view inside the page (a list and its search mode, for example) can add that view to its identity so the switch animates.

```tsx
interface Place { id: string; index: number; depth: number; tab: boolean; drawer: boolean }

function motionBetween(from: Place | null, to: Place): Motion {
  if (!from || from.id === to.id) return "none";
  if (to.drawer !== from.drawer) return to.drawer ? "drawer-in" : "drawer-out";
  if (from.tab && to.tab) return "fade";
  if (to.index !== from.index) return to.index > from.index ? "push" : "pop";
  if (to.depth !== from.depth) return to.depth > from.depth ? "push" : "pop";
  return "fade";
}
```

### The stage and the ghost layer

The UI has no outgoing screen to animate: the router has already moved to the next page, and the previous screen's component unmounts. Animate a copy instead. A `Stage` wraps the screen slot and, during the render where its `id` changes, clones the outgoing DOM while it still exists. After commit it puts the clone in a ghost layer, inert and hidden from accessibility, plays the clone's exit and the live screen's entrance with the Web Animations API, and removes the clone when its animation finishes.

```tsx
const SETTLE_MS = 90; // the key and the page can change in quick turns; treat them as one change

export function Stage({ id, motion, layer, zIndex, children }: {
  id: string | null; motion: Motion; layer: RefObject<HTMLDivElement | null>; zIndex: number; children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const shown = useRef({ id, at: 0 });
  const change = useRef<{ copy: HTMLElement | null; motion: Motion } | null>(null);

  if (shown.current.id !== id) {                      // during render: the old DOM is still here
    const now = performance.now();
    const settling = now - shown.current.at < SETTLE_MS;
    const still = reducedMotion() || motion === "none" || settling;
    change.current = still ? null : { copy: host.current && ghostOf(host.current), motion };
    shown.current = { id, at: settling ? shown.current.at : now };
  }

  useLayoutEffect(() => {                             // after commit: play both halves
    const next = change.current;
    change.current = null;
    if (!next) return;
    if (next.copy) playExit(layer.current, next.copy, next.motion, zIndex);
    const enter = ENTER[next.motion];
    if (enter && host.current) host.current.animate(enter.frames, { duration: enter.ms, easing: enter.easing });
  }, [id, layer, zIndex]);

  if (id === null) return null;                       // a closed sheet slot still animates its copy out
  return <div ref={host} className="stage" style={{ zIndex }}>{children}</div>;
}

function ghostOf(element: HTMLElement): HTMLElement {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add("ghost");
  return copy; // copy each scroller's scrollTop and restore it after appending the copy
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

`ENTER` and the exit table map each motion to keyframes, a duration and an easing. An exit can name a part of the copy to animate, such as `.sheet` and `.sheet-backdrop`, and whether the copy plays above the live screen (pop, closing sheets, drawer out) or below it (push, fade). Remove the copy on `finished` and again on a timer a little after its duration, so a cancelled animation never leaves one behind.

```css
.content { position: relative; overflow: hidden; isolation: isolate; }
.stage, .ghosts, .ghost { position: absolute; inset: 0; }
.ghosts, .ghost { pointer-events: none; }
.ghost, .ghost * { animation: none !important; transition: none !important; } /* a frozen picture */
```

Wire it in the screen switch. The stage itself is not keyed, so it survives the change; the screen inside it is keyed by `screen.key`, so a new entry still gets fresh state:

```tsx
export function App() {
  const { screen } = useRouter();
  const layer = useRef<HTMLDivElement>(null);
  const place = placeOf(screen);         // index, depth, tab and drawer, as above
  const motion = usePlaceMotion(place);  // remembers the previous place
  const Screen = screen ? SCREENS[screen.id] : undefined;
  return <div className="app">
    <main className="content">
      <Stage id={place.id} motion={motion} layer={layer} zIndex={1}>{Screen && <Screen key={screen!.key} />}</Stage>
      <div className="ghosts" ref={layer} aria-hidden="true" />
    </main>
    <Tabs />
  </div>;
}
```

### Sheets keep the screen under them

When an overlay screen is drawn as a sheet, render two stages: the base screen and the sheet. While a sheet is open, keep rendering the last non-sheet screen in the base stage, under its own key, so it keeps its scroll position and state and does not animate. The sheet stage has its own motion: rise on open (a CSS animation on the sheet, so it plays on mount), sink on close (the stage id becomes `null`), and swap when one sheet replaces another.

Sheets also follow a drag on their handle: translate the sheet with the finger, close past about a quarter of its height or on a fast flick, and spring back otherwise. The closing copy starts from wherever the drag left it.

## Controls

- **Pressed state.** Rows and list buttons get a state layer (`background: var(--press)`) on `:active`. Buttons, chips and pills scale to about 0.97, icon buttons to about 0.92, floating buttons to about 0.94, with `--dur-short` and `--ease-out`.
- **Popovers and menus** grow from the corner nearest their trigger (`transform-origin`), from 90% scale and transparent, in about 180 ms. They close at once on choice, outside tap or Back.
- **Tabs.** The selected tab's indicator pill grows behind its icon. The tab bar slides up when it appears with a section root and is absent on pushed screens. Reselecting the current tab scrolls to the top smoothly.
- **Badges and counts** pop with `--ease-spring` when their value changes: key the badge element by its count so the animation replays.
- **Segmented controls** slide a thumb under the selected segment instead of jumping.
- **Toggles the page confirms** (star, vote, follow, save) switch at once from `usePending` and play one small pop when they turn on. Do not animate them turning off.

## Feedback after an action

Every action ends in a visible outcome. Use the [input outcomes](interactions.md) to choose it:

| Situation | Feedback |
| --- | --- |
| A toggle (star, vote, select) | The requested state at once from `usePending`; the page's state after |
| A command on the open screen (archive, delete, move) | Disable that toolbar while it runs, show the progress bar, then a toast with the result. Close the screen when the page goes away on its own |
| A row removed by swipe or command | The row follows the finger, its action icon grows once releasing will fire, then the row slides out and its height collapses. On `failed`, the row slides back and a toast says why |
| Completing an item | The checkmark pops and the title dims or strikes through, a short pause (about 380 ms), then the item leaves and a toast offers Undo |
| A dismissal, a delete in the applet's own data, a bulk change | A toast with Undo that restores exactly what was removed |
| `unknown` | A toast that says the result is uncertain, with a way to check the website. Never a success |

**Toasts** slide up above the tab bar, stay about 4 seconds (longer when they hold Undo), and slide down when they leave: keep them mounted for their exit. One toast at a time; a new one replaces the old. A floating action button moves up while a toast shows, so the toast never covers it. Undo and View are real buttons with 48 dp targets, and the toast region is `role="status"`.

Reverse an Undo through the same path as the original change, so the store and the page agree.

## Loaders

Choose the loader from what the screen already shows:

| The screen shows | Loader |
| --- | --- |
| Nothing for this page yet | A destination-shaped skeleton that fades in after about 120 ms and shimmers (see [design](design.md#skeletons)) |
| Content, while it reloads or goes stale | The content, with a thin indeterminate progress bar under the header that appears only after about 250 ms. Keep `aria-busy` on the scroll container |
| Content, while a command on it runs | The same progress bar, and that command's controls disabled |
| A list loading more at its end | A small spinner inside the Load more control, which stays disabled |
| A control's own work (Save, Send) | The control's label changes to the ongoing form ("Saving…") and it is disabled |

When content replaces a skeleton, fade it in once (about 240 ms). Do not fade in content that was already cached: a stale copy shows at once.

The delays matter: a fast load shows no loader at all, and a slow one shows it before the user wonders. Never show two loaders for the same work, and never put a spinner in the middle of a screen that has a skeleton.

### Pull to refresh

On a scrolling list whose product has pull to refresh:

1. Only when the scroller is at the top, follow a downward touch with half the finger's distance, up to a maximum (about 112 px). Show a round indicator that follows, turning with the pull.
2. Past a trigger distance (about 72 px), mark it armed (accent color). Releasing before then springs it back.
3. On release when armed, call `reload()` (or `reload(contextId)`) and keep the indicator spinning at a rest position until the page has started loading and finished again, with a time limit of about 10 seconds. Show the progress bar while it runs.
4. Keep a labeled Refresh control too (at the end of the list, or in the empty state) for people who do not pull.

Do not handle the pull on inputs, horizontal scrollers or nested scrollers, and never let it fire during a swipe on a row.

## Gestures

- Follow the finger exactly while dragging: turn off transitions with a `dragging` class, set the transform from the touch, and turn them back on for the settle.
- Decide the direction after a few pixels. A mostly vertical move scrolls and cancels the gesture.
- Show the threshold: the action icon under a row grows, a sheet handle darkens, a pull indicator changes color.
- Release past the threshold animates the rest of the way with `--ease-out`; release before it springs back.
- Every gesture has a visible control that does the same thing, for screen readers and switch access.

## Reduced motion

With reduced motion, the stage swaps screens without copies, sheets appear and disappear at once, shimmer and spinners stop (the skeleton and a full, half-opaque progress bar stay), and the completion pause is zero. Pressed states may keep their color change. Read the setting per change, so changing it applies without a restart.

## Checking motion

On the device, in light and dark:

- Open a detail and go Back with the system Back gesture: push, then pop, with the list's scroll position kept. Tap Back quickly several times: no copies stay on screen and nothing waits.
- Switch tabs: fade through, with no slide. Open and close the drawer and each sheet; drag a sheet closed.
- Load a screen on a slow page: the skeleton fades in and shimmers, then the content fades in once. Reload a loaded screen: content stays and the progress bar appears.
- Pull to refresh: the indicator follows, arms, spins, and clears when the page is ready.
- Toggle a star or vote: it changes at once and settles on the page's state. Complete an item and use Undo. Dismiss something and use Undo.
- Turn on Remove animations in Android's accessibility settings, reopen the applet, and repeat the screen changes: everything swaps at once and stays usable.
- Use the WebView inspector's Performance panel or a screen recording if motion stutters. Animate only `transform` and `opacity` on screens, and never animate `height` on long lists except the one row that is leaving.
