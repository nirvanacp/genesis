import { GenesisError } from "../../bridge.js";
import { isInput, isTextField } from "../read.js";

/**
 * The effect of submitting the form `target` is or belongs to; `target` is the submitter when it
 * is a submit button. Throws `NOT_FOUND` at once when there is no form, so a caller can check
 * before it dispatches anything.
 */
export function submitEffect(target: Element, what: string): () => void {
  const form = (target.localName === "form" ? target : target.closest("form")) as HTMLFormElement | null;
  if (!form) throw new GenesisError("NOT_FOUND", `${what} is not in a form`);
  const submitter = isSubmitButton(target) ? target : undefined;
  return () => form.requestSubmit(submitter);
}

/** `requestSubmit` takes only a submit button as the submitter. */
function isSubmitButton(element: Element): element is HTMLButtonElement | HTMLInputElement {
  if (element.localName === "button") return (element as HTMLButtonElement).type === "submit";
  return isInput(element) && (element.type === "submit" || element.type === "image");
}

/** Sets a field's value the way typing does, so frameworks that track input see it. */
export function fill(target: Element, value: string) {
  if (!isTextField(target)) throw new GenesisError("INVALID_STEPS", "fill needs an input or textarea");
  setValue(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Sets the value through the prototype's setter, past a framework's own setter on the element
 * (React tracks the value that way). The setter's brand check accepts an element of another
 * realm, such as a same-origin frame.
 */
export function setValue(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = isInput(target) ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
}
