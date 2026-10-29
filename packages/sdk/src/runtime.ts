import { storageApi, type AppletStorage, type StorageChange } from "./storage";
import type { ExecutionContext } from "./protocol";

export type Dispose = () => void;
export interface ElementBinding {
  readonly id: string;
  readonly element: Element;
  readonly contentKey: string;
  readonly routeRevision: number;
}
export interface WatchOptions {
  selector: string;
  root?: Element;
  attributes: string[];
  text: boolean;
  limit?: number;
  contentKey(element: Element): string | null;
}
export interface ElementHandlers {
  enter(binding: ElementBinding): void;
  update?(binding: ElementBinding): void;
  leave?(binding: ElementBinding): void;
}
export interface MountOptions {
  position?: "before" | "after" | "append";
  css?: string;
  shadow?: boolean;
  render(container: HTMLElement): void | Dispose;
}
export type HostCall = <T = unknown>(method: string, params: unknown) => Promise<T>;
export interface AppletContext {
  readonly binding: ExecutionContext;
  readonly signal: AbortSignal;
  readonly root: HTMLElement;
  readonly sourceId: string | null;
  styles: { add(key: string, css: string): Dispose };
  watchElements(key: string, options: WatchOptions, handlers: ElementHandlers): Dispose;
  ui: {
    mountAt(key: string, anchor: Element, options: MountOptions): Dispose;
    openModal(key: string, render: (container: HTMLElement) => void | Dispose): Dispose;
  };
  navigation: { onChange(callback: (url: string) => void): Dispose };
  sources: { open(sourceId: string, url?: string): Promise<void> };
  pages: { open(pageId: string): Promise<void> };
  storage: AppletStorage;
  onDispose(callback: Dispose): void;
}
interface Watcher {
  key: string;
  options: WatchOptions;
  handlers: ElementHandlers;
  bindings: Map<Element, ElementBinding>;
  roots: Set<Element>;
  full: boolean;
  dirty: boolean;
  dispose: Dispose;
}
interface Effect { host: HTMLElement; anchor?: Element; restore(): void; dispose: Dispose; removals: number[] }
const owned = (node: Node): boolean => {
  const element = node instanceof Element ? node : node.parentElement;
  return !!element?.closest("[data-genesis-owned],[data-genesis-style]");
};
const once = (callback: Dispose): Dispose => {
  let done = false;
  return () => { if (!done) { done = true; callback(); } };
};

/** One scope owns every observer, timer, binding and UI host it creates. */
export class ManagedRuntime {
  readonly context: AppletContext;
  private readonly abort = new AbortController();
  private readonly watchers = new Map<string, Watcher>();
  private readonly effects = new Map<string, Effect>();
  private readonly disposers = new Set<Dispose>();
  private readonly storageListeners = new Set<(change: StorageChange) => void>();
  private readonly routes = new Set<(url: string) => void>();
  private readonly observer: MutationObserver;
  private modal: Dispose | undefined;
  private frame = 0;
  private serial = 0;
  private revision = 0;
  private url = location.href;
  private disposed = false;
  private missingKeys = 0;
  private conflicts = 0;
  private batches: number[] = [];

