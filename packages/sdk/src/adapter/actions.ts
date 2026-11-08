import type { ActionRequest, ActionResult, ActionUpdate, ErrorCode, Limits, Step } from "@genesis/core";
import { GenesisError, type Connection } from "../bridge.js";
import type { Action, ActionSpec } from "./index.js";

const STEP_POLL_MS = 100;

/** An action resolved in the current view: its function and a way to find its element again. */
export type Target =
  | {
    action: Action;
    /** The element by key now: `null` for a page action, `undefined` when it is gone. */
    element(): Element | null | undefined;
  }
  | { error: { code: ErrorCode; message: string } };

export interface ActionContext {
  connection: Connection;
  limits: Limits;
  find(request: ActionRequest): Target;
  /** Publishes pending page changes now, so the records reach the foreground before the outcome. */
  flush(): void;
}

interface Handle {
  request: ActionRequest;
  arrived: number;
  cancelled: boolean;
  dispatched: boolean;
  /** The document is retiring or leaving; stop without reporting. */
  stopped: boolean;
}

/**
 * Runs action handles one at a time, in arrival order. A handle is validated (target found by
 * key, spec computed), its steps run, and it reports `dispatched` and then `observed`,
 * `failed` or `cancelled`. A navigating action reports `dispatched {navigating: true}` right
 * before the step that leaves the page and the foreground observes the outcome.
 */
export function createActions(context: ActionContext) {
  const handles = new Map<number, Handle>();
  let queue: Promise<void> = Promise.resolve();

  return {
    act(request: ActionRequest) {
      const handle: Handle = { request, arrived: Date.now(), cancelled: false, dispatched: false, stopped: false };
      handles.set(request.actionId, handle);
      queue = queue.then(() => run(context, handle)).catch(error => {
        console.error("Genesis action failed", error);
      }).finally(() => { handles.delete(request.actionId); });
    },
    /** Cancels an action that has not been dispatched; a dispatched one runs on. */
    cancel(actionId: number) {
      const handle = handles.get(actionId);
      if (handle && !handle.dispatched) handle.cancelled = true;
    },
    /** Stops every handle without reporting; the host reports undispatched ones itself. */
    retire() {
      for (const handle of handles.values()) handle.stopped = true;
    },
  };
}

async function run(context: ActionContext, handle: Handle) {
  const { connection, limits } = context;
  const { actionId } = handle.request;
  const report = (state: ActionUpdate["state"], result?: ActionResult, navigating?: boolean) => {
    if (handle.stopped) return Promise.resolve();
    const update: ActionUpdate = { actionId, state };
    if (navigating) update.navigating = true;
    if (result) update.result = result;
    return connection.request("context.actionResult", update).then(() => {}, () => {});
  };
  const fail = (code: ErrorCode, message: string, completedSteps?: number) => {
    const result: ActionResult = { outcome: "failed", code, message };
    if (completedSteps !== undefined) Object.assign(result, { completedSteps, partial: completedSteps > 0 });
    return report("failed", result);
  };
  const cancelled = () => report("cancelled", { outcome: "cancelled" });

  if (handle.stopped) return;
  if (handle.cancelled) return cancelled();

  // Validated: the target exists in this view and the spec function ran.
  const target = context.find(handle.request);
  if ("error" in target) return fail(target.error.code, target.error.message);
  const element = target.element();
  if (element === undefined) return fail("TARGET_NOT_FOUND", "The item is no longer on the page");
  let spec: ActionSpec;
  try {
    spec = target.action(element, handle.request.args);
  } catch (error) {
    return fail("INVALID_STEPS", messageOf(error));
  }
  if (typeof (spec as { then?: unknown } | null)?.then === "function") return fail("INVALID_STEPS", "An action must return its steps synchronously");
  if (spec && "satisfied" in spec && spec.satisfied === true) return report("observed", { outcome: "observed", noop: true });
  const problem = checkSpec(spec);
  if (problem) return fail("INVALID_STEPS", problem);
  const { steps, until: evidence, deadlineMs } = spec as Extract<ActionSpec, { steps: Step[] }>;
  const navigates = (spec as { navigates?: boolean }).navigates === true || leaves(steps.at(-1));
  const deadline = handle.arrived + (deadlineMs ?? limits.actionTimeoutMs);

  let completed = 0;
  const dispatch = (navigating: boolean) => {
    handle.dispatched = true;
    return report("dispatched", undefined, navigating);
  };
  // A click that unloads the page hands the action to the foreground.
  const off = connection.on("pagehide", () => {
    if (!handle.dispatched && !handle.stopped && completed > 0) void dispatch(true);
    handle.stopped = true;
  });
  const stop = () => handle.stopped || handle.cancelled;

  try {
    for (const [i, step] of steps.entries()) {
      if (handle.stopped) return;
      if (handle.cancelled) return cancelled();
      if (Date.now() >= deadline) return fail("DEADLINE", "The action did not finish in time", completed);
      if (i > 0 && isWait(steps[i - 1]) && target.element() === undefined) {
        return fail("TARGET_NOT_FOUND", "The item left the page during the action", completed);
      }
      if (navigates && i === steps.length - 1 && !isWait(step)) {
        // The step may replace this document, so the handoff goes out first, once the step can run.
        const leave = prepare(step);
        await dispatch(true);
        if (!handle.stopped) leave();
        return;
      }
      await perform(step, deadline, stop);
      completed++;
    }
    if (handle.stopped) return;
    if (handle.cancelled) return cancelled();
    await dispatch(navigates);
    if (navigates) return;

    // Observed in place: the evidence appeared, or there is none to wait for.
    if (evidence !== undefined) {
      const holds = typeof evidence === "string" ? () => document.querySelector(evidence) !== null : () => evidence(document) === true;
      try {
        await until(holds, deadline - Date.now(), "the action to take effect", () => handle.stopped);
      } catch {
        return report("failed", { outcome: "unknown", code: "DEADLINE", message: "The page did not show the action's effect in time", completedSteps: completed, partial: completed > 0 });
      }
    }
    if (handle.stopped) return;
    context.flush();
    await report("observed", { outcome: "observed" });
  } catch (error) {
    const code = error instanceof GenesisError ? error.code : "INVALID_ARGUMENT";
    return fail(code, messageOf(error), completed);
  } finally {
    off();
  }
}

