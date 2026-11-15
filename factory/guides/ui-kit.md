# UI kit

The `create` templates start with plain text notices and a few color tokens. A native-feeling applet needs more before its first screen: motion tokens, skeletons that shimmer, a stage that animates screen changes, toasts with Undo, a delayed progress bar, buttons that stay busy long enough to be seen, a website cue and pull to refresh. This guide gives that foundation as code to copy into `src/`. The code is React with the router helper and is the shape the bundled applets were verified with on a device; with another framework, port the same behavior ([frameworks](frameworks.md)).

Copy the foundation before writing the first screen, then change the tokens to the product's look. Keep the behavior: each piece implements a rule from [native feel](native-feel.md), [motion](motion.md), [presentation](presentation.md) or [defaults](defaults.md), and a replacement must keep the same behavior. An existing applet that already has equivalents keeps its own; add only the missing pieces.

| File | Contents |
| --- | --- |
| [`src/theme.css`](#theme) | Color, layout and motion tokens in light and dark, base element styles, and the classes the components use |
| [`src/ui/motion.tsx`](#motion-stage) | `Stage`, `GhostLayer`, `Place`, `motionBetween`, `usePlaceMotion` and `reducedMotion` |
| [`src/ui/feedback.tsx`](#feedback) | `ToastProvider`, `useToast`, `ToastRegion`, `ProgressBar`, `useBusy` and `RetryButton` |
| [`src/ui/states.tsx`](#states) | `Skeleton` shapes, `useSawLoading`, `Notice`, `LoadError` and `WebsiteCue` |
| [`src/ui/pull.tsx`](#pull-to-refresh) | `usePullToRefresh` and `PullIndicator` |
| [`src/app.tsx`](#wiring) | The shell that wires the stage, the tabs and the toast region |

## Theme

Replace the color values with the product's palette and keep the token names, so every component and screen uses them. Every color has a dark value; the applet follows the system theme unless the product has its own setting, which sets `data-theme` on `html`.

```css
:root {
  color-scheme: light dark;
  /* Color: the product's palette */
  --canvas: #ffffff;        /* the page behind every screen */
  --surface: #f4f5f7;       /* cards, inputs, inline errors */
  --ink: #111418;           /* primary text */
  --ink-2: #5b6570;         /* secondary text */
  --ink-3: #8a939c;         /* tertiary text, icons at rest */
  --line: #e3e6ea;          /* separators and borders */
  --accent: #1a73e8;        /* the brand color; also shell.accent in applet.json */
  --on-accent: #ffffff;
  --danger: #c5221f;
  --press: rgba(0, 0, 0, .08);      /* the pressed state layer */
  --skeleton: #eceef1;              /* placeholder shapes: neutral, never the accent */
  --shimmer: rgba(255, 255, 255, .7);
  --toast: #1f2328;
  --on-toast: #ffffff;
  --shadow: 0 6px 24px rgba(0, 0, 0, .18);
  /* Layout */
  --edge: 16px;             /* screen side padding */
  --radius: 12px;
  --menu-corner: 60px;      /* the shell's 44 dp menu button, 8 dp from the edge, plus a gap */
  /* Motion */
  --ease-out: cubic-bezier(.2, 0, 0, 1);         /* entrances: fast start, gentle stop */
  --ease-in: cubic-bezier(.3, 0, .8, .15);       /* exits: leave quickly */
  --ease-spring: cubic-bezier(.34, 1.4, .64, 1); /* small pops: badges, checks, stars */
  --dur-short: .15s;        /* pressed states, color changes */
  --dur-medium: .25s;       /* popovers, toasts, crossfades */
  --dur-long: .35s;         /* sheets, the drawer */
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --canvas: #101214; --surface: #1b1e22; --ink: #eef0f2; --ink-2: #a9b1ba; --ink-3: #7c858e; --line: #2a2e33;
    --accent: #8ab4f8; --on-accent: #101214; --danger: #f28b82;
    --press: rgba(255, 255, 255, .1); --skeleton: #22262a; --shimmer: rgba(255, 255, 255, .08);
    --toast: #e8eaed; --on-toast: #101214; --shadow: 0 6px 24px rgba(0, 0, 0, .5);
  }
}
:root[data-theme="dark"] {
  --canvas: #101214; --surface: #1b1e22; --ink: #eef0f2; --ink-2: #a9b1ba; --ink-3: #7c858e; --line: #2a2e33;
  --accent: #8ab4f8; --on-accent: #101214; --danger: #f28b82;
  --press: rgba(255, 255, 255, .1); --skeleton: #22262a; --shimmer: rgba(255, 255, 255, .08);
  --toast: #e8eaed; --on-toast: #101214; --shadow: 0 6px 24px rgba(0, 0, 0, .5);
}

/* Base: explicit colors, no web tap flash, no double-tap zoom delay, no text selection on controls. */
html, body { margin: 0; height: 100%; background: var(--canvas); color: var(--ink); -webkit-text-size-adjust: 100%; }
body { font: 16px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overscroll-behavior: none; }
#root { height: 100%; }
button, input, textarea, select { font: inherit; color: inherit; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
button { margin: 0; padding: 0; border: 0; background: none; cursor: pointer; }
button, .row, .tab { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
button:disabled { cursor: default; opacity: .5; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
img { display: block; max-width: 100%; }

/* App frame: one content area that holds the stages, and the tab bar under it. */
.app { position: fixed; inset: 0; display: flex; flex-direction: column; }
.content { position: relative; flex: 1; min-height: 0; overflow: hidden; isolation: isolate; }
.stage, .ghosts, .ghost { position: absolute; inset: 0; }
.stage { display: flex; flex-direction: column; background: var(--canvas); }
.ghosts, .ghost { pointer-events: none; }
.ghost, .ghost * { animation: none !important; transition: none !important; } /* a frozen picture */
.screen { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
.menu-corner { float: right; width: 44px; height: 44px; }      /* first row of a screen without a header */
.top-bar { display: flex; align-items: center; gap: 4px; min-height: 56px; padding: 4px var(--menu-corner) 4px 4px; }
.top-bar h1 { flex: 1; margin: 0; font-size: 20px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Pressed states answer every tap at once. */
.row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 12px var(--edge); text-align: start; transition: background-color var(--dur-short); }
.row:active { background: var(--press); }
.button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 18px; border-radius: 999px; font-weight: 600; transition: transform var(--dur-short) var(--ease-out), background-color var(--dur-short); }
.button.primary { background: var(--accent); color: var(--on-accent); }
.button.secondary { background: var(--surface); }
.button:active:not(:disabled) { transform: scale(.97); }
.icon-button { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; transition: background-color var(--dur-short), transform var(--dur-short) var(--ease-out); }
.icon-button:active:not(:disabled) { background: var(--press); transform: scale(.92); }
.icon-button svg, .website-cue { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon-button svg { width: 24px; height: 24px; }

/* Tabs */
.tabs { display: flex; flex: none; padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid var(--line); background: var(--canvas); animation: rise var(--dur-medium) var(--ease-out); }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 64px; font-size: 12px; color: var(--ink-2); }
.tab[aria-current="page"] { color: var(--ink); font-weight: 600; }

/* Skeletons fade in after a moment, so fast loads never flash, then shimmer.
   Only .sk paints and animates; shape classes set size only, so no selector can outrank the shimmer. */
.skeleton { animation: fade .2s .12s both; }
.sk { display: block; border-radius: 6px; background: linear-gradient(90deg, var(--skeleton) 0 40%, var(--shimmer) 50%, var(--skeleton) 60% 100%) var(--skeleton); background-size: 300% 100%; animation: shimmer 1.4s linear infinite; }
.sk-line { height: 12px; }
.sk-title { height: 20px; border-radius: 8px; }
.sk-avatar { flex: none; width: 40px; height: 40px; border-radius: 50%; }
.sk-media { aspect-ratio: 16 / 9; border-radius: var(--radius); }
.skeleton-row { display: flex; gap: 12px; padding: 12px var(--edge); }
.skeleton-row > div { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.reveal { animation: fade .24s var(--ease-out); }                 /* content replacing a skeleton */

/* A thin bar under the header for work on content already shown; appears only after 250 ms. */
.progress-bar { position: relative; flex: none; height: 3px; margin-bottom: -3px; z-index: 2; overflow: hidden; opacity: 0; transition: opacity .2s; pointer-events: none; }
.progress-bar.active { opacity: 1; transition-delay: .25s; }
.progress-bar.active::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: 2px; background: var(--accent); animation: progress 1.2s var(--ease-out) infinite; }

/* Toasts slide up above the tab bar and slide away. */
.toast-region { position: absolute; left: 12px; right: 12px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 40; display: flex; justify-content: center; pointer-events: none; }
.app.has-tabs .toast-region { bottom: calc(80px + env(safe-area-inset-bottom)); }
.toast { pointer-events: auto; display: flex; align-items: center; gap: 4px; width: 100%; max-width: 520px; min-height: 52px; padding: 4px 4px 4px 16px; border-radius: 16px; background: var(--toast); color: var(--on-toast); box-shadow: var(--shadow); animation: toast-in var(--dur-medium) var(--ease-out); }
.toast > span { flex: 1; }
.toast button { min-height: 48px; padding: 0 12px; color: inherit; font-weight: 700; }
.toast.leaving { animation: toast-out .18s var(--ease-in) forwards; }

/* Notices and errors */
.notice { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px var(--edge); text-align: center; }
.notice h2 { margin: 0; font-size: 18px; }
.notice p { margin: 0; color: var(--ink-2); }
.row-buttons { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 8px; }
.inline-error { margin: 8px var(--edge); padding: 10px 12px; border-radius: var(--radius); background: var(--surface); color: var(--ink-2); font-size: 14px; }
.website-cue { width: 16px; height: 16px; flex: none; vertical-align: -3px; }

/* Pull to refresh: a disc that follows the finger, turns with the pull and spins while loading. */
.pull-indicator { position: absolute; top: -44px; left: 50%; z-index: 3; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--canvas); color: var(--ink-3); box-shadow: 0 2px 8px rgba(0, 0, 0, .18); pointer-events: none; }
.pull-indicator.armed, .pull-indicator.active { color: var(--accent); }
.pull-indicator.active { transition: transform .25s var(--ease-out); }
.pull-indicator.active span { animation: spin .8s linear infinite; }
.pull-indicator svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; }

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(100%); } }
@keyframes shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }
@keyframes progress { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes toast-in { from { opacity: 0; transform: translateY(24px) scale(.96); } }
@keyframes toast-out { to { opacity: 0; transform: translateY(16px) scale(.96); } }

/* Reduced motion: every state still shows, nothing moves. Pseudo-elements animate too, so cover them. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; scroll-behavior: auto !important; }
  .progress-bar.active::before { width: 100%; opacity: .5; animation: none !important; }
}
```

Reduced motion sets durations to zero instead of `animation: none`, so an animation with `forwards` or `both` still lands on its end state and `animationend` still fires. The stage reads the setting itself, because the Web Animations API ignores CSS.

## Motion stage

The router swaps screens at once and the outgoing component unmounts, so the stage animates a copy. It is explained in [motion](motion.md#the-stage-and-the-ghost-layer); this is the code. `SCROLLERS` names the classes whose scroll position the copy keeps.

```tsx
// src/ui/motion.tsx
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

export type Motion = "push" | "pop" | "fade" | "drawer-in" | "drawer-out" | "sheet-close" | "sheet-swap" | "none";

/** Read per change, so a settings change applies without a restart. */
export function reducedMotion(): boolean {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

const EASE_OUT = "cubic-bezier(.2, 0, 0, 1)";
const EASE_IN = "cubic-bezier(.3, 0, .8, .15)";
const SHIFT = "32px";
type Play = { frames: Keyframe[]; ms: number; easing: string; target?: string };

const ENTER: Partial<Record<Motion, Play>> = {
  push: { frames: [{ opacity: 0, transform: `translateX(${SHIFT})` }, { opacity: 1, transform: "none" }], ms: 300, easing: EASE_OUT },
  pop: { frames: [{ opacity: 0, transform: `translateX(-${SHIFT})` }, { opacity: 1, transform: "none" }], ms: 300, easing: EASE_OUT },
  fade: { frames: [{ opacity: 0, transform: "scale(.98)" }, { opacity: 1, transform: "none" }], ms: 220, easing: EASE_OUT },
  "drawer-in": { frames: [{ transform: "translateX(-100%)" }, { transform: "none" }], ms: 280, easing: EASE_OUT },
};

/** The outgoing copy's exit, and whether the copy plays above the live screen. */
const EXIT: Partial<Record<Motion, Play[] & { above?: boolean }>> = {
  push: [{ frames: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(-${SHIFT})` }], ms: 200, easing: EASE_IN }],
  pop: Object.assign([{ frames: [{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${SHIFT})` }], ms: 200, easing: EASE_IN }], { above: true }),
  fade: [{ frames: [{ opacity: 1 }, { opacity: 0 }], ms: 120, easing: EASE_IN }],
  "drawer-in": [{ frames: [{ opacity: 1 }, { opacity: .6 }], ms: 280, easing: EASE_OUT }],
  "drawer-out": Object.assign([{ frames: [{ transform: "none" }, { transform: "translateX(-100%)" }], ms: 240, easing: EASE_IN }], { above: true }),
  "sheet-close": Object.assign([
    { frames: [{ transform: "translateY(100%)" }], ms: 220, easing: EASE_IN, target: ".sheet" },
    { frames: [{ opacity: 1 }, { opacity: 0 }], ms: 220, easing: "linear", target: ".sheet-backdrop" },
  ], { above: true }),
  "sheet-swap": [
    { frames: [{ opacity: 1 }, { opacity: 0, transform: "translateY(24px)" }], ms: 160, easing: EASE_IN, target: ".sheet" },
    { frames: [{ opacity: 1 }, { opacity: 1 }], ms: 260, easing: "linear", target: ".sheet-backdrop" },
  ],
};

const SCROLLERS = ".screen, .sheet-body, .sheet";
/** The screen key and the page can change in quick turns; changes closer than this are one change. */
const SETTLE_MS = 90;

interface Copy { node: HTMLElement; tops: number[] }

function copyOf(element: HTMLElement): Copy {
  const tops = [...element.querySelectorAll<HTMLElement>(SCROLLERS)].map(node => node.scrollTop);
  const node = element.cloneNode(true) as HTMLElement;
  node.setAttribute("aria-hidden", "true");
  node.inert = true;
  node.classList.add("ghost");
  return { node, tops };
}

function playExit(layer: HTMLElement | null, copy: Copy, motion: Motion, zIndex: number) {
  const plays = EXIT[motion];
  if (!layer || !plays) return;
  copy.node.style.zIndex = String(zIndex + (plays.above ? 1 : -1));
  layer.appendChild(copy.node);
  copy.node.querySelectorAll<HTMLElement>(SCROLLERS).forEach((node, index) => { node.scrollTop = copy.tops[index] ?? 0; });
  const animations = plays.map(play => {
    const target = play.target ? copy.node.querySelector<HTMLElement>(play.target) : copy.node;
    return target?.animate(play.frames, { duration: play.ms, easing: play.easing, fill: "forwards" });
  });
  const remove = () => copy.node.remove();
  Promise.all(animations.map(animation => animation?.finished)).then(remove, remove);
  window.setTimeout(remove, Math.max(...plays.map(play => play.ms)) + 200); // never leave a copy behind
}

/** One animated screen slot. A null `id` renders nothing, so a sheet slot can close with motion. */
export function Stage({ id, motion, layer, zIndex, inert, children }: {
  id: string | null; motion: Motion; layer: RefObject<HTMLDivElement | null>; zIndex: number; inert?: boolean; children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const shown = useRef<{ id: string | null; at: number }>({ id, at: 0 });
  const change = useRef<{ copy: Copy | null; motion: Motion } | null>(null);

  // During render the outgoing screen is still in the DOM: the last chance to copy it.
  if (shown.current.id !== id) {
    const now = performance.now();
    const settling = now - shown.current.at < SETTLE_MS;
    const still = reducedMotion() || motion === "none" || settling;
    change.current = still ? null : { copy: host.current ? copyOf(host.current) : null, motion };
    shown.current = { id, at: settling ? shown.current.at : now };
  }

  useLayoutEffect(() => {
    const next = change.current;
    change.current = null;
    if (!next) return;
    if (next.copy) playExit(layer.current, next.copy, next.motion, zIndex);
    const enter = ENTER[next.motion];
    if (enter && host.current) host.current.animate(enter.frames, { duration: enter.ms, easing: enter.easing });
  }, [id, layer, zIndex]);

  if (id === null) return null;
  return <div ref={host} className="stage" style={{ zIndex }} inert={inert}>{children}</div>;
}

export function GhostLayer({ layer }: { layer: RefObject<HTMLDivElement | null> }) {
  return <div className="ghosts" ref={layer} aria-hidden="true" />;
}

/** Where a screen sits: its identity, history index, overlay depth, and whether it is a tab root or the drawer. */
export interface Place { id: string; index: number; depth: number; tab: boolean; drawer: boolean }

/** Forward pushes, Back pops, tab switches fade through, the drawer slides from the start edge. */
export function motionBetween(from: Place | null, to: Place): Motion {
  if (!from || from.id === to.id) return "none";
  if (to.drawer && !from.drawer) return "drawer-in";
  if (from.drawer && !to.drawer) return "drawer-out";
  if (from.tab && to.tab) return "fade";
  if (to.index !== from.index) return to.index > from.index ? "push" : "pop";
  if (to.depth !== from.depth) return to.depth > from.depth ? "push" : "pop";
  return "fade";
}

export function usePlaceMotion(place: Place): Motion {
  const last = useRef<{ place: Place | null; motion: Motion }>({ place: null, motion: "none" });
  if (last.current.place?.id !== place.id) last.current = { place, motion: motionBetween(last.current.place, place) };
  return last.current.motion;
}
```

## Feedback

Toasts carry the outcome of an action and its Undo. `useBusy` keeps a control in its ongoing state from the tap until the work settles, and for at least 800 ms, so a fast failure still shows that the tap did something. `RetryButton` does the same for `reload()`, which returns nothing: it stays busy until the error changes or 4 seconds pass. While busy, the control is disabled, which also stops a second tap from sending a second write.

```tsx
// src/ui/feedback.tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface Toast { id: number; text: string; action?: { label: string; run(): unknown } }
interface Toasts { toast: Toast | null; show(toast: Omit<Toast, "id">): void; clear(): void }
const ToastContext = createContext<Toasts | null>(null);
let nextToast = 1;

/** One toast at a time; a new one replaces the old. A toast with an action stays longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);
  const clear = useCallback(() => { window.clearTimeout(timer.current); setToast(null); }, []);
  const show = useCallback((next: Omit<Toast, "id">) => {
    window.clearTimeout(timer.current);
    const shown = { ...next, id: nextToast++ };
    setToast(shown);
    timer.current = window.setTimeout(() => setToast(current => current?.id === shown.id ? null : current), next.action ? 6000 : 4000);
  }, []);
  const value = useMemo(() => ({ toast, show, clear }), [toast, show, clear]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): Toasts {
  const toasts = useContext(ToastContext);
  if (!toasts) throw new Error("useToast needs a ToastProvider");
  return toasts;
}

/** Keeps the toast mounted for its exit. A failed action says so instead of disappearing. */
export function ToastRegion() {
  const { toast, show, clear } = useToast();
  const [shown, setShown] = useState<{ toast: Toast; leaving: boolean } | null>(null);
  useEffect(() => {
    if (toast) { setShown({ toast, leaving: false }); return; }
    setShown(current => current && { ...current, leaving: true });
    const timer = window.setTimeout(() => setShown(current => current?.leaving ? null : current), 180);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const run = (action: NonNullable<Toast["action"]>) => {
    clear();
    const fail = () => show({ text: `Couldn't ${action.label.toLowerCase()}. Try again.` });
    try { Promise.resolve(action.run()).catch(fail); } catch { fail(); }
  };
  const current = shown?.toast;
  return <div className="toast-region" role="status" aria-live="polite">
    {current && <div className={`toast${shown.leaving ? " leaving" : ""}`} key={current.id}>
      <span>{current.text}</span>
      {current.action && <button type="button" disabled={shown.leaving} onClick={() => run(current.action!)}>{current.action.label}</button>}
    </div>}
  </div>;
}

/** Work on content the screen already shows: reloads, stale refreshes, commands. */
export function ProgressBar({ active, label = "Loading" }: { active: boolean; label?: string }) {
  return <div className={`progress-bar${active ? " active" : ""}`} role="progressbar" aria-label={label} aria-hidden={!active} aria-busy={active} />;
}

export const MIN_BUSY_MS = 800;
export const MAX_BUSY_MS = 4000;

/** `[busy, run]`: `run(work)` shows busy from the tap until the work settles, for at least MIN_BUSY_MS. */
export function useBusy(): [boolean, (work: () => unknown) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const run = useCallback(async (work: () => unknown) => {
    if (running.current) return;                       // a second tap never sends a second write
    running.current = true;
    const started = Date.now();
    setBusy(true);
    try { await work(); } finally {
      window.setTimeout(() => { running.current = false; setBusy(false); }, Math.max(0, started + MIN_BUSY_MS - Date.now()));
    }
  }, []);
  return [busy, run];
}

/** Retry for `reload()`, which resolves nothing: busy until `error` changes (at least MIN_BUSY_MS) or MAX_BUSY_MS. */
export function RetryButton({ error, onRetry, label = "Try again" }: { error: unknown; onRetry(): void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState(false);
  const tapped = useRef(0);
  useEffect(() => setAnswered(true), [error]);
  useEffect(() => {
    if (!busy) return;
    const wait = answered ? Math.max(0, tapped.current + MIN_BUSY_MS - Date.now()) : MAX_BUSY_MS;
    const timer = window.setTimeout(() => setBusy(false), wait);
    return () => window.clearTimeout(timer);
  }, [busy, answered]);
  const retry = () => { tapped.current = Date.now(); setAnswered(false); setBusy(true); onRetry(); };
  return <button type="button" className="button secondary" disabled={busy} aria-busy={busy} onClick={retry}>
    {busy ? "Trying again…" : label}
  </button>;
}
```

Use them like this:

```tsx
const { show } = useToast();
const [saving, run] = useBusy();
const archive = useCommand("archive");
const unarchive = useCommand("unarchive");

<button type="button" className="button primary" disabled={saving} aria-busy={saving}
  onClick={() => run(async () => {
    const result = await archive({ id });
    if (result.outcome === "observed") show({ text: "Archived", action: { label: "Undo", run: () => unarchive({ id }) } });
    else if (result.outcome === "unknown") show({ text: "Not sure it was archived. Check on the website." });
    else show({ text: result.message ?? "Couldn't archive." });
  })}>{saving ? "Archiving…" : "Archive"}</button>
```

Choose the message from the [input outcomes](interactions.md); never show a success for `unknown`.

## States

A skeleton is drawn per screen, shaped like that screen's content, from the `.sk` shapes. The `Skeleton` below is a starting point for list screens; detail, profile, grid and search screens each get their own shape. Never reuse a list skeleton for a grid.

```tsx
// src/ui/states.tsx
import { useRef, type ReactNode } from "react";
import { useRouter } from "@genesis/sdk/react";
import type { ErrorBody } from "@genesis/sdk";
import { RetryButton } from "./feedback";

/** A list placeholder: avatar and text rows. Build other shapes from the same .sk classes. */
export function Skeleton({ label, rows = 7, avatar = true }: { label: string; rows?: number; avatar?: boolean }) {
  return <div className="skeleton" role="status" aria-busy="true" aria-label={label}>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-row" aria-hidden="true">
      {avatar && <span className="sk sk-avatar" />}
      <div><span className="sk sk-line" style={{ width: "40%" }} /><span className="sk sk-line" /><span className="sk sk-line" style={{ width: index % 3 === 2 ? "55%" : "75%" }} /></div>
    </div>)}
  </div>;
}

/** True once a loading state was shown, so the content that replaces it fades in; cached content does not. */
export function useSawLoading(loading: boolean): boolean {
  const saw = useRef(loading);
  if (loading) saw.current = true;
  return saw.current;
}

export function Notice({ title, children, role }: { title: string; children?: ReactNode; role?: "alert" | "status" }) {
  return <section className="notice" role={role}><h2>{title}</h2>{children}</section>;
}

/** The external-arrow cue on every control that shows the website. */
export function WebsiteCue() {
  return <svg className="website-cue" viewBox="0 0 24 24" role="img" aria-label="opens website"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>;
}

/** A failed load with nothing to show: the reason, Retry, and the website. */
export function LoadError({ error, site }: { error: ErrorBody | null | undefined; site: string }) {
  const { reload, viewWebsite } = useRouter();
  const message = error?.code === "NOT_READY" || error?.code === "DEADLINE" ? `${site} did not answer in time.`
    : error?.message || "This page could not be read.";
  return <Notice title={`Couldn't load ${site}`} role="alert">
    <p>{message}</p>
    <div className="row-buttons">
      <RetryButton error={error} onRetry={() => reload()} />
      <button type="button" className="button secondary" onClick={() => viewWebsite()}>View website <WebsiteCue /></button>
    </div>
  </Notice>;
}
```

## Pull to refresh

`reload()` returns nothing, so the hook watches the route: it spins until the page has gone to loading and come back, with a 10 second limit.

```tsx
// src/ui/pull.tsx
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useRouter } from "@genesis/sdk/react";

const PULL_TRIGGER = 72; // px of indicator travel that arms a refresh
const PULL_MAX = 112;

export interface PullState {
  pull: number; active: boolean;
  handlers: { onTouchStart(event: TouchEvent<HTMLElement>): void; onTouchMove(event: TouchEvent<HTMLElement>): void; onTouchEnd(): void; onTouchCancel(): void };
}

/** Spread `handlers` on the screen's scroller. `loading` is `status.status === "loading" || status.stale`. */
export function usePullToRefresh(loading: boolean, contextId?: string): PullState {
  const { reload } = useRouter();
  const [pull, setPull] = useState(0);
  const [active, setActive] = useState(false);
  const origin = useRef<number | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (loading) started.current = true;
    else if (started.current) { setActive(false); return; }
    const limit = window.setTimeout(() => setActive(false), 10000);
    return () => window.clearTimeout(limit);
  }, [active, loading]);

  const run = () => { if (active) return; setActive(true); started.current = false; reload(contextId); };
  const reset = () => { origin.current = null; setPull(0); };
  return {
    pull, active,
    handlers: {
      onTouchStart: event => { origin.current = event.currentTarget.scrollTop <= 0 && !active ? event.touches[0]!.clientY : null; },
      onTouchMove: event => {
        if (origin.current === null) return;
        const dy = event.touches[0]!.clientY - origin.current;
        if (dy <= 0 || event.currentTarget.scrollTop > 0) { reset(); return; }
        setPull(Math.min(PULL_MAX, dy * 0.5));
      },
      onTouchEnd: () => { if (origin.current !== null && pull >= PULL_TRIGGER) run(); reset(); },
      onTouchCancel: reset,
    },
  };
}

export function PullIndicator({ state }: { state: PullState }) {
  const { pull, active } = state;
  if (!pull && !active) return null;
  const turn = Math.min(1, pull / PULL_TRIGGER);
  return <div className={`pull-indicator${active ? " active" : ""}${pull >= PULL_TRIGGER ? " armed" : ""}`} aria-hidden="true"
    style={{ transform: `translate(-50%, ${active ? 56 : pull}px)`, opacity: active ? 1 : turn }}>
    <span style={active ? undefined : { transform: `rotate(${turn * 270}deg)` }}>
      <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
    </span>
  </div>;
}
```

Keep a labeled Refresh control as well, for people who do not pull ([defaults](defaults.md)).

## Wiring

The shell renders one stage for the screen, the ghost layer, the tab bar on tab roots and the toast region. The stage is not keyed, so it survives screen changes; the screen inside it is keyed by `screen.key`, so each history entry gets fresh state. Applets with sheets add a second stage, as [motion](motion.md#sheets-keep-the-screen-under-them) describes.

```tsx
// src/app.tsx
import { useRef, type ComponentType } from "react";
import { useRouter } from "@genesis/sdk/react";
import { GhostLayer, Stage, usePlaceMotion, type Place } from "./ui/motion";
import { ToastProvider, ToastRegion } from "./ui/feedback";
import { FeedScreen } from "./screens/feed";
import { ItemScreen } from "./screens/item";
import { SavedScreen } from "./screens/saved";

const SCREENS: Record<string, ComponentType> = { feed: FeedScreen, item: ItemScreen, saved: SavedScreen };
const TAB_ROOTS = new Set(["feed", "saved"]); // the screens the tab bar opens

export function App() {
  return <ToastProvider><Shell /></ToastProvider>;
}

function Shell() {
  const { screen, state, select, navigate } = useRouter();
  const layer = useRef<HTMLDivElement>(null);
  // Context screen keys end in the history index; overlay screens keep the last index seen.
  const index = useRef(0);
  const match = screen && !screen.overlay ? /:(\d+)$/.exec(screen.key) : null;
  if (match) index.current = Number(match[1]);
  const tab = !!screen && TAB_ROOTS.has(screen.id);
  const place: Place = { id: screen?.key ?? "website", index: index.current, depth: state.overlay.length, tab, drawer: false };
  const motion = usePlaceMotion(place);
  const Screen = screen ? SCREENS[screen.id] : undefined;

  return <div className={`app${tab ? " has-tabs" : ""}`}>
    <main className="content">
      <Stage id={place.id} motion={motion} layer={layer} zIndex={10}>{Screen && <Screen key={screen!.key} />}</Stage>
      <GhostLayer layer={layer} />
    </main>
    {tab && <nav className="tabs" aria-label="Sections">
      <button type="button" className="tab" aria-current={screen!.id === "feed" ? "page" : undefined} onClick={() => select("primary")}>Feed</button>
      <button type="button" className="tab" aria-current={screen!.id === "saved" ? "page" : undefined} onClick={() => navigate({ screen: "saved", mode: "root" })}>Saved</button>
    </nav>}
    <ToastRegion />
  </div>;
}
```

A screen renders its states in a fixed order: error with nothing to show, a confirmed empty page, the skeleton, then the content with its refreshing state.

```tsx
// src/screens/feed.tsx
import { ScrollMemory, useRouter, useWatch } from "@genesis/sdk/react";
import { ProgressBar } from "../ui/feedback";
import { LoadError, Notice, Skeleton, useSawLoading } from "../ui/states";
import { PullIndicator, usePullToRefresh } from "../ui/pull";

export function FeedScreen() {
  const { status, navigate, reload } = useRouter();
  const page = status();
  const posts = useWatch<never, Post>("feed:posts", { reader: "posts" });
  const refreshing = page.status === "loading" || page.stale;
  const pull = usePullToRefresh(refreshing);
  const none = posts.order.length === 0;
  const fadeIn = useSawLoading(none);

  if (none) {
    if (page.status === "error" || posts.status === "error") return <LoadError error={page.error ?? posts.error} site="Example" />;
    if (page.status === "ready" && !page.stale && posts.status === "ready") return <Notice title="No posts yet">
      <button type="button" className="button secondary" onClick={() => reload()}>Refresh</button>
    </Notice>;
    return <Skeleton label="Loading posts" />;
  }
  return <>
    <ProgressBar active={refreshing} />
    <ScrollMemory className="screen" aria-busy={refreshing} {...pull.handlers}>
      <PullIndicator state={pull} />
      <span className="menu-corner" aria-hidden="true" />
      {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
      <ul className={fadeIn ? "reveal" : undefined}>
        {posts.order.map(key => <li key={key}>
          {/* Open the detail from its URL: the router shows the item screen and its skeleton at once. */}
          <button type="button" className="row" onClick={() => navigate({ url: posts.records[key]!.url })}>
            {posts.records[key]!.title}
          </button>
        </li>)}
      </ul>
    </ScrollMemory>
  </>;
}
```

`Post` is the screen's record type, with a `url` the reader resolved and validated. Opening a row stays enabled on a stale copy, because it only navigates; disable controls that act on the page (vote, save, archive) while `page.stale` is true.
