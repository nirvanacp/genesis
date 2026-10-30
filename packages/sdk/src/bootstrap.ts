import type { BootstrapConfig, ExecutionContext, RuntimeScope } from "./protocol";
import { PageScope } from "./scope";
import { ManagedRuntime } from "./runtime";
import { RpcClient } from "./rpc";
import type { StorageChange } from "./storage";
import { initialLayout, type AppletEntry } from "./index";
import qualificationCss from "./qualification.css";

interface Bridge { postMessage(message: string): void; onmessage: ((event: MessageEvent<string>) => void) | null }

export function bootstrap(config: BootstrapConfig, entry: AppletEntry): void {
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
  let runtime: ManagedRuntime | undefined;
  let client: RpcClient | undefined;
  let abort: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activating = false;
  let failed = false;
  const phases = { runtime: false, creator: false, style: false, mount: false };
  const post = (value: unknown) => bridge.postMessage(JSON.stringify(value));
  const rpc = (method: string, params: unknown) => {
    if (documentId) post({ v: 1, documentId, requestId: `qualification-${++counter}`, method, params });
  };
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    abort?.abort();
    runtime?.dispose(); runtime = undefined;
    client?.dispose(); client = undefined;
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
      phases.runtime = true;
      rpc("runtime.phase", { phase: "typescript" });
      if (!document.body) await new Promise<void>(resolve => {
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true, signal: activation.signal });
      });
      if (activation.signal.aborted || documentId !== acceptedDocument) return;
      scope = new PageScope(qualificationCss, binding.binding.kind === "page");
      phases.style = true;
      phases.mount = scope.root().isConnected;
      client = new RpcClient(acceptedDocument!, message => bridge.postMessage(message));
      runtime = new ManagedRuntime(binding, scope.root(), client.call, fail);
      const disposer = await entry.activate(runtime.context);
      if (activation.signal.aborted || failed || documentId !== acceptedDocument) { if (typeof disposer === "function") disposer(); return; }
      if (typeof disposer === "function") runtime.context.onDispose(disposer);
      runtime.flushInitial();
      if (activation.signal.aborted || failed) return;
      await initialLayout();
      if (activation.signal.aborted || failed || documentId !== acceptedDocument) return;
      phases.mount = scope.root().isConnected;
      phases.creator = true;
      if (!phases.mount) throw new Error("Owned UI mount is detached");
      rpc("runtime.ready", { phases, runtime: "typescript" });
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
        client?.receive(message);
        if (message.type === "storage.changed") runtime?.storageChanged(message as unknown as StorageChange);
        if (message.type === "route.changed") runtime?.route();
        if (message.type === "host.focused") runtime?.focused();
        if (message.type === "navigation.back" && typeof message.token === "number") void runtime?.handleBack(message.token);
        if (message.type === "ui.dismissModal") runtime?.dismissModal();
        if (message.type === "host.suspended") cleanup();
        if (message.type === "host.resumed" && abort?.signal.aborted) hello();
        if (message.type === "debug.inspect") rpc("debug.inspection", { phases, managed: runtime?.diagnostics(), targets: entry.inspect?.() ?? null });
        if (message.type === "debug.fail") fail(new Error("Deliberate debug creator failure"));
      }
    } catch (error) { fail(error); }
  };
  const hello = () => {
    cleanup(); documentId = null;
    nonce = crypto.randomUUID();
    activating = false; failed = false;
    Object.assign(phases, { runtime: false, creator: false, style: false, mount: false });
    timer = setTimeout(() => fail(new Error("Startup exceeded five seconds")), 5000);
    post({ type: "hello", v: 1, nonce, revision: config.revision });
  };
  window.addEventListener("pagehide", () => { cleanup(); documentId = null; });
  window.addEventListener("pageshow", event => { if (event.persisted) hello(); });
  hello();
}
