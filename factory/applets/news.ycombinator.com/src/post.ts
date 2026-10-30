import { writeLocal } from "./local-state";
import type { AppletContext } from "@genesis/sdk";

/** Only public draft fields enter applet-scoped host storage. HN owns the real form submission. */
export function preservePostDraft(context: AppletContext): void {
  if (location.pathname !== "/submit") return;
  const form = document.querySelector<HTMLFormElement>("form:has(input[name='title'])");
  if (!form) return;
  const fields = ["title", "url", "text"].map(name => form.elements.namedItem(name))
    .filter((field): field is HTMLInputElement | HTMLTextAreaElement => field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement);
  let changed = false, queue = Promise.resolve();
  void context.storage.get<Record<string, string>>("drafts", "post").then(({ document }) => {
    if (context.signal.aborted || changed || !document) return;
    for (const field of fields) if (!field.value && typeof document.value[field.name] === "string") field.value = document.value[field.name];
  }).catch(() => { /* A missing draft must not disable HN's form. */ });
  const save = () => {
    changed = true;
    const value = Object.fromEntries(fields.map(field => [field.name, field.value]));
    queue = queue.catch(() => {}).then(async () => {
      await writeLocal(context, "drafts", "post", value);
      delete form.dataset.draftUnsaved;
    });
    void queue.catch(() => { form.dataset.draftUnsaved = "true"; });
  };
  for (const field of fields) field.addEventListener("input", save, { signal: context.signal });
  form.addEventListener("submit", save, { signal: context.signal });
  window.addEventListener("beforeunload", event => {
    if (form.dataset.draftUnsaved) { event.preventDefault(); event.returnValue = ""; }
  }, { signal: context.signal });
  // Authentication redirects and server validation errors never delete a draft.
  const discard = document.createElement("button"); discard.type = "button"; discard.textContent = "Discard draft";
  discard.onclick = () => {
    for (const field of fields) field.value = "";
    save();
  };
  form.append(discard); context.onDispose(() => discard.remove());
}
