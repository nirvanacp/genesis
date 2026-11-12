import type { InputEvent, Locator, Step } from "@genesis/core";
import { actionable } from "./actionable.js";
import { PageError } from "./errors.js";
import { refuseProtected, type InputContext, type Prepared } from "./input.js";

/**
 * Trusted input: the agent finds the target and its point, and the shell sends real Android input
 * to this hidden page (`page.input`). Events are trusted, CSS `:hover` applies, and a tap or key
 * gives the page user activation. The shell never sends it to a revealed context.
 */

/** Sends events through the host to the shell; resolves once the shell has dispatched them. */
export type SendInput = (events: InputEvent[]) => Promise<void>;

/** The operations that take `input: "trusted"`. */
export const TRUSTED_OPS = new Set(["click", "hover", "unhover", "type", "press"]);

/** Like `prepare`, for a step with `input: "trusted"`. Throws when the target is missing, not actionable or protected. */
export async function prepareTrusted(step: Step, context: InputContext, send: SendInput): Promise<Prepared> {
  const target = async (locator: Locator, options: { timeoutMs?: number; force?: boolean }) =>
    actionable(locator, context.records, options, context.stop);
  switch (step.op) {
    case "click": {
      const element = await target(step.target, step);
      return { element, run: () => send([{ type: "tap", ...point(element) }]) };
    }
    case "hover": {
      const element = await target(step.target, step);
      return { element, run: () => send([{ type: "hover", ...point(element) }]) };
    }
    case "unhover":
      return { run: () => send([{ type: "hoverExit" }]) };
    case "type": {
      const element = await target(step.target, step);
      refuseProtected(element);
      const editable = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable);
      if (!editable) throw new PageError("NOT_ACTIONABLE", "type needs an input, a textarea or an editable element", { reason: "not-editable" });
      return {
        element,
        run: async () => {
          (element as HTMLElement).focus({ preventScroll: true });
          await send([{ type: "text", text: step.text }]);
        },
      };
    }
    case "press": {
      const element = step.target ? await target(step.target, step) : (document.activeElement ?? document.body);
      // A key goes to whatever has focus, so a protected field is refused with or without a target.
      refuseProtected(element);
      return {
        element,
        run: async () => {
          if (step.target) (element as HTMLElement).focus({ preventScroll: true });
          await send([{ type: "key", key: step.key, modifiers: step.modifiers ?? [] }]);
        },
      };
    }
    default:
      throw new PageError("INVALID_ARGUMENT", `${step.op} does not take trusted input`);
  }
}

/**
 * The element's center in CSS pixels of the visual viewport at scale 1, the unit the shell
 * multiplies by the display density. Measured when the input runs, after the scroll into view.
 */
function point(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const viewport = window.visualViewport;
  const scale = viewport?.scale ?? 1;
  const x = (rect.left + rect.width / 2 - (viewport?.offsetLeft ?? 0)) * scale;
  const y = (rect.top + rect.height / 2 - (viewport?.offsetTop ?? 0)) * scale;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}
