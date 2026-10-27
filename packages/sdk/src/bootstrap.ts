import type { BootstrapConfig, ExecutionContext, QualificationEntry, RuntimeScope } from "./protocol";
import qualificationCss from "./qualification.css";

interface Runtime {
  initSync(options: { module: Uint8Array }): unknown;
  implementation_stage(): string;
  PageScope: new (css: string) => RuntimeScope;
}
interface Bridge { postMessage(message: string): void; onmessage: ((event: MessageEvent<string>) => void) | null }

export function bootstrap(config: BootstrapConfig, base64: string, runtime: Runtime, entry: QualificationEntry): void {
  if (window !== window.top) return;
  const realm = globalThis as typeof globalThis & {
    genesisHost?: Bridge;
    __genesisChallenge?: (nonce: string, challenge: string) => void;
  };
  const bridge = realm.genesisHost;
  if (!bridge) return;
  let nonce = "";
  let documentId: string | null = null;
  let counter = 0;
  let scope: RuntimeScope | undefined;
  let abort: AbortController | undefined;
  let disposeCreator: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activating = false;
  let failed = false;
  const phases = { wasm: false, creator: false, style: false, mount: false };
  const post = (value: unknown) => bridge.postMessage(JSON.stringify(value));
  const rpc = (method: string, params: unknown) => {
    if (documentId) post({ v: 1, documentId, requestId: `qualification-${++counter}`, method, params });
  };
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    abort?.abort();
    try { disposeCreator?.(); } catch { /* Continue cleanup of runtime-owned effects. */ }
    disposeCreator = undefined;
    scope?.dispose();
    scope?.free();
    scope = undefined;
  };
  const fail = (error: unknown) => {
    if (failed) return;
    failed = true;
    rpc("runtime.error", { message: String(error).slice(0, 1024), phases });
    cleanup();
  };
  realm.__genesisChallenge = (expectedNonce, challenge) => {
    if (nonce === expectedNonce && !failed) post({ type: "challengeAck", v: 1, nonce, challenge });
  };
  const activate = async (binding: ExecutionContext) => {
    if (activating) return;
    activating = true;
    const acceptedDocument = documentId;
    const activation = new AbortController();
    abort = activation;
    try {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      runtime.initSync({ module: bytes });
      if (runtime.implementation_stage() !== "MVP-02") throw new Error("Unexpected Wasm runtime version");
      phases.wasm = true;
      rpc("runtime.phase", { phase: "wasm" });
      if (!document.body) await new Promise<void>(resolve => {
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true, signal: activation.signal });
      });
      if (activation.signal.aborted || documentId !== acceptedDocument) return;
      scope = new runtime.PageScope(qualificationCss);
      phases.style = true;
      phases.mount = scope.root().isConnected;
      const disposer = entry.activate({ binding, signal: activation.signal, root: scope.root() });
      disposeCreator = typeof disposer === "function" ? disposer : undefined;
      phases.creator = true;
      if (!phases.mount) throw new Error("Owned UI mount is detached");
      rpc("runtime.ready", { phases, runtime: runtime.implementation_stage() });
      if (timer) clearTimeout(timer);
    } catch (error) { fail(error); }
  };
  bridge.onmessage = event => {
    try {
      const message = JSON.parse(event.data) as Record<string, unknown>;
      if (message.type === "bound" && message.nonce === nonce && typeof message.documentId === "string") {
        documentId = message.documentId;
        void activate(message.context as ExecutionContext);
      } else if (message.documentId === documentId && documentId) {
        if (message.type === "context.retired") { cleanup(); documentId = null; }
        if (message.type === "host.suspended") abort?.abort();
        if (message.type === "host.resumed" && abort?.signal.aborted) hello();
        if (message.type === "debug.inspect") rpc("debug.inspection", { phases, targets: entry.inspect?.() ?? null });
        if (message.type === "debug.fail") fail(new Error("Deliberate debug creator failure"));
      }
    } catch (error) { fail(error); }
  };
  const hello = () => {
    cleanup(); documentId = null;
    nonce = crypto.randomUUID();
    activating = false; failed = false;
    Object.assign(phases, { wasm: false, creator: false, style: false, mount: false });
    timer = setTimeout(() => fail(new Error("Startup exceeded five seconds")), 5000);
    post({ type: "hello", v: 1, nonce, revision: config.revision });
  };
  window.addEventListener("pagehide", () => { cleanup(); documentId = null; });
  window.addEventListener("pageshow", event => { if (event.persisted) hello(); });
  hello();
}
