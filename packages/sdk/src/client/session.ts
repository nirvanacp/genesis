import {
  COMPAT,
  type Bound,
  type Compat,
  type ContextBound,
  type ContextNavigated,
  type DialogClosed,
  type DialogEvent,
  type Hello,
  type Limits,
  type Manifest,
  type Method,
  type PageEmitEvent,
} from "@genesis/core";
import { GenesisError } from "../bridge.js";
import type { Storage } from "../types.js";
import { createContext, type ContextHandle, type ContextControl } from "./context.js";
import { createPresentation, type Website } from "./presentation.js";
import { createServices, type Services } from "./services.js";
import { createNotifications, type Notifications } from "./notifications.js";
import { createSavedState, type SavedState } from "./state.js";
import { createStorage } from "./storage.js";
import { webViewTransport, type Transport } from "./transport.js";

/** Time the client waits past a request's own deadline before it gives up on the answer itself. */
const DEADLINE_GRACE_MS = 2000;

/** The client stopped waiting for an answer; the host may still have acted on the request. */
export class AnswerTimeout extends GenesisError {
  constructor(method: string) {
    super("DEADLINE", `${method} did not answer in time`);
  }
}

/** The protocol connection of one bound document: requests matched to responses, and events. */
export interface Session {
  readonly bound: Bound;
  readonly retired: boolean;
  /** `timeoutMs` is the host's own deadline for the request; the client waits a little longer. */
  request<T = unknown>(method: Method, params?: unknown, options?: { timeoutMs?: number }): Promise<T>;
  /** Subscribes to a host event. Returns the unsubscribe function. */
  on(name: string, handler: (data: any) => void): () => void;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: GenesisError): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Says hello and resolves once the document is bound, or rejects with the host's error when it
 * refuses. Each request settles on its response, on its deadline, or with `RETIRED` when the
 * host retires the document; after `retired` every later message is ignored.
 */
export function openSession(transport: Transport, url: string): Promise<Session> {
  return new Promise((resolveBound, rejectBound) => {
    let bound: Bound | null = null;
    let retired = false;
    let nextRequestId = 1;
    const pending = new Map<number, Pending>();
    const handlers = new Map<string, Set<(data: unknown) => void>>();

    const session: Session = {
      get bound() { return bound!; },
      get retired() { return retired; },
      request<T>(method: Method, params: unknown = {}, options: { timeoutMs?: number } = {}) {
        if (retired) return Promise.reject(new GenesisError("RETIRED", "This page was closed"));
        const requestId = nextRequestId++;
        const timeoutMs = (options.timeoutMs ?? bound!.limits.rpcDeadlineMs) + DEADLINE_GRACE_MS;
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new AnswerTimeout(method));
          }, timeoutMs);
          pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
          transport.send(JSON.stringify({ type: "request", documentId: bound!.documentId, requestId, method, params }));
        });
      },
      on(name, handler) {
        let set = handlers.get(name);
        if (!set) handlers.set(name, (set = new Set()));
        set.add(handler);
        return () => { set!.delete(handler); };
      },
    };

    function emit(name: string, data: unknown) {
      for (const handler of [...(handlers.get(name) ?? [])]) {
        try { handler(data); } catch (error) { console.error(`Genesis ${name} handler failed`, error); }
      }
    }

    function retire() {
      retired = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new GenesisError("RETIRED", "This page was closed"));
      }
      pending.clear();
      emit("retired", {});
      transport.close();
    }

    transport.onMessage(text => {
      if (retired) return;
      let message: any;
      try { message = JSON.parse(text); } catch { return; }
      if (message?.type === "refused" && !bound) {
        retired = true;
        transport.close();
        rejectBound(new GenesisError(message.error?.code ?? "PROTOCOL_MISMATCH", message.error?.message ?? "The host refused this page"));
        return;
      }
      if (message?.type === "bound") {
        if (bound) return;
        bound = message as Bound;
        resolveBound(session);
        return;
      }
      if (!bound || message?.documentId !== bound.documentId) return;
      if (message.type === "response") {
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new GenesisError(message.error.code, message.error.message, message.error.details));
        else entry.resolve(message.result ?? null);
      } else if (message.type === "event") {
        if (message.name === "retired") retire();
        else emit(message.name, message.data);
      }
    });
    const hello: Hello = { type: "hello", protocol: COMPAT.protocol, url };
    transport.send(JSON.stringify(hello));
  });
}

