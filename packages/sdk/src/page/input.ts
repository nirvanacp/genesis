import type { Locator, PageStep, ScrollPosition, ScrollTo } from "@genesis/core";
import { fill, submitEffect } from "../adapter/actions.js";
import { actionable, sleep, waitUntil } from "./actionable.js";
import { PageError } from "./errors.js";
import { locate, type RecordLookup } from "./locate.js";
import { checkedOf, isProtected } from "./read.js";

/**
 * Synthetic input: the agent dispatches DOM events itself. Events have `isTrusted: false`, CSS
 * `:hover` does not apply, and the page gets no user activation.
 */

export interface InputContext {
  records: RecordLookup;
  /** The call was cancelled, or the agent is stopping. */
  stop(): boolean;
}

/** A step whose target is found and ready: its effect has not run yet. */
export interface Prepared {
  /** The element the effect acts on, when it has one. */
  element?: Element;
  /** The wanted state already holds; the step has no effect. */
  noop?: boolean;
  /** Runs the effect. `deadline` is absolute; a step that verifies itself waits for it until then. */
  run(deadline: number): Promise<unknown>;
}

/** The element the agent last hovered; the next hover or `unhover` leaves it. */
let hovered: Element | null = null;

/** Finds what a step needs, waiting up to its `timeoutMs`, and returns its effect. Throws when the target is missing, not actionable or protected. */
export async function prepare(step: PageStep, context: InputContext): Promise<Prepared> {
  const target = async (locator: Locator, options: { timeoutMs?: number; force?: boolean } = {}) =>
    actionable(locator, context.records, options, context.stop);
  switch (step.op) {
    case "click": {
      const element = await target(step.target, step);
      const gesture = step.gesture ?? "click";
      return {
        element,
        run: async () => {
          if (gesture === "tap") tap(element);
          else if (gesture === "mouse") mouseClick(element, step.count ?? 1);
          else { (element as HTMLElement).click(); if (step.count === 2) { (element as HTMLElement).click(); fire(element, "dblclick", { detail: 2 }); } }
        },
      };
    }
    case "longPress": {
      const element = await target(step.target, step);
      return {
        element,
        run: async () => {
          const at = center(element);
          pointer(element, "pointerdown", at, 1);
          await sleep(step.ms ?? 600);
          if (!element.isConnected) return;
          mouse(element, "contextmenu", at, 2, 0);
          pointer(element, "pointerup", at, 0);
        },
      };
    }
    case "hover": {
      const element = await target(step.target, step);
      return { element, run: async () => hover(element) };
    }
    case "unhover":
      return { run: async () => unhover() };
    case "focus": {
      const element = await target(step.target, step);
      return { element, run: async () => (element as HTMLElement).focus({ preventScroll: true }) };
    }
    case "blur": {
      const element = await target(step.target, { ...step, force: true });
      return { element, run: async () => (element as HTMLElement).blur() };
    }
    case "fill": {
      const element = await target(step.target, step);
      refuseProtected(element);
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new PageError("NOT_ACTIONABLE", "fill needs an input or textarea", { reason: "not-a-text-field" });
      }
      return { element, run: async () => fill(element, step.value) };
    }
    case "type": {
      const element = await target(step.target, step);
      refuseProtected(element);
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        return { element, run: async () => { element.focus({ preventScroll: true }); for (const char of step.text) typeChar(element, char); } };
      }
      if (element instanceof HTMLElement && element.isContentEditable) return { element, run: async () => typeEditable(element, step.text) };
      throw new PageError("NOT_ACTIONABLE", "type needs an input, a textarea or an editable element", { reason: "not-editable" });
    }
    case "press": {
      const element = step.target ? await target(step.target, step) : (document.activeElement ?? document.body);
      if (step.target) refuseProtected(element);
      return { element, run: async () => press(element, step.key, step.modifiers ?? []) };
    }
    case "select": {
      const element = await target(step.target, step);
      if (!(element instanceof HTMLSelectElement)) throw new PageError("NOT_ACTIONABLE", "select needs a select element", { reason: "not-a-select" });
      const options = matchingOptions(element, step.values, step.labels);
      return {
        element,
        run: async () => {
          for (const option of element.options) option.selected = options.includes(option);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        },
      };
    }
    case "check": {
      const element = await target(step.target, step);
      if (checkedOf(element) === step.checked) return { element, noop: true, run: async () => {} };
      const locator = step.target;
      return {
        element,
        run: async deadline => {
          (element as HTMLElement).click();
          const holds = () => checkedOf(element.isConnected ? element : locate(locator, context.records)) === step.checked;
          if (!(await waitUntil(holds, deadline - Date.now(), context.stop))) {
            throw new PageError("DEADLINE", "The control did not reach the wanted state", { reason: "state-unchanged" });
          }
        },
      };
    }
    case "scroll": {
      const element = step.target ? locate(step.target, context.records) : undefined;
      return { element, run: async () => scroll(element, step.to) };
    }
    case "submit": {
      const element = locate(step.target, context.records);
      return { element, run: async () => submitEffect(element, "The submit target")() };
    }
    case "navigate": {
      let url: string;
      try { url = new URL(step.url, location.href).href; } catch { throw new PageError("INVALID_ARGUMENT", `${step.url} is not a URL`); }
      return { run: async () => location.assign(url) };
    }
    case "wait":
      throw new PageError("INVALID_STEPS", "A wait step does not run on its own");
  }
}