  constructor(binding: ExecutionContext, root: HTMLElement, private readonly call: HostCall,
    private readonly fatal: (error: unknown) => void) {
    this.context = {
      binding, root, signal: this.abort.signal,
      sourceId: binding.binding.kind === "source" ? binding.binding.sourceId : null,
      styles: { add: (key, css) => this.style(key, css) },
      watchElements: (key, options, handlers) => this.watch(key, options, handlers),
      ui: { mountAt: (key, anchor, options) => this.mount(key, anchor, options),
        openModal: (key, render) => this.openModal(key, render) },
      navigation: { onChange: callback => {
        this.assertActive(); this.routes.add(callback);
        return this.track(() => this.routes.delete(callback));
      } },
      sources: { open: (sourceId, url) => this.call<void>("sources.open", { sourceId, ...(url ? { url } : {}) }) },
      pages: { open: pageId => this.call<void>("pages.open", { pageId }) },
      storage: storageApi(call, callback => {
        this.assertActive(); this.storageListeners.add(callback);
        return this.track(() => this.storageListeners.delete(callback));
      }),
      onDispose: callback => { this.assertActive(); this.track(callback); },
    };
    this.observer = new MutationObserver(records => {
      if (this.disposed) return;
      for (const record of records) {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        const sourceChange = !owned(record.target) && (record.type !== "childList" || nodes.some(node => !owned(node)));
        if (sourceChange) for (const watcher of this.watchers.values()) {
          if (record.type === "attributes" && !watcher.options.attributes.includes(record.attributeName ?? "")) continue;
          if (record.type === "characterData" && !watcher.options.text) continue;
          watcher.dirty = true;
          if (record.target instanceof Element) watcher.roots.add(record.target);
          for (const node of record.addedNodes) if (node instanceof Element && !owned(node)) watcher.roots.add(node);
        }
      }
      this.schedule();
    });
    this.observe();
    for (const name of ["popstate", "hashchange", "pageshow"]) {
      window.addEventListener(name, () => this.route(), { signal: this.abort.signal });
    }
    const poll = setInterval(() => { if (!document.hidden) this.route(); }, 250);
    this.track(() => clearInterval(poll));
  }
  private assertActive(): void { if (this.disposed) throw new Error("EXPIRED_CONTEXT: runtime disposed"); }
  private track(callback: Dispose): Dispose {
    const dispose = once(() => { this.disposers.delete(dispose); try { callback(); } catch (error) { this.fatal(error); } });
    this.disposers.add(dispose); return dispose;
  }
  private invoke(callback: () => void): void { try { callback(); } catch (error) { this.fatal(error); } }
  private observe(): void {
    const attributes = [...new Set([...this.watchers.values()].flatMap(w => w.options.attributes))];
    this.observer.disconnect();
    this.observer.observe(document, { childList: true, subtree: true,
      characterData: [...this.watchers.values()].some(w => w.options.text),
      ...(attributes.length ? { attributes: true, attributeFilter: attributes } : {}) });
  }
  private schedule(): void {
    if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(() => {
      this.frame = 0; const start = performance.now();
      this.route();
      for (const effect of [...this.effects.values()]) {
        if (this.disposed) break;
        if (effect.anchor && !effect.anchor.isConnected) { effect.dispose(); continue; }
        if (!effect.host.isConnected) {
          const now = performance.now();
          effect.removals = effect.removals.filter(time => now - time < 1000);
          effect.removals.push(now);
          if (effect.removals.length >= 3) { this.conflicts++; effect.dispose(); }
          else this.invoke(() => effect.restore());
        }
      }
      for (const watcher of [...this.watchers.values()]) if (!this.disposed && watcher.dirty) this.reconcile(watcher);
      this.batches.push(performance.now() - start); if (this.batches.length > 200) this.batches.shift();
    });
  }
  private watch(key: string, options: WatchOptions, handlers: ElementHandlers): Dispose {
    this.assertActive();
    if (this.watchers.has(key)) throw new Error(`Duplicate watcher: ${key}`);
    const limit = options.limit ?? 200;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("Watcher limit must be 1–200");
    document.createElement("div").matches(options.selector); // Reject invalid CSS before retaining resources.
    const watcher: Watcher = { key, options: { ...options, limit }, handlers,
      bindings: new Map(), roots: new Set(), full: true, dirty: true, dispose: () => {} };
    watcher.dispose = this.track(() => {
      this.watchers.delete(key);
      const bindings = [...watcher.bindings.values()]; watcher.bindings.clear(); watcher.roots.clear();
      for (const binding of bindings) this.invoke(() => handlers.leave?.(binding));
      if (!this.disposed) this.observe();
    });
    this.watchers.set(key, watcher); this.observe(); this.schedule(); return watcher.dispose;
  }
  private reconcile(watcher: Watcher): void {
    watcher.dirty = false;
    const { options, handlers } = watcher;
    const root = options.root ?? document.documentElement;
    const roots = watcher.full ? [root] : [...watcher.roots];
    watcher.full = false; watcher.roots.clear();
    const valid = (element: Element) => element.isConnected && root.isConnected && (root === element || root.contains(element))
      && !owned(element) && element.matches(options.selector);
    for (const [element, old] of [...watcher.bindings]) {
      let key: string | null = null;
      if (valid(element)) this.invoke(() => { key = options.contentKey(element); });
      if (!key || key !== old.contentKey) {
        if (valid(element)) roots.push(element);
        watcher.bindings.delete(element); this.invoke(() => handlers.leave?.(old));
      } else if (!this.disposed) {
        const current = { ...old, routeRevision: this.revision };
        watcher.bindings.set(element, current); this.invoke(() => handlers.update?.(current));
      }
      if (this.disposed || !this.watchers.has(watcher.key)) return;
    }
    for (const changed of roots) {
      if (!changed.isConnected || owned(changed)) continue;
      const candidates = [changed, ...changed.querySelectorAll(options.selector)];
      for (const element of candidates) {
        if (watcher.bindings.size >= (options.limit ?? 200)) return;
        if (!valid(element) || watcher.bindings.has(element)) continue;
        let key: string | null = null; this.invoke(() => { key = options.contentKey(element); });
        if (!key) { this.missingKeys++; continue; }
        if (this.disposed || !this.watchers.has(watcher.key)) return;
        const binding = { id: `element-${++this.serial}`, element, contentKey: key, routeRevision: this.revision };
        watcher.bindings.set(element, binding); this.invoke(() => handlers.enter(binding));
        if (this.disposed || !this.watchers.has(watcher.key)) return;
      }
    }
  }
  private effect(key: string, host: HTMLElement, restore: () => void, cleanup: Dispose, anchor?: Element): Dispose {
    this.assertActive();
    if (this.effects.has(key)) throw new Error(`Duplicate effect: ${key}`);
    const dispose = this.track(() => { this.effects.delete(key); try { cleanup(); } finally { host.remove(); } });
    this.effects.set(key, { host, anchor, restore, dispose, removals: [] });
    try { restore(); } catch (error) { dispose(); throw error; }
    return dispose;
  }
  private style(key: string, css: string): Dispose {
    const style = document.createElement("style"); style.dataset.genesisStyle = key; style.textContent = css;
    return this.effect(`style:${key}`, style, () => (document.head ?? document.documentElement).append(style), () => {});
  }
  private mount(key: string, anchor: Element, options: MountOptions): Dispose {
    this.assertActive();
    if (!anchor.isConnected) throw new Error("Cannot mount at a detached anchor");
    if (this.effects.has(`mount:${key}`)) throw new Error(`Duplicate mount: ${key}`);
    const host = document.createElement("span"); host.dataset.genesisOwned = key;
    const parent = options.shadow === false ? host : host.attachShadow({ mode: "open" });
    const style = document.createElement("style"); style.textContent = options.css ?? "";
    const container = document.createElement("span"); parent.append(style, container);
    let creator: void | Dispose;
    const dispose = this.effect(`mount:${key}`, host, () => {
      if (options.position === "before") anchor.before(host);
      else if (options.position === "after") anchor.after(host);
      else anchor.append(host);
    }, () => { creator?.(); }, anchor);
    try { creator = options.render(container); } catch (error) { dispose(); throw error; }
    return dispose;
  }
  private openModal(key: string, render: (container: HTMLElement) => void | Dispose): Dispose {
    this.assertActive(); this.modal?.();
    const previous = document.activeElement;
    const host = document.createElement("div"); host.dataset.genesisOwned = `modal:${key}`;
    host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0007;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box";
    const shadow = host.attachShadow({ mode: "open" });
    const dialog = document.createElement("section"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", key); dialog.tabIndex = -1;
    dialog.style.cssText = "background:white;color:#202020;max-height:85vh;overflow:auto;width:min(100%,520px);padding:20px;border-radius:12px;box-sizing:border-box;font:16px system-ui";
    shadow.append(dialog);
    let creator: void | Dispose;
    const dispose = this.effect("modal", host, () => document.body.append(host), () => {
      this.modal = undefined;
      void this.call("ui.modalState", { open: false }).catch(() => {});
      try { creator?.(); } finally { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); }
    });
    this.modal = dispose;
    host.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); dispose(); }
      if (event.key === "Tab") {
        const targets = [...dialog.querySelectorAll<HTMLElement>("button,input,select,textarea,a[href],[tabindex]")]
          .filter(e => e.tabIndex >= 0 && !e.hasAttribute("disabled") && e.getClientRects().length);
        const index = targets.indexOf(shadow.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? targets.length - 1 : index - 1) : (index + 1) % targets.length;
        event.preventDefault(); (targets[next] ?? dialog).focus();
      }
      event.stopPropagation();
    });
    host.addEventListener("click", event => event.stopPropagation());
    try { creator = render(dialog); dialog.focus(); }
    catch (error) { dispose(); throw error; }
    void this.call("ui.modalState", { open: true }).catch(error => this.fatal(error));
    return dispose;
  }
  route(): void {
    if (this.disposed || this.url === location.href) return;
    this.url = location.href; this.revision++; this.modal?.();
    for (const watcher of this.watchers.values()) { watcher.full = true; watcher.dirty = true; }
    for (const callback of [...this.routes]) this.invoke(() => callback(this.url));
    void this.call("route.changed", { url: this.url }).catch(error => this.fatal(error));
    this.schedule();
  }
  flushInitial(): void {
    this.assertActive();
    for (const watcher of [...this.watchers.values()]) if (!this.disposed && watcher.dirty) this.reconcile(watcher);
  }
  storageChanged(change: StorageChange): void {
    if (!this.disposed) for (const callback of [...this.storageListeners]) this.invoke(() => callback(change));
  }
  dismissModal(): void { this.modal?.(); }
  diagnostics() {
    return { watchers: this.watchers.size, bindings: [...this.watchers.values()].reduce((n, w) => n + w.bindings.size, 0),
      effects: this.effects.size, disposers: this.disposers.size, routes: this.routes.size,
      storageListeners: this.storageListeners.size, modal: !!this.modal, missingKeys: this.missingKeys, conflicts: this.conflicts,
      routeRevision: this.revision, batchesMs: this.batches.slice(-100) };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.abort.abort(); this.modal?.();
    if (this.frame) cancelAnimationFrame(this.frame); this.frame = 0;
    // Each registered callback runs once; exceptions cannot skip remaining cleanup.
    for (const dispose of [...this.disposers].reverse()) dispose();
    this.observer.disconnect(); this.watchers.clear(); this.effects.clear(); this.routes.clear(); this.storageListeners.clear();
  }
}
