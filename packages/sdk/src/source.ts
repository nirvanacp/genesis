import { matchRoute, urlKey, type AdaptedRoute, type ErrorCode } from "@genesis/core";
import { connect, GenesisError, type BridgeObject, type Connection } from "./bridge.js";
import type { Snapshot } from "./types.js";

/** One driver step. Selectors are CSS selectors; `waitForUrl` is a regular expression tested against `location.href`. */
export type Step =
  | { click: string }
  | { fill: string; value: string }
  | { submit: string }
  | { navigate: string }
  | { waitFor: string; timeoutMs: number }
  | { waitForUrl: string; timeoutMs: number };
export type Steps = Step[];

export interface RouteAdapter {
  /** A pure function of the page. Returns JSON data, or `null` while the page is not ready. */
  extract(doc: Document, params: Record<string, string>): unknown;
}

/** Turns an intent into driver steps. The intent's `name` selects the handler. */
export type IntentHandler = (intent: Record<string, any>, doc: Document) => Steps;

export interface SourceDefinition {
  id: string;
  routes: Record<string, RouteAdapter>;
  intents?: Record<string, IntentHandler>;
  /** Runs only on routes declared with `requiresSignIn`. */
  isSignedIn?(doc: Document): boolean;
}

/** A snapshot goes out once the page is quiet for `publishThrottleMs`, or this long after the
 * first unpublished change, however busy the page stays. */
const MAX_DELAY_MS = 1000;
const URL_CHECK_MS = 1000;
const STEP_POLL_MS = 100;
let defined = false;

/**
 * Registers the adapter for this source document. The call runs at document start, before
 * any website script: it captures the bridge and removes it from the page, says hello, and once
 * bound observes the page and answers intents.
 */
export function defineSource(definition: SourceDefinition): SourceDefinition {
  if (window.top !== window || defined) return definition;
  defined = true;
  const scope = window as unknown as { __genesisBridge?: BridgeObject };
  const bridge = scope.__genesisBridge;
  try { delete scope.__genesisBridge; } catch { scope.__genesisBridge = undefined; }
  if (!bridge) return definition;
  void connect(bridge, location.href).then(connection => {
    if (connection.bound.sourceId !== definition.id) {
      console.error(`Genesis adapter ${definition.id} loaded for source ${connection.bound.sourceId}`);
      return;
    }
    run(connection, definition);
  });
  return definition;
}

function run(connection: Connection, definition: SourceDefinition) {
  const { manifest, limits, documentId } = connection.bound;
  const encoder = new TextEncoder();
  let lastPublished = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let changedAt: number | undefined;
  let lastUrl = location.href;

  function snapshot(): Snapshot {
    const url = location.href;
    const match = matchRoute(manifest, url);
    const base = { documentId, url, routeId: match.routeId, params: match.params };
    if (match.kind !== "adapted" || match.source !== definition.id || !definition.routes[match.routeId]) {
      return { ...base, status: "unsupported" };
    }
    const route = manifest.routes.find(r => r.id === match.routeId) as AdaptedRoute;
    try {
      if (route.requiresSignIn && definition.isSignedIn && !definition.isSignedIn(document)) return { ...base, status: "auth" };
      const data = definition.routes[match.routeId].extract(document, match.params);
      if (data === null || data === undefined) return { ...base, status: "loading" };
      return { ...base, status: "ready", data };
    } catch (error) {
      return { ...base, status: "error", error: { code: "INVALID_ARGUMENT", message: String((error as Error)?.message ?? error) } };
    }
  }

  /** Publishes the page's snapshot when it changed, or always when `force` is set. */
  function publish(force = false) {
    if (connection.retired) return;
    let value = snapshot();
    let serialized = JSON.stringify({ snapshot: value });
    if (encoder.encode(serialized).length > limits.snapshotMaxBytes) {
      const { data: _data, ...rest } = value;
      value = { ...rest, status: "error", error: { code: "SNAPSHOT_TOO_LARGE", message: "The page data is too large to show" } };
      serialized = JSON.stringify({ snapshot: value });
    }
    if (!force && serialized === lastPublished) return;
    lastPublished = serialized;
    connection.request("source.publish", { snapshot: value }).catch(error => {
      if ((error as GenesisError).code !== "RETIRED") console.error("Genesis could not publish the page", error);
    });
  }

  function schedule() {
    const now = Date.now();
    changedAt ??= now;
    clearTimeout(timer);
    timer = setTimeout(() => {
      changedAt = undefined;
      publish();
    }, Math.min(limits.publishThrottleMs, Math.max(0, changedAt + MAX_DELAY_MS - now)));
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  const checkUrl = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    schedule();
  };
  const urlTimer = setInterval(checkUrl, URL_CHECK_MS);
  addEventListener("popstate", checkUrl);
  addEventListener("hashchange", checkUrl);
  connection.on("resumed", () => publish(true));
  connection.on("retired", () => {
    observer.disconnect();
    clearInterval(urlTimer);
    clearTimeout(timer);
  });

  // Intents run one at a time, in arrival order. Each targets the page shown when it arrived.
  let queue: Promise<unknown> = Promise.resolve();
  connection.on("intent", ({ intentId, intent }: { intentId: number; intent: Record<string, any> }) => {
    const target = { page: urlKey(location.href), deadline: Date.now() + limits.intentTimeoutMs };
    queue = queue.then(() => perform(connection, definition, intentId, intent, target, () => publish()));
  });

  schedule();
}