/** The connected client: the applet's contexts, the website's presentation, Back, saved state, storage, services and notifications. */
export interface Genesis {
  readonly appletId: string;
  readonly revision: number;
  readonly manifest: Manifest;
  readonly limits: Limits;
  readonly compat: Compat;
  readonly contextIds: readonly string[];
  /** A context by id; the first context by default. */
  context(id?: string): ContextHandle;
  readonly website: Website;
  /**
   * Handles Android Back. The latest handler runs first; the first that returns true consumes
   * Back. When none does, Genesis leaves the applet. Handlers must answer at once.
   */
  onBack(handler: () => boolean): () => void;
  /** Leaves the applet, after a Back that was consumed to ask the user first. */
  leave(): void;
  /** The state saved before Genesis recreated this UI, or undefined. */
  readonly saved: SavedState | undefined;
  /** Saves `router` and `app` state, each key replacing its earlier value. Debounced. */
  save(value: SavedState): void;
  readonly storage: Storage;
  readonly services: Services;
  readonly notifications: Notifications;
  /** Reports the first layout; the shell then shows the UI. */
  ready(): void;
  /** The applet came back to the foreground. */
  onResume(listener: () => void): () => void;
  /** The applet is going to the background; save anything pending now. */
  onSuspend(listener: () => void): () => void;
  onRetired(listener: () => void): () => void;
  readonly retired: boolean;
}

export interface ConnectOptions {
  /** The WebView bridge by default. */
  transport?: Transport;
  /** The document URL sent in `hello`; `location.href` by default. */
  url?: string;
}

/** Connects the UI document to Genesis. Rejects when the host refuses it or speaks another protocol. */
export async function connect(options: ConnectOptions = {}): Promise<Genesis> {
  const transport = options.transport ?? webViewTransport();
  const url = options.url ?? (globalThis as { location?: { href: string } }).location?.href ?? "";
  const session = await openSession(transport, url);
  const { compat } = session.bound;
  if (compat.protocol !== COMPAT.protocol || compat.sessionState !== COMPAT.sessionState) {
    throw new GenesisError("PROTOCOL_MISMATCH", "This applet was built for another Genesis version");
  }
  return createGenesis(session);
}

function createGenesis(session: Session): Genesis {
  const { manifest, appletId, revision, limits, compat } = session.bound;
  const contexts = new Map<string, ContextControl>();
  for (const context of manifest.contexts) contexts.set(context.id, createContext(context.id, context.startUrl, session));
  const of = (id: string) => contexts.get(id);

  session.on("context.bound", (data: ContextBound) => of(data.id)?.bound(data));
  session.on("context.navigated", (data: ContextNavigated) => of(data.id)?.navigated(data));
  session.on("context.started", (data: { id: string; url: string }) => of(data.id)?.started(data.url));
  session.on("context.gone", (data: { id: string; code?: string; message?: string }) => of(data.id)?.gone(data));
  session.on("page.emit", (data: PageEmitEvent) => of(data.context)?.emit(data));
  session.on("context.dialog", (data: DialogEvent) => of(data.id)?.dialog(data));
  session.on("context.dialogClosed", (data: DialogClosed) => of(data.id)?.dialogClosed(data));

  const listeners = { resume: new Set<() => void>(), suspend: new Set<() => void>(), retired: new Set<() => void>() };
  const call = (set: Set<() => void>) => { for (const listener of [...set]) listener(); };
  const subscribe = (set: Set<() => void>) => (listener: () => void) => {
    set.add(listener);
    return () => { set.delete(listener); };
  };

  const saved = createSavedState(session);
  const { website, onBack, leave } = createPresentation(session);
  session.on("resumed", () => {
    for (const context of contexts.values()) context.resumed();
    call(listeners.resume);
  });
  session.on("suspended", () => {
    saved.flush();
    call(listeners.suspend);
  });
  session.on("retired", () => {
    for (const context of contexts.values()) context.retired();
    call(listeners.retired);
  });

  let readySent = false;
  const first = manifest.contexts[0].id;
  return {
    appletId,
    revision,
    manifest,
    limits,
    compat,
    contextIds: manifest.contexts.map(context => context.id),
    context(id = first) {
      const context = contexts.get(id);
      if (!context) throw new GenesisError("NOT_FOUND", `No context ${id}`);
      return context.handle;
    },
    website,
    onBack,
    leave,
    get saved() { return saved.saved; },
    save: value => saved.save(value),
    storage: createStorage(session),
    services: createServices(session),
    notifications: createNotifications(session),
    ready() {
      if (readySent) return;
      readySent = true;
      session.request("ui.ready").catch(error => console.error("Genesis ui.ready failed", error));
    },
    onResume: subscribe(listeners.resume),
    onSuspend: subscribe(listeners.suspend),
    onRetired: subscribe(listeners.retired),
    get retired() { return session.retired; },
  };
}
