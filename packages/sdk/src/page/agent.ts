import {
  COMPAT,
  validateGuards,
  validateLocator,
  validateReadSpec,
  type ActionResult,
  type InspectResult,
  type PageCallEvent,
  type PageInfo,
  type PageResultParams,
  type PageStep,
  type ReadSpec,
} from "@genesis/core";
import { connect, type BridgeObject, type Connection } from "../bridge.js";
import { waitUntil } from "./actionable.js";
import { errorBody, messageOf, PageError } from "./errors.js";
import { scroll, scrollPosition } from "./input.js";
import { locate, locateAll, type RecordLookup } from "./locate.js";
import type { CommandSteps, PageModule } from "./module.js";
import { checkedOf, collapse, compile, isVisible, readOnce, rectOf, textOf, type Compiled } from "./read.js";
import { holds, runSequence, validateEvidence, validateInput, validateSteps, type SequenceContext } from "./sequence.js";
import { trackView, type ViewTracker } from "./view.js";
import { createWatches } from "./watch.js";

const READS = new Set(["info", "read", "inspect", "watch.open", "watch.close", "watch.resync", "wait"]);
const INPUTS = new Set(["click", "longPress", "hover", "unhover", "focus", "blur", "fill", "type", "press", "select", "check", "scroll", "submit"]);
const WATCH_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

let running = false;

/**
 * Runs the page agent in this document. The generated page script calls it at document start,
 * before any website script: it captures the bridge and removes it from the page, starts the
 * view tracker, says hello, and once bound serves the client's calls. Does nothing in a frame,
 * outside a context, or when imported in Node.
 */
export function startAgent(module?: PageModule): void {
  if (typeof window === "undefined" || window.top !== window || running) return;
  running = true;
  const scope = window as unknown as { __genesisBridge?: BridgeObject };
  const bridge = scope.__genesisBridge;
  try { delete scope.__genesisBridge; } catch { scope.__genesisBridge = undefined; }
  if (!bridge) return;

  const view = trackView();
  let current: Session | null = null;
  view.onChange(() => current?.viewChanged());
  const bind = () => connect(bridge, location.href).then(
    connection => { current = serve(connection, module, view); },
    error => console.error("Genesis could not bind this page", error),
  );
  void bind();
  // A page restored from the back-forward cache was retired when it was hidden; bind it again.
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    current?.stop();
    current = null;
    void bind();
  });
}

interface Session {
  viewChanged(): void;
  stop(): void;
}

interface Call {
  event: PageCallEvent;
  arrived: number;
  cancelled: boolean;
  /** The document is retiring; stop without answering. */
  stopped: boolean;
}