/**
 * Runs an intent's steps. Before each step the page must still be the one the intent targeted,
 * and the host's deadline must not have passed; a `waitForUrl` step moves the target to the page
 * it waited for. A displaced or expired intent stops and reports a failure.
 */
async function perform(
  connection: Connection,
  definition: SourceDefinition,
  intentId: number,
  intent: Record<string, any>,
  target: { page: string | null; deadline: number },
  publish: () => void,
) {
  const report = (ok: boolean, error?: { code: ErrorCode; message: string }) =>
    connection.request("source.intentResult", { intentId, ok, error: error ?? null }).catch(() => {});
  const check = () => {
    if (Date.now() >= target.deadline) throw new GenesisError("DEADLINE", "The action did not finish in time");
    if (urlKey(location.href) !== target.page) throw new GenesisError("SOURCE_REPLACED", "The page changed");
  };

  let steps: Steps;
  try {
    check();
    const handler = definition.intents?.[String(intent?.name)];
    if (!handler) return report(false, { code: "INVALID_ARGUMENT", message: `Unknown action ${intent?.name}` });
    steps = handler(intent, document);
    const navigating = Array.isArray(steps) ? steps.findIndex(step => "navigate" in step || "submit" in step) : -2;
    if (navigating === -2 || (navigating !== -1 && navigating !== steps.length - 1)) {
      return report(false, { code: "INVALID_STEPS", message: "A navigate or submit step must be the last step" });
    }
  } catch (error) {
    const code = error instanceof GenesisError ? error.code : "INVALID_STEPS";
    return report(false, { code, message: String((error as Error)?.message ?? error) });
  }

  try {
    for (const [index, step] of steps.entries()) {
      check();
      if (index === steps.length - 1 && ("navigate" in step || "submit" in step)) {
        // The step replaces this document, so the result goes out first.
        await report(true);
        execute(step);
        return;
      }
      await executeAndWait(step);
      if ("waitForUrl" in step) target.page = urlKey(location.href);
    }
    await report(true);
    publish();
  } catch (error) {
    const code = error instanceof GenesisError ? error.code : "INVALID_ARGUMENT";
    await report(false, { code, message: String((error as Error)?.message ?? error) });
  }
}

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new GenesisError("NOT_FOUND", `Nothing matches ${selector}`);
  return found;
}

/** Runs a step that does not wait. */
function execute(step: Step) {
  if ("click" in step) element(step.click).click();
  else if ("fill" in step) fill(element(step.fill), step.value);
  else if ("submit" in step) {
    const target = element(step.submit);
    const form = target instanceof HTMLFormElement ? target : target.closest("form");
    if (!form) throw new GenesisError("NOT_FOUND", `${step.submit} is not in a form`);
    form.requestSubmit(target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target : undefined);
  } else if ("navigate" in step) location.assign(step.navigate);
}

async function executeAndWait(step: Step) {
  if ("waitFor" in step) await until(() => document.querySelector(step.waitFor) !== null, step.timeoutMs, step.waitFor);
  else if ("waitForUrl" in step) {
    const pattern = new RegExp(step.waitForUrl);
    await until(() => pattern.test(location.href), step.timeoutMs, step.waitForUrl);
  } else execute(step);
}

/** Sets a field's value the way typing does, so frameworks that track input see it. */
function fill(target: HTMLElement, value: string) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    throw new GenesisError("INVALID_STEPS", "fill needs an input or textarea");
  }
  const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

function until(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) resolve();
      else if (Date.now() >= deadline) reject(new GenesisError("DEADLINE", `Timed out waiting for ${what}`));
      else setTimeout(check, STEP_POLL_MS);
    };
    check();
  });
}
