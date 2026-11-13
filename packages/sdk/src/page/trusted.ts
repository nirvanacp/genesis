import type { InputEvent, Locator, Step } from "@genesis/core";
import { actionable } from "./actionable.js";
import { PageError } from "./errors.js";
import { refuseProtected, type InputContext, type Prepared } from "./input.js";
import { isTextField } from "./read.js";

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
      const editable = isTextField(element) || (element as HTMLElement).isContentEditable === true;
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
      // A key goes to whatever has focus, so a protected field is refused with or without a target,
      // including one focused inside a shadow root or a frame.
      refuseProtected(focusedFrom(element));
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
 * An element of a same-origin frame is measured in its frame's viewport, so each containing
 * frame's content-box offset is added to reach the top page's layout viewport.
 */
function point(element: Element): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  let left = rect.left + rect.width / 2;
  let top = rect.top + rect.height / 2;
  for (let frame = frameOf(element.ownerDocument); frame; frame = frameOf(frame.ownerDocument)) {
    const box = frame.getBoundingClientRect();
    const style = frame.ownerDocument.defaultView!.getComputedStyle(frame);
    left += box.left + frame.clientLeft + parseFloat(style.paddingLeft);
    top += box.top + frame.clientTop + parseFloat(style.paddingTop);
  }
  const viewport = window.visualViewport;
  const scale = viewport?.scale ?? 1;
  const x = (left - (viewport?.offsetLeft ?? 0)) * scale;
  const y = (top - (viewport?.offsetTop ?? 0)) * scale;
  return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
}

/** The iframe that holds a document; null for the top page's document. */
function frameOf(doc: Document): Element | null {
  return doc === document ? null : doc.defaultView?.frameElement ?? null;
}

/**
 * The element a key sent to `start` reaches: the deepest focused element through open shadow roots
 * and same-origin frames. A frame Genesis cannot read, such as another website's, could hold a
 * protected field, so it is refused.
 */
function focusedFrom(start: Element): Element {
  let element = start;
  for (;;) {
    const inShadow = element.shadowRoot?.activeElement;
    if (inShadow) {
      element = inShadow;
      continue;
    }
    if (element.tagName === "IFRAME" || element.tagName === "FRAME") {
      const inner = (element as HTMLIFrameElement).contentDocument;
      if (!inner) throw new PageError("PROTECTED_FIELD", "Genesis cannot check the focused field inside another website's frame, so it does not send the key");
      const focused = inner.activeElement ?? inner.body;
      if (!focused || focused === element) return element;
      element = focused;
      continue;
    }
    return element;
  }
}
