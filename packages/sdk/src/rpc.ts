import type { HostCall } from "./runtime";
export class GenesisError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) { super(message); }
}
interface Pending { resolve(value: unknown): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }
export class RpcClient {
  private readonly pending = new Map<string, Pending>();
  private serial = 0;
  private closed = false;
  constructor(private readonly documentId: string, private readonly send: (message: string) => void) {}
  readonly call: HostCall = <T>(method: string, params: unknown): Promise<T> => {
    if (this.closed) return Promise.reject(new GenesisError("EXPIRED_CONTEXT", "Document retired"));
    if (!Number.isSafeInteger(this.serial + 1)) return Promise.reject(new GenesisError("INTERNAL", "Request counter exhausted"));
    if (this.pending.size >= 32) return Promise.reject(new GenesisError("BUSY", "Too many pending requests", true));
    const requestId = `request-${++this.serial}`;
    const encoded = JSON.stringify({ v: 1, documentId: this.documentId, requestId, method, params });
    if (new TextEncoder().encode(encoded).length > 262144) return Promise.reject(new GenesisError("QUOTA_EXCEEDED", "Request exceeds 256 KiB"));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId);
        reject(new GenesisError("INTERNAL", "Request timed out. Reread before retrying a write.", true)); }, 5000);
      this.pending.set(requestId, { resolve: value => resolve(value as T), reject, timer });
      try { this.send(encoded); } catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  };
  receive(message: Record<string, unknown>): void {
    if (message.v !== 1 || message.documentId !== this.documentId || typeof message.requestId !== "string") return;
    const pending = this.pending.get(message.requestId); if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.requestId);
    if (message.ok === true) pending.resolve(message.result);
    else {
      const error = message.error as { code?: string; message?: string; retryable?: boolean } | undefined;
      pending.reject(new GenesisError(error?.code ?? "INTERNAL", error?.message ?? "Malformed error reply", !!error?.retryable));
    }
  }
  dispose(): void {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer); pending.reject(new GenesisError("EXPIRED_CONTEXT", "Document retired"));
    }
    this.pending.clear();
  }
}
