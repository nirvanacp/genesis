import { GenesisError } from "../../bridge.js";

/** The effect of submitting the form `target` is or belongs to; `target` is the submitter when it is a button. */
export function submitEffect(target: Element, what: string): () => void {
  const form = target instanceof HTMLFormElement ? target : target.closest("form");
  if (!form) throw new GenesisError("NOT_FOUND", `${what} is not in a form`);
  const submitter = target instanceof HTMLButtonElement || target instanceof HTMLInputElement ? target : undefined;
  return () => form.requestSubmit(submitter);
}

/** Sets a field's value the way typing does, so frameworks that track input see it. */
export function fill(target: Element, value: string) {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    throw new GenesisError("INVALID_STEPS", "fill needs an input or textarea");
  }
  const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(target, value);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}