export function refuseProtected(element: Element) {
  if (isProtected(element)) throw new PageError("PROTECTED_FIELD", "Genesis does not enter text into password, one-time code or card fields");
}

// ---- Events ------------------------------------------------------------------------------------

interface Point { x: number; y: number }

function center(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** `enter` and `leave` events do not bubble; the others do. */
const bubbles = (type: string) => !type.endsWith("enter") && !type.endsWith("leave");

function pointer(element: Element, type: string, at: Point, buttons: number, pointerType = "mouse"): boolean {
  const init: PointerEventInit = {
    bubbles: bubbles(type), cancelable: bubbles(type), composed: true, clientX: at.x, clientY: at.y,
    pointerId: 1, pointerType, isPrimary: true, button: type === "pointerdown" || type === "pointerup" ? 0 : -1, buttons,
  };
  const event = typeof PointerEvent === "function" ? new PointerEvent(type, init) : new MouseEvent(type, init);
  return element.dispatchEvent(event);
}

function mouse(element: Element, type: string, at: Point, button: number, buttons: number, detail = 1): boolean {
  return element.dispatchEvent(new MouseEvent(type, {
    bubbles: bubbles(type), cancelable: bubbles(type), composed: true, clientX: at.x, clientY: at.y, button, buttons, detail, view: window,
  }));
}

function fire(element: Element, type: string, init: MouseEventInit = {}) {
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view: window, ...init }));
}

/** A touch event, where the WebView can construct one; true when the page did not cancel it. */
function touch(element: Element, type: "touchstart" | "touchend", at: Point): boolean {
  if (typeof TouchEvent !== "function" || typeof Touch !== "function") return true;
  try {
    const point = new Touch({ identifier: 1, target: element, clientX: at.x, clientY: at.y });
    const active = type === "touchstart" ? [point] : [];
    return element.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: active, targetTouches: active, changedTouches: [point] }));
  } catch {
    return true;
  }
}

/** The sequence a touch tap produces. A cancelled `touchend` skips the mouse events and `click`, as a browser does. */
function tap(element: Element) {
  const at = center(element);
  pointer(element, "pointerover", at, 0, "touch");
  pointer(element, "pointerenter", at, 0, "touch");
  pointer(element, "pointerdown", at, 1, "touch");
  touch(element, "touchstart", at);
  pointer(element, "pointerup", at, 0, "touch");
  pointer(element, "pointerout", at, 0, "touch");
  pointer(element, "pointerleave", at, 0, "touch");
  if (!touch(element, "touchend", at)) return;
  mouse(element, "mouseover", at, 0, 0);
  mouse(element, "mouseenter", at, 0, 0);
  mouse(element, "mousemove", at, 0, 0);
  mouse(element, "mousedown", at, 0, 1);
  focusable(element)?.focus({ preventScroll: true });
  mouse(element, "mouseup", at, 0, 0);
  mouse(element, "click", at, 0, 0);
}

