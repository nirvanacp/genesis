import {
  InvalidSpecError,
  matchesGuard,
  validateGuards,
  validateLocator,
  validateReadSpec,
  type ActionResult,
  type ErrorCode,
  type Evidence,
  type Step,
  type ReadSpec,
  type WaitFor,
} from "@genesis/core";
import { waitUntil } from "./actionable.js";
import { errorBody, PageError } from "./errors.js";
import { prepare, type InputContext } from "./input.js";
import { locate } from "./locate.js";
import { isVisible, readOnce, type Compiled } from "./read.js";
import { prepareTrusted, TRUSTED_OPS, type SendInput } from "./trusted.js";

export interface SequenceContext extends InputContext {
  compile(spec: ReadSpec): Compiled;
  /** Sends `page.progress`; the agent awaits it only for `navigating`. */
  progress(state: "dispatched" | "navigating", completedSteps: number): Promise<void>;
  /** Subscribes to the document's `pagehide`. */
  onPagehide(listener: () => void): () => void;
  /** Sends pending watch changes, so records reach the client before the result. */
  flush(): void;
  cancelled(): boolean;
  /** The current view's `n`. */
  view(): number;
  /** Sends trusted input for this call; absent when the shell cannot. */
  trusted?: SendInput;
}

/** Steps to run with the same rules as `run`. `until` may be a function of the document in a page module. */
export interface Sequence {
  steps: Step[];
  until?: Evidence | ((doc: Document) => boolean);
  navigates?: boolean;
  /** Absolute time in milliseconds. */
  deadline: number;
}

/**
 * Runs the steps in order inside the page, with no bridge round trip between them.
 *
 * - Before the first step with an effect it reports `dispatched` (or, in a navigating sequence,
 *   awaits `navigating`), and from then on a failure is `unknown`, never `failed`.
 * - A `pagehide` during an effect reports `navigating`, so the client judges the destination.
 * - Without a navigation, it waits for `until` until the deadline: `observed` or `unknown`.
 */