function serve(connection: Connection, module: PageModule | undefined, view: ViewTracker): Session {
  const { limits, generation, compat } = connection.bound;
  view.bind(generation);
  const calls = new Map<string, Call>();
  let queue: Promise<void> = Promise.resolve();
  let stopped = false;

  const answer = (callId: string, result: Omit<PageResultParams, "callId">) => {
    if (!calls.delete(callId)) return;
    connection.request("page.result", { callId, ...result }).catch(() => {});
  };

  if (compat.adapterApi !== COMPAT.adapterApi) {
    const message = `This applet's page script uses adapter API ${COMPAT.adapterApi}; this Genesis uses ${compat.adapterApi}`;
    console.error(`Genesis: ${message}`);
    connection.on("call", (event: PageCallEvent) => {
      calls.set(event.callId, { event, arrived: Date.now(), cancelled: false, stopped: false });
      answer(event.callId, { ok: false, error: { code: "PROTOCOL_MISMATCH", message } });
    });
    return { viewChanged() {}, stop() {} };
  }

  const records: RecordLookup = (watch, key) => watches.record(watch, key);
  const compileSpec = (spec: ReadSpec): Compiled => compile(spec, { module, records, listMax: limits.patchRecordsMax * 5 });
  const watches = createWatches({
    limits,
    view: () => view.current(),
    compile: compileSpec,
    emit: params => connection.request("page.emit", params),
  });

  function sequenceContext(call: Call): SequenceContext {
    const { callId } = call.event;
    return {
      records,
      compile: compileSpec,
      stop: () => call.stopped || stopped,
      cancelled: () => call.cancelled,
      progress: (state, completedSteps) => connection.request("page.progress", { callId, state, completedSteps }).then(() => {}, () => {}),
      onPagehide: listener => connection.on("pagehide", listener),
      flush: () => watches.flush(),
      view: () => view.current().n,
      trusted: limits.trustedInput ? events => connection.request("page.input", { callId, events }).then(() => {}) : undefined,
    };
  }

  // ---- Operations -------------------------------------------------------------------------------

  async function read(call: Call): Promise<unknown> {
    const { op, args } = call.event;
    switch (op) {
      case "info": return info();
      case "read":
        validateReadSpec(args.spec, "spec");
        return readOnce(compileSpec(args.spec));
      case "inspect":
        validateLocator(args.target, "target");
        return inspect(args.target);
      case "watch.open": {
        const id = args.id;
        if (typeof id !== "string" || !WATCH_ID.test(id)) throw new PageError("INVALID_ARGUMENT", "id must be a watch name of letters, digits, _ . : or -");
        validateReadSpec(args.spec, "spec");
        if (args.when !== undefined) validateGuards(args.when, "when");
        watches.open(id, args.spec, args.when);
        return {};
      }
      case "watch.close":
        if (typeof args.id !== "string") throw new PageError("INVALID_ARGUMENT", "id must be a string");
        watches.close(args.id);
        return {};
      case "watch.resync":
        if (args.id !== undefined && typeof args.id !== "string") throw new PageError("INVALID_ARGUMENT", "id must be a string");
        watches.resync(args.id as string | undefined);
        return {};
      case "wait": {
        const condition = args.for as Parameters<typeof holds>[0];
        validateSteps([{ op: "wait", for: condition, timeoutMs: args.timeoutMs }], "wait");
        const timeoutMs = Math.min(args.timeoutMs as number, call.event.deadlineMs);
        const ok = await waitUntil(() => holds(condition, { records, compile: compileSpec }), timeoutMs, () => call.cancelled || call.stopped || stopped);
        if (!ok) throw new PageError("DEADLINE", "The page did not reach the awaited state in time");
        return {};
      }
    }
    throw new PageError("UNKNOWN_OPERATION", `Unknown operation ${op}`);
  }

  async function input(call: Call): Promise<unknown> {
    const { op, args } = call.event;
    const deadline = call.arrived + call.event.deadlineMs;
    if (op === "scroll") {
      validateInput(op, args);
      const element = args.target ? locate(args.target, records) : undefined;
      return scroll(element, args.to as Parameters<typeof scroll>[1]);
    }
    if (INPUTS.has(op)) {
      try {
        validateInput(op, args);
      } catch (error) {
        return failed(error);
      }
      const { until, ...rest } = args;
      return runSequence({ steps: [{ ...rest, op } as PageStep], until: until as never, deadline }, sequenceContext(call));
    }
    if (op === "run") {
      try {
        validateSteps(args.steps);
        if (args.until !== undefined) validateEvidence(args.until);
      } catch (error) {
        return failed(error);
      }
      const own = typeof args.deadlineMs === "number" ? call.arrived + args.deadlineMs : deadline;
      return runSequence({ steps: args.steps, until: args.until, navigates: args.navigates === true, deadline: Math.min(deadline, own) }, sequenceContext(call));
    }
    if (op === "invoke") return invoke(call, deadline);
    throw new PageError("UNKNOWN_OPERATION", `Unknown operation ${op}`);
  }

  /** Runs a command: its JSON value, `{ satisfied: true }` as a noop, or its steps as an `ActionResult`. */
  async function invoke(call: Call, deadline: number): Promise<unknown> {
    const { args } = call.event;
    const name = args.command;
    if (typeof name !== "string") throw new PageError("INVALID_ARGUMENT", "command must be a string");
    const command = module?.commands?.[name];
    if (!command) throw new PageError("NOT_FOUND", `The page module has no command ${name}`);
    let element: Element | null = null;
    if (args.target !== undefined) {
      validateLocator(args.target, "target");
      element = locate(args.target, records);
    }
    let value: unknown;
    try {
      value = command({ document, url: location.href, element, args: args.args }, args.args);
    } catch (error) {
      throw new PageError("INVALID_STEPS", messageOf(error));
    }
    if (typeof (value as { then?: unknown } | null)?.then === "function") throw new PageError("INVALID_STEPS", "A command must return synchronously");
    if (isObject(value) && value.satisfied === true) return { outcome: "observed", noop: true } satisfies ActionResult;
    if (!isObject(value) || !("steps" in value)) return value === undefined ? null : value;
    const spec = value as unknown as CommandSteps;
    try {
      validateSteps(spec.steps);
      if (spec.until !== undefined && typeof spec.until !== "function") validateEvidence(spec.until);
    } catch (error) {
      throw new PageError("INVALID_STEPS", `${name}: ${messageOf(error)}`);
    }
    const own = typeof spec.deadlineMs === "number" ? call.arrived + spec.deadlineMs : deadline;
    return runSequence({ steps: spec.steps, until: spec.until, navigates: spec.navigates === true, deadline: Math.min(deadline, own) }, sequenceContext(call));
  }

  function inspect(target: Parameters<typeof locateAll>[0]): InspectResult {
    let all: Element[];
    try {
      all = locateAll(target, records);
    } catch (error) {
      if (error instanceof PageError && (error.code === "NOT_FOUND" || error.code === "TARGET_NOT_FOUND") && !error.details) return { count: 0 };
      throw error;
    }
    const first = all[0];
    if (!first) return { count: 0 };
    const checked = checkedOf(first);
    return {
      count: all.length,
      first: {
        tag: first.localName,
        text: collapse(textOf(first)).slice(0, 200),
        visible: isVisible(first),
        enabled: (first as HTMLButtonElement).disabled !== true && first.getAttribute("aria-disabled") !== "true",
        ...(checked === null ? {} : { checked }),
        focused: document.activeElement === first,
        rect: rectOf(first),
      },
    };
  }

  function info(): PageInfo {
    const { x, y, maxX, maxY } = scrollPosition();
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      view: view.current(),
      scroll: { x, y, maxX, maxY },
      viewport: { width: innerWidth, height: innerHeight },
    };
  }

  // ---- Calls ------------------------------------------------------------------------------------

  function handle(event: PageCallEvent) {
    const call: Call = { event, arrived: Date.now(), cancelled: false, stopped: false };
    calls.set(event.callId, call);
    const settle = (run: () => Promise<unknown>) => run().then(
      value => { if (!call.stopped) answer(event.callId, { ok: true, value: value === undefined ? null : value }); },
      error => { if (!call.stopped) answer(event.callId, { ok: false, error: errorBody(error) }); },
    );
    if (typeof event.op !== "string" || !isObject(event.args)) {
      return answer(event.callId, { ok: false, error: { code: "INVALID_ARGUMENT", message: "A call needs op and args" } });
    }
    if (READS.has(event.op)) return void settle(() => read(call));
    if (INPUTS.has(event.op) || event.op === "run" || event.op === "invoke") {
      // Inputs run one at a time, in arrival order.
      queue = queue.then(() => {
        if (call.stopped) return;
        if (call.cancelled) return answer(event.callId, { ok: true, value: { outcome: "cancelled" } satisfies ActionResult });
        return settle(() => input(call));
      });
      return;
    }
    answer(event.callId, { ok: false, error: { code: "UNKNOWN_OPERATION", message: `Unknown operation ${event.op}` } });
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    watches.stop();
    for (const call of calls.values()) call.stopped = true;
  }

  connection.on("call", handle);
  connection.on("cancel", ({ callId }: { callId?: string } = {}) => {
    for (const call of calls.values()) if (callId === undefined || call.event.callId === callId) call.cancelled = true;
  });
  connection.on("reset", () => {
    watches.closeAll();
    for (const call of calls.values()) call.cancelled = true;
  });
  connection.on("ping", () => {}); // The host answers pings; receiving one needs nothing here.
  connection.on("retired", stop);
  // Watches end with the document; a running input still reports that it is navigating.
  connection.on("pagehide", () => watches.stop());

  return { viewChanged: () => watches.viewChanged(), stop };
}

/** An input's arguments were invalid: the `failed` outcome, since input promises never reject. */
function failed(error: unknown): ActionResult {
  const body = errorBody(error);
  return { outcome: "failed", code: body.code, message: body.message };
}

function isObject(value: unknown): value is { [key: string]: any } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