/** The mouse sequence; `count: 2` adds a second click and `dblclick`. */
function mouseClick(element: Element, count: number) {
  const at = center(element);
  pointer(element, "pointerover", at, 0);
  pointer(element, "pointerenter", at, 0);
  mouse(element, "mouseover", at, 0, 0);
  mouse(element, "mouseenter", at, 0, 0);
  pointer(element, "pointermove", at, 0);
  mouse(element, "mousemove", at, 0, 0);
  for (let i = 1; i <= count; i++) {
    pointer(element, "pointerdown", at, 1);
    mouse(element, "mousedown", at, 0, 1, i);
    if (i === 1) focusable(element)?.focus({ preventScroll: true });
    pointer(element, "pointerup", at, 0);
    mouse(element, "mouseup", at, 0, 0, i);
    mouse(element, "click", at, 0, 0, i);
  }
  if (count === 2) mouse(element, "dblclick", at, 0, 0, 2);
}

function focusable(element: Element): HTMLElement | null {
  const found = element.closest("a[href], button, input, select, textarea, [tabindex], [contenteditable='true']");
  return found instanceof HTMLElement ? found : null;
}

function hover(element: Element) {
  if (hovered && hovered !== element) unhover();
  const at = center(element);
  pointer(element, "pointerover", at, 0);
  pointer(element, "pointerenter", at, 0);
  mouse(element, "mouseover", at, 0, 0);
  mouse(element, "mouseenter", at, 0, 0);
  pointer(element, "pointermove", at, 0);
  mouse(element, "mousemove", at, 0, 0);
  hovered = element;
}

function unhover() {
  const element = hovered;
  hovered = null;
  if (!element?.isConnected) return;
  const at = center(element);
  pointer(element, "pointerout", at, 0);
  pointer(element, "pointerleave", at, 0);
  mouse(element, "mouseout", at, 0, 0);
  mouse(element, "mouseleave", at, 0, 0);
}

// ---- Keys --------------------------------------------------------------------------------------

function key(element: Element, type: "keydown" | "keypress" | "keyup", name: string, modifiers: string[]): boolean {
  return element.dispatchEvent(new KeyboardEvent(type, {
    key: name, code: codeOf(name), bubbles: true, cancelable: true, composed: true,
    ctrlKey: modifiers.includes("Control"), shiftKey: modifiers.includes("Shift"), altKey: modifiers.includes("Alt"), metaKey: modifiers.includes("Meta"),
  }));
}

function codeOf(name: string): string {
  if (/^[a-z]$/i.test(name)) return `Key${name.toUpperCase()}`;
  if (/^[0-9]$/.test(name)) return `Digit${name}`;
  if (name === " ") return "Space";
  return name;
}

const isCharacter = (name: string) => [...name].length === 1;

/** Inserts text at the caret the way typing does: `beforeinput`, the value setter, `input`. */
function insert(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const before = new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true, composed: true });
  if (!element.dispatchEvent(before)) return;
  const value = element.value;
  let start = value.length;
  let end = value.length;
  try { start = element.selectionStart ?? start; end = element.selectionEnd ?? end; } catch { /* no selection on this input type */ }
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value.slice(0, start) + text + value.slice(end));
  try { element.setSelectionRange(start + text.length, start + text.length); } catch { /* no selection on this input type */ }
  element.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: text, bubbles: true, composed: true }));
}

function typeChar(element: HTMLInputElement | HTMLTextAreaElement, char: string) {
  if (!key(element, "keydown", char, [])) { key(element, "keyup", char, []); return; }
  if (key(element, "keypress", char, [])) insert(element, char);
  key(element, "keyup", char, []);
}

function typeEditable(element: HTMLElement, text: string) {
  element.focus({ preventScroll: true });
  const selection = getSelection();
  if (selection && !element.contains(selection.anchorNode)) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  const before = new InputEvent("beforeinput", { inputType: "insertText", data: text, bubbles: true, cancelable: true, composed: true });
  if (!element.dispatchEvent(before)) return;
  // execCommand is deprecated but is the one way a page script inserts text the editor's own way.
  if (!document.execCommand("insertText", false, text)) {
    throw new PageError("NOT_ACTIONABLE", "This editor needs trusted input", { reason: "editor-needs-trusted-input" });
  }
}

/**
 * `keydown`, `keypress` for character keys and Enter, `keyup`. Untrusted keys have no default
 * action, so when the page does not cancel `keydown` the agent performs four itself: Enter in a
 * form field submits, Enter or Space on a button or link clicks it, Tab moves focus, and a
 * character in a text field is inserted.
 */