export async function runSequence(sequence: Sequence, context: SequenceContext): Promise<ActionResult> {
  const { steps, deadline } = sequence;
  const navigates = sequence.navigates === true || leaves(steps.at(-1));
  const send = context.trusted;
  if (!send && steps.some(isTrusted)) {
    return { outcome: "failed", code: "INPUT_UNAVAILABLE", message: "Trusted input is not available in this Genesis" };
  }
  const prepareStep = (step: Step) => isTrusted(step) && send ? prepareTrusted(step, inner, send) : prepare(step, inner);
  let completed = 0;
  let dispatched = false;
  let navigating = false;
  let effects = 0;
  const stop = () => context.stop() || (!dispatched && context.cancelled());
  const result = (outcome: ActionResult["outcome"], code?: ErrorCode, message?: string, reason?: string): ActionResult => {
    const value: ActionResult = { outcome };
    if (code) value.code = code;
    if (message) value.message = message;
    if (reason) value.reason = reason;
    if (completed || code) Object.assign(value, { completedSteps: completed, partial: completed > 0 && outcome !== "observed" });
    return value;
  };
  const failure = (error: unknown) => {
    const body = errorBody(error);
    // The shell refuses trusted input before dispatching any of it; if no earlier step had an effect, nothing did.
    const none = !dispatched || (body.code === "INPUT_UNAVAILABLE" && effects === 0);
    return result(none ? "failed" : "unknown", body.code, body.message, body.details?.reason);
  };
  const off = context.onPagehide(() => {
    if (dispatched && !navigating) {
      navigating = true;
      void context.progress("navigating", completed);
    }
  });
  const inner: InputContext = { records: context.records, stop };

  try {
    for (const step of steps) {
      if (!dispatched && context.cancelled()) return result("cancelled");
      if (Date.now() >= deadline) return result(dispatched ? "unknown" : "failed", "DEADLINE", "The steps did not finish in time");
      if (step.op === "wait") {
        const ok = await waitUntil(() => holds(step.for, context), Math.min(step.timeoutMs, deadline - Date.now()), stop);
        if (!dispatched && context.cancelled()) return result("cancelled");
        if (!ok) return result(dispatched ? "unknown" : "failed", "DEADLINE", "The page did not reach the awaited state in time");
        completed++;
        continue;
      }
      let prepared = await prepareStep(withDeadline(step, deadline));
      if (prepared.noop) {
        completed++;
        continue;
      }
      if (!dispatched && context.cancelled()) return result("cancelled");
      if (!dispatched) {
        dispatched = true;
        if (navigates) {
          navigating = true;
          await context.progress("navigating", completed);
          // The page may have rendered again during the handoff; find the step's element again.
          if (prepared.element && !prepared.element.isConnected) prepared = await prepareStep(withDeadline(step, deadline));
        } else {
          void context.progress("dispatched", completed);
        }
      }
      await prepared.run(deadline);
      effects++;
      completed++;
    }
  } catch (error) {
    return failure(error);
  } finally {
    off();
  }

  if (!dispatched && context.cancelled()) return result("cancelled");
  if (effects === 0) return { ...result("observed"), noop: true };
  const until = sequence.until;
  if (navigates) {
    // A cross-document navigation ends the document and the host answers the call. Here the
    // document lives on: a same-document navigation, or none yet. Evidence decides; without
    // it the client judges the destination.
    const view = context.view();
    if (until !== undefined) {
      const ok = await waitUntil(() => holds(until, context), deadline - Date.now(), context.stop);
      return ok ? result("observed") : result("unknown", "DEADLINE", "The page did not show the effect in time");
    }
    await waitUntil(() => context.view() !== view, deadline - Date.now(), context.stop);
    return result("unknown");
  }
  if (until !== undefined) {
    const ok = await waitUntil(() => holds(until, context), deadline - Date.now(), context.stop);
    if (!ok) return result("unknown", "DEADLINE", "The page did not show the effect in time");
  }
  context.flush();
  return result("observed");
}

/** A step's own `timeoutMs` never runs past the sequence's deadline. */
function withDeadline(step: Step, deadline: number): Step {
  if (!("timeoutMs" in step) || step.timeoutMs === undefined) return step;
  return { ...step, timeoutMs: Math.min(step.timeoutMs, Math.max(0, deadline - Date.now())) } as Step;
}

const leaves = (step: Step | undefined) => step?.op === "navigate" || step?.op === "submit";

const isTrusted = (step: Step) => (step as { input?: string }).input === "trusted";

/** True when a wait condition or evidence holds now. A read holds when its value is truthy; a list, when it has records. */
export function holds(condition: WaitFor | Evidence | ((doc: Document) => boolean), context: { records: InputContext["records"]; compile(spec: ReadSpec): Compiled }): boolean {
  if (typeof condition === "function") return condition(document) === true;
  if ("url" in condition) return matchesGuard(location.href, [condition.url]);
  if ("read" in condition) {
    const value = readOnce(context.compile(condition.read));
    if (value && typeof value === "object" && Array.isArray((value as { order?: unknown }).order)) return (value as { order: unknown[] }).order.length > 0;
    return Boolean(value);
  }
  let element: Element | null = null;
  try {
    element = locate(condition.target, context.records);
  } catch (error) {
    if (!(error instanceof PageError) || (error.code !== "NOT_FOUND" && error.code !== "TARGET_NOT_FOUND")) throw error;
  }
  switch (condition.state) {
    case "attached": return element !== null;
    case "detached": return element === null;
    case "visible": return element !== null && isVisible(element);
    case "hidden": return element === null || !isVisible(element);
  }
}

// ---- Validation --------------------------------------------------------------------------------

const INPUT_OPS = new Set(["click", "longPress", "hover", "unhover", "focus", "blur", "fill", "type", "press", "select", "check", "scroll", "submit"]);
const STATES = new Set(["attached", "visible", "hidden", "detached"]);