/** Returns why a spec is invalid, or null. */
function checkSpec(spec: unknown): string | null {
  if (typeof spec !== "object" || spec === null) return "An action must return { satisfied: true } or { steps }";
  const { steps, until: evidence } = spec as { steps?: unknown; until?: unknown };
  if (!Array.isArray(steps)) return "An action must return { satisfied: true } or { steps }";
  for (const [i, step] of steps.entries()) {
    const problem = checkStep(step);
    if (problem) return `Step ${i}: ${problem}`;
    if (leaves(step) && i !== steps.length - 1) return "A navigate or submit step must be the last step";
  }
  if (evidence !== undefined && typeof evidence !== "string" && typeof evidence !== "function") return "until must be a selector or a function";
  return null;
}

function checkStep(step: unknown): string | null {
  if (typeof step !== "object" || step === null) return "must be an object";
  const s = step as { [key: string]: unknown };
  const text = (value: unknown) => typeof value === "string" && value !== "";
  if ("click" in s) return text(s.click) ? null : "click needs a selector";
  if ("fill" in s) return text(s.fill) && typeof s.value === "string" ? null : "fill needs a selector and a string value";
  if ("submit" in s) return text(s.submit) ? null : "submit needs a selector";
  if ("navigate" in s) return text(s.navigate) ? null : "navigate needs a URL";
  if ("waitFor" in s || "waitForUrl" in s) {
    return text(s.waitFor ?? s.waitForUrl) && typeof s.timeoutMs === "number" ? null : "a wait needs a selector or pattern and timeoutMs";
  }
  if ("scroll" in s) {
    const scroll = s.scroll as { target?: unknown; to?: unknown } | null;
    return scroll && text(scroll.target) && (scroll.to === "end" || typeof scroll.to === "number") ? null : "scroll needs a target and to";
  }
  return "unknown step";
}

const leaves = (step: Step | undefined) => step !== undefined && ("navigate" in step || "submit" in step);
const isWait = (step: Step) => "waitFor" in step || "waitForUrl" in step;
const messageOf = (error: unknown) => String((error as Error)?.message ?? error);

function element(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new GenesisError("NOT_FOUND", `Nothing matches ${selector}`);
  return found;
}

/** Runs one step, waiting for it when it is a wait. */
async function perform(step: Step, deadline: number, stop: () => boolean) {
  const remaining = () => Math.max(0, deadline - Date.now());
  if ("waitFor" in step) {
    await until(() => document.querySelector(step.waitFor) !== null, Math.min(step.timeoutMs, remaining()), step.waitFor, stop);
  } else if ("waitForUrl" in step) {
    const pattern = new RegExp(step.waitForUrl);
    await until(() => pattern.test(location.href), Math.min(step.timeoutMs, remaining()), step.waitForUrl, stop);
  } else {
    prepare(step)();
  }
}

/** Finds what a step that does not wait needs, throwing if it is missing, and returns the step's effect. */
function prepare(step: Step): () => void {
  if ("click" in step) {
    const target = element(step.click);
    return () => target.click();
  }
  if ("fill" in step) {
    const target = element(step.fill);
    return () => fill(target, step.value);
  }
  if ("submit" in step) {
    const target = element(step.submit);
    const form = target instanceof HTMLFormElement ? target : target.closest("form");
    if (!form) throw new GenesisError("NOT_FOUND", `${step.submit} is not in a form`);
    const submitter = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target : undefined;
    return () => form.requestSubmit(submitter);
  }
  if ("navigate" in step) {
    const url = step.navigate;
    return () => location.assign(url);
  }
  if ("scroll" in step) {
    const { target, to } = step.scroll;
    const scroller = target === "window" ? document.scrollingElement ?? document.documentElement : element(target);
    return () => { scroller.scrollTop = to === "end" ? scroller.scrollHeight : to; };
  }
  throw new GenesisError("INVALID_STEPS", "A wait step does not run on its own");
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

/**
 * Resolves once `condition` holds (a throw counts as not yet), or early once `stop` does;
 * rejects with `DEADLINE` after `timeoutMs`.
 */
function until(condition: () => boolean, timeoutMs: number, what: string, stop: () => boolean): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const holds = () => { try { return condition(); } catch { return false; } };
    const check = () => {
      if (stop() || holds()) resolve();
      else if (Date.now() >= deadline) reject(new GenesisError("DEADLINE", `Timed out waiting for ${what}`));
      else setTimeout(check, STEP_POLL_MS);
    };
    check();
  });
}
