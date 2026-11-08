import type { Change } from "./invalidate.js";

/**
 * Watches the document: DOM mutations, field input, element sizes, and same-document
 * navigation. Each source reports `Change`s or a URL change; the runtime decides what they mean.
 */
export interface Observer {
  /** Replaces the elements whose size changes are reported. */
  measure(elements: Iterable<Element>): void;
  disconnect(): void;
}

export function observe(onChanges: (changes: Change[]) => void): Observer {
  const mutations = new MutationObserver(records => {
    onChanges(records.map(record => ({ target: record.target, kind: record.type })));
  });
  mutations.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });

  const onField = (event: Event) => {
    if (event.target instanceof Node) onChanges([{ target: event.target, kind: "field" }]);
  };
  document.addEventListener("input", onField, true);
  document.addEventListener("change", onField, true);

  // ResizeObserver reports every element once when observed; only real size changes count.
  const sizes = new WeakMap<Element, string>();
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(entries => {
    const changed: Change[] = [];
    for (const entry of entries) {
      const size = `${entry.contentRect.width}x${entry.contentRect.height}`;
      const before = sizes.get(entry.target);
      sizes.set(entry.target, size);
      if (before !== undefined && before !== size) changed.push({ target: entry.target, kind: "resize" });
    }
    if (changed.length) onChanges(changed);
  }) : null;

  return {
    measure(elements) {
      if (!resize) return;
      resize.disconnect();
      for (const element of elements) resize.observe(element);
    },
    disconnect() {
      mutations.disconnect();
      resize?.disconnect();
      document.removeEventListener("input", onField, true);
      document.removeEventListener("change", onField, true);
    },
  };
}

/**
 * Calls `onUrl` after every same-document navigation: `pushState` and `replaceState` (patched on
 * the prototype, before any website script runs), `popstate` and `hashchange`. It stays
 * installed for the document's lifetime, since the website keeps the patched methods.
 */
export function watchNavigation(onUrl: () => void) {
  for (const name of ["pushState", "replaceState"] as const) {
    const original = History.prototype[name];
    History.prototype[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      try { onUrl(); } catch (error) { console.error("Genesis navigation handler failed", error); }
      return result;
    };
  }
  addEventListener("popstate", onUrl);
  addEventListener("hashchange", onUrl);
}
