import { COMPAT, type Bound, type ErrorCode, type Hello, type Method } from "@genesis/core";

export type { Bound, Limits } from "@genesis/core";

/** The object `addWebMessageListener` installs as `window.__genesisBridge`. */
export interface BridgeObject {
  postMessage(message: string): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** An error the host or the SDK reports, with one of the shared error codes. */
export class GenesisError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "GenesisError";
    this.code = code;
  }
}

export interface Connection {
  readonly bound: Bound;
  readonly retired: boolean;
  request<T = unknown>(method: Method, params?: unknown): Promise<T>;
  /**
   * Subscribes to a host event. The connection also emits `pagehide` itself, right before the
   * document retires, while requests can still be sent. Returns the unsubscribe function.
   */
  on(name: string, handler: (data: any) => void): () => void;
}

/** Time the SDK waits past the host deadline before it gives up on a response itself. */
const DEADLINE_GRACE_MS = 2000;

interface Pending {
  resolve(value: unknown): void;
  reject(error: GenesisError): void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Says hello to the host and resolves once the document is bound, or rejects with
 * `PROTOCOL_MISMATCH` when the host refuses the hello. The connection owns the
 * pending-request table: each request settles on its response, on the deadline, or with
 * `RETIRED` when the host retires the document. After `retired` every later event is ignored.
 */
export function connect(bridge: BridgeObject, url: string): Promise<Connection> {
  return new Promise((resolveBound, rejectBound) => {
    let bound: Bound | null = null;
    let retired = false;
    let nextRequestId = 1;
    const pending = new Map<number, Pending>();
    const handlers = new Map<string, Set<(data: unknown) => void>>();

    const connection: Connection = {
      get bound() { return bound!; },
      get retired() { return retired; },
      request<T>(method: Method, params: unknown = {}) {
        if (retired) return Promise.reject(new GenesisError("RETIRED", "This page was closed"));
        const requestId = nextRequestId++;
        return new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new GenesisError("DEADLINE", `${method} did not answer in time`));
          }, bound!.limits.rpcDeadlineMs + DEADLINE_GRACE_MS);
          pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
          bridge.postMessage(JSON.stringify({ type: "request", documentId: bound!.documentId, requestId, method, params }));
        });
      },
      on(name, handler) {
        let set = handlers.get(name);
        if (!set) handlers.set(name, (set = new Set()));
        set.add(handler);
        return () => { set!.delete(handler); };
      },
    };

    function retire() {
      retired = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new GenesisError("RETIRED", "This page was closed"));
      }
      pending.clear();
    }

    function emit(name: string, data: unknown) {
      for (const handler of [...(handlers.get(name) ?? [])]) {
        try { handler(data); } catch (error) { console.error(`Genesis ${name} handler failed`, error); }
      }
    }

    bridge.addEventListener("message", event => {
      if (retired || typeof event.data !== "string") return;
      let message: any;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === "refused" && !bound) {
        retired = true;
        rejectBound(new GenesisError(message.error?.code ?? "PROTOCOL_MISMATCH", message.error?.message ?? "The host refused this page"));
        return;
      }
      if (message?.type === "bound") {
        if (bound) return;
        bound = message as Bound;
        resolveBound(connection);
        return;
      }
      if (!bound || message?.documentId !== bound.documentId) return;
      if (message.type === "response") {
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new GenesisError(message.error.code, message.error.message));
        else entry.resolve(message.result ?? null);
      } else if (message.type === "event") {
        if (message.name === "retired") {
          retire();
          emit("retired", {});
        } else {
          emit(message.name, message.data);
        }
      }
    });
    addEventListener("pagehide", () => {
      if (retired) return;
      emit("pagehide", {});
      retire();
    });
    const hello: Hello = { type: "hello", protocol: COMPAT.protocol, url };
    bridge.postMessage(JSON.stringify(hello));
  });
}