/** Checks a `run` step list; `navigate` and `submit` may only be last. Throws `InvalidSpecError`. */
export function validateSteps(value: unknown, path = "steps"): asserts value is Step[] {
  if (!Array.isArray(value) || value.length === 0) throw new InvalidSpecError(path, "must be a non-empty array of steps");
  value.forEach((step, i) => {
    validateStep(step, `${path}[${i}]`);
    if (leaves(step) && i !== value.length - 1) throw new InvalidSpecError(`${path}[${i}]`, `${step.op} may only be the last step`);
  });
}

/** Checks one input operation written as `{ op, ...args }`, or a wait or navigate step. */
export function validateStep(value: unknown, path: string): asserts value is Step {
  if (!isObject(value) || typeof value.op !== "string") throw new InvalidSpecError(path, "must be an object with op");
  const { op } = value;
  if (op === "navigate") {
    if (typeof value.url !== "string" || value.url === "") throw new InvalidSpecError(`${path}.url`, "must be a URL");
    return;
  }
  if (op === "wait") {
    validateWaitFor(value.for, `${path}.for`);
    if (typeof value.timeoutMs !== "number" || value.timeoutMs < 0) throw new InvalidSpecError(`${path}.timeoutMs`, "must be a number");
    return;
  }
  validateInput(op, value, path);
}

/** Checks the arguments of an input operation. */
export function validateInput(op: string, value: Record<string, unknown>, path = "args"): void {
  if (!INPUT_OPS.has(op)) throw new InvalidSpecError(`${path}.op`, `unknown operation ${op}`);
  const needsTarget = !["unhover", "press", "scroll"].includes(op);
  if (needsTarget || value.target !== undefined) validateLocator(value.target, `${path}.target`);
  const string = (key: string) => {
    if (typeof value[key] !== "string") throw new InvalidSpecError(`${path}.${key}`, "must be a string");
  };
  if (op === "fill") string("value");
  if (op === "type") string("text");
  if (op === "press") string("key");
  if (op === "check" && typeof value.checked !== "boolean") throw new InvalidSpecError(`${path}.checked`, "must be a boolean");
  if (op === "select" && value.values === undefined && value.labels === undefined) throw new InvalidSpecError(path, "select needs values or labels");
  if (op === "scroll" && value.to === undefined) throw new InvalidSpecError(`${path}.to`, "is required");
  if (op === "scroll" && value.to === "intoView" && value.target === undefined) throw new InvalidSpecError(`${path}.target`, "is required to scroll into view");
  if (value.timeoutMs !== undefined && (typeof value.timeoutMs !== "number" || value.timeoutMs < 0)) throw new InvalidSpecError(`${path}.timeoutMs`, "must be a number");
  if (value.input !== undefined && value.input !== "synthetic" && value.input !== "trusted") throw new InvalidSpecError(`${path}.input`, "must be synthetic or trusted");
  if (value.input === "trusted") {
    if (!TRUSTED_OPS.has(op)) throw new InvalidSpecError(`${path}.input`, `${op} does not take trusted input`);
    if (op === "click" && ((value.gesture !== undefined && value.gesture !== "tap") || (value.count !== undefined && value.count !== 1))) {
      throw new InvalidSpecError(`${path}.input`, "a trusted click is one touch tap");
    }
  }
  if (value.until !== undefined) validateEvidence(value.until, `${path}.until`);
}

export function validateEvidence(value: unknown, path = "until"): asserts value is Evidence {
  if (!isObject(value)) throw new InvalidSpecError(path, "must be { target, state } or { read }");
  if ("read" in value) return validateReadSpec(value.read, `${path}.read`);
  validateLocator(value.target, `${path}.target`);
  if (!STATES.has(value.state as string)) throw new InvalidSpecError(`${path}.state`, "must be attached, visible, hidden or detached");
}

function validateWaitFor(value: unknown, path: string): asserts value is WaitFor {
  if (isObject(value) && "url" in value) return validateGuards([value.url], `${path}.url`);
  validateEvidence(value, path);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
