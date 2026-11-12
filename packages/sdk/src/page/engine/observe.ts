import type { Change } from "./invalidate.js";

/**
 * Watches the document: DOM mutations, field input, element sizes, and same-document
 * navigation. Each source reports `Change`s or a URL change; the runtime decides what they mean.
 */
export interface Observer {
  /** Replaces the elements whose size changes are reported. */
  measure(elements: Iterable<Element>): void;
  /** Replaces the same-origin frame documents and open shadow roots observed besides the document. */
  scopes(scopes: Set<Document | ShadowRoot>): void;
  disconnect(): void;
}

export function observe(onChanges: (changes: Change[]) => void): Observer {
  const onMutations = (records: MutationRecord[]) => {
    const changes: Change[] = [];
    for (const record of records) {
      changes.push({ target: record.target, kind: record.type });
      // A removed node no longer leads up to the region it left; report it so an item or extent it was is found by itself.
      for (const node of record.removedNodes) changes.push({ target: node, kind: "childList", removed: true });
    }
    onChanges(changes);
  };
  const mutations = new MutationObserver(onMutations);
  const options: MutationObserverInit = { childList: true, subtree: true, attributes: true, characterData: true };
  mutations.observe(document, options);

  // The first node of the composed path is the field itself, also inside an open shadow root.
  // Nodes of a frame come from its realm, so they are recognized by `nodeType`, not `instanceof`.
  const onField = (event: Event) => {
    const target = event.composedPath()[0] ?? event.target;
    if (typeof (target as Node | null)?.nodeType === "number") onChanges([{ target: target as Node, kind: "field" }]);
  };
  // A frame that loads a new document replaces the nodes a watch read in it; report the frame.
  const onLoad = (event: Event) => {
    const target = event.target as Element | null;
    if (target?.localName === "iframe" || target?.localName === "frame") onChanges([{ target, kind: "childList" }]);
  };
  // Field and load events stay in their own document, so each observed document gets the listeners.
  const listen = (doc: Document) => {
    doc.addEventListener("input", onField, true);
    doc.addEventListener("change", onField, true);
    doc.addEventListener("load", onLoad, true);
  };
  const unlisten = (doc: Document) => {
    doc.removeEventListener("input", onField, true);
    doc.removeEventListener("change", onField, true);
    doc.removeEventListener("load", onLoad, true);
  };
  listen(document);
  let observed = new Set<Document | ShadowRoot>();

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
    scopes(scopes) {
      if (scopes.size === observed.size && [...scopes].every(scope => observed.has(scope))) return;
      // MutationObserver cannot stop observing one node: deliver what is queued, then observe the new set.
      const queued = mutations.takeRecords();
      mutations.disconnect();
      mutations.observe(document, options);
      for (const scope of scopes) mutations.observe(scope, options);
      for (const scope of observed) if (scope.nodeType === Node.DOCUMENT_NODE && !scopes.has(scope)) unlisten(scope as Document);
      for (const scope of scopes) if (scope.nodeType === Node.DOCUMENT_NODE && !observed.has(scope)) listen(scope as Document);
      observed = new Set(scopes);
      if (queued.length) onMutations(queued);
    },
    disconnect() {
      mutations.disconnect();
      resize?.disconnect();
      unlisten(document);
      for (const scope of observed) if (scope.nodeType === Node.DOCUMENT_NODE) unlisten(scope as Document);
      observed = new Set();
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
