import { GenesisError, type BridgeObject } from "../bridge.js";

/**
 * How the client exchanges protocol messages with the host: JSON text both ways. The WebView
 * bridge is one transport; a UI hosted another way passes its own to `connect`.
 */
export interface Transport {
  send(text: string): void;
  onMessage(listener: (text: string) => void): () => void;
  close(): void;
}

/** The transport of a UI document in a Genesis WebView: the bridge the shell installs as `window.__genesisBridge`. */
export function webViewTransport(bridge?: BridgeObject): Transport {
  const target = bridge ?? (globalThis as { __genesisBridge?: BridgeObject }).__genesisBridge;
  if (!target) throw new GenesisError("NOT_READY", "The Genesis bridge is missing; the UI must run inside Genesis");
  const listeners = new Set<(text: string) => void>();
  let closed = false;
  target.addEventListener("message", event => {
    if (closed || typeof event.data !== "string") return;
    for (const listener of [...listeners]) listener(event.data);
  });
  return {
    send(text) {
      if (!closed) target.postMessage(text);
    },
    onMessage(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
