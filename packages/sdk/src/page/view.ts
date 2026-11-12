import { entryKey, type ViewId } from "@genesis/core";
import { watchNavigation } from "../adapter/observe.js";

/**
 * The document's current view. `n` counts same-document navigations that change
 * `entryKey(url)`, as the adapter runtime does; listeners hear each such change.
 */
export interface ViewTracker {
  current(): ViewId;
  /** Sets the generation once the document is bound. */
  bind(generation: number): void;
  onChange(listener: () => void): () => void;
}

/** Must run at document start, before any website script, so it patches `history` first. */
export function trackView(): ViewTracker {
  let generation = 0;
  let n = 0;
  let key = entryKey(location.href);
  const listeners = new Set<() => void>();
  watchNavigation(() => {
    const next = entryKey(location.href);
    if (next === key) return;
    key = next;
    n++;
    for (const listener of [...listeners]) {
      try { listener(); } catch (error) { console.error("Genesis view listener failed", error); }
    }
  });
  return {
    current: () => ({ generation, n, url: location.href }),
    bind(value) { generation = value; },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