function press(element: Element, name: string, modifiers: string[]) {
  const proceed = key(element, "keydown", name, modifiers);
  const character = isCharacter(name);
  const pressed = proceed && (character || name === "Enter") ? key(element, "keypress", name, modifiers) : proceed;
  if (proceed && pressed) {
    const text = element instanceof HTMLTextAreaElement || (element instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "reset", "image", "file"].includes(element.type));
    const command = modifiers.some(modifier => modifier === "Control" || modifier === "Meta" || modifier === "Alt");
    if (name === "Enter" && element instanceof HTMLInputElement && text) element.form?.requestSubmit();
    else if ((name === "Enter" || name === " ") && (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement || element.getAttribute("role") === "button")) (element as HTMLElement).click();
    else if (name === "Tab") moveFocus(element, modifiers.includes("Shift"));
    else if (character && text && !command && !isProtected(element)) insert(element as HTMLInputElement | HTMLTextAreaElement, name);
  }
  key(element, "keyup", name, modifiers);
}

function moveFocus(from: Element, back: boolean) {
  const all = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex], [contenteditable='true']")]
    .filter(element => !(element as HTMLButtonElement).disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
  if (!all.length) return;
  const i = all.indexOf(from as HTMLElement);
  const next = i === -1 ? all[back ? all.length - 1 : 0] : all[(i + (back ? -1 : 1) + all.length) % all.length];
  next.focus();
}

// ---- Select and scroll -------------------------------------------------------------------------

function matchingOptions(element: HTMLSelectElement, values?: string[], labels?: string[]): HTMLOptionElement[] {
  const wanted = [...element.options].filter(option =>
    (values?.includes(option.value) ?? false) || (labels?.some(label => option.label.trim() === label.trim() || option.text.trim() === label.trim()) ?? false));
  if (wanted.length === 0) throw new PageError("NOT_FOUND", "No option matches the values or labels");
  if (!element.multiple && wanted.length > 1) return [wanted[0]];
  return wanted;
}

/** Scrolls instantly, waits for `scrollend` (or a short timer, where it does not fire), and returns the new offsets. */
export async function scroll(element: Element | undefined, to: ScrollTo): Promise<ScrollPosition> {
  const scroller = element ?? document.scrollingElement ?? document.documentElement;
  const page = !element || scroller === document.scrollingElement;
  const target: EventTarget = page ? window : scroller;
  const ended = new Promise<void>(resolve => {
    const done = () => { target.removeEventListener("scrollend", done); resolve(); };
    target.addEventListener("scrollend", done);
    setTimeout(done, 120);
  });
  if (to === "intoView") {
    if (!element) throw new PageError("INVALID_ARGUMENT", "scroll to intoView needs a target");
    element.scrollIntoView({ block: "center", behavior: "instant" });
  } else if (to === "start" || to === "end") {
    const y = to === "start" ? 0 : scroller.scrollHeight;
    if (page) window.scrollTo({ top: y, behavior: "instant" }); else scroller.scrollTo({ top: y, behavior: "instant" });
  } else if ("by" in to) {
    const options: ScrollToOptions = { left: to.by.x ?? 0, top: to.by.y ?? 0, behavior: "instant" };
    if (page) window.scrollBy(options); else scroller.scrollBy(options);
  } else {
    const options: ScrollToOptions = { behavior: "instant" };
    if (to.x !== undefined) options.left = to.x;
    if (to.y !== undefined) options.top = to.y;
    if (page) window.scrollTo(options); else scroller.scrollTo(options);
  }
  await ended;
  return scrollPosition(page ? undefined : scroller);
}

export function scrollPosition(element?: Element): ScrollPosition {
  const scroller = element ?? document.scrollingElement ?? document.documentElement;
  const page = !element;
  const x = page ? scrollX : scroller.scrollLeft;
  const y = page ? scrollY : scroller.scrollTop;
  const maxX = Math.max(0, scroller.scrollWidth - (page ? innerWidth : scroller.clientWidth));
  const maxY = Math.max(0, scroller.scrollHeight - (page ? innerHeight : scroller.clientHeight));
  return { x: Math.round(x), y: Math.round(y), maxX, maxY, atEnd: y >= maxY - 1 };
}
