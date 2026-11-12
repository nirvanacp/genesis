import type { Locator } from "@genesis/core";
import { PageError } from "./errors.js";
import { locate, type RecordLookup } from "./locate.js";
import { isVisible } from "./read.js";

/**
 * Polling interval of the agent's waits. Timers, unlike animation frames, also run in a hidden
 * WebView, and context pages are often hidden.
 */
export const POLL_MS = 50;

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Why an element cannot take input now, or null when it can. */
export function blocker(element: Element): "detached" | "hidden" | "disabled" | "covered" | null {
  if (!element.isConnected) return "detached";
  if (!isVisible(element)) return "hidden";
  if ((element as HTMLButtonElement).disabled === true || element.closest("fieldset:disabled") && element.matches("input, select, textarea, button")) return "disabled";
  if (element.getAttribute("aria-disabled") === "true") return "disabled";
  element.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const root = element.getRootNode() as Document | ShadowRoot;
  const hit = root.elementFromPoint?.(x, y) ?? null;
  // Outside the viewport (an element larger than it, say) elementFromPoint says nothing; do not call that covered.
  if (hit === null) return null;
  if (hit === element || element.contains(hit)) return null;
  if (hit.localName === "label" && (hit as HTMLLabelElement).control === element) return null;
  return "covered";
}

/**
 * Finds the target and waits up to `timeoutMs` for it to exist and take input. With `force`, only
 * existence is waited for. Fails with the locate error, or `NOT_ACTIONABLE` and the reason.
 */
export async function actionable(locator: Locator, records: RecordLookup, options: { timeoutMs?: number; force?: boolean }, stop: () => boolean): Promise<Element> {
  const deadline = Date.now() + Math.max(0, options.timeoutMs ?? 0);
  for (;;) {
    let failure: PageError;
    try {
      const element = locate(locator, records);
      const reason = options.force ? null : blocker(element);
      if (reason === null) return element;
      failure = new PageError("NOT_ACTIONABLE", `The target is ${reason}`, { reason });
    } catch (error) {
      if (!(error instanceof PageError) || error.code === "AMBIGUOUS_TARGET" || error.details?.reason) throw error;
      failure = error;
    }
    if (stop() || Date.now() + POLL_MS > deadline) throw failure;
    await sleep(POLL_MS);
  }
}

/** Resolves once `condition` holds (a throw counts as not yet) or `stop` does; false after `timeoutMs`. */
export async function waitUntil(condition: () => boolean, timeoutMs: number, stop: () => boolean): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  for (;;) {
    let holds = false;
    try { holds = condition(); } catch { holds = false; }
    if (holds) return true;
    if (stop() || Date.now() >= deadline) return false;
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
  }
}
