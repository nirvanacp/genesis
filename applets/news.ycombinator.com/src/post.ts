import type { AppletContext } from "@genesis/sdk";

const key = "genesis.hn.postDraft";
const pendingKey = "genesis.hn.postPending";
export function preservePostDraft(context: AppletContext): void {
  if (location.pathname !== "/submit") {
    if (localStorage.getItem(pendingKey) === "true") {
      localStorage.removeItem(key);
      localStorage.removeItem(pendingKey);
    }
    return;
  }
  localStorage.removeItem(pendingKey);
  const form = document.querySelector<HTMLFormElement>("form:has(input[name='title'])");
  if (!form) return;
  const names = ["title", "url", "text"] as const;
  const inputs = names.map(name => form.elements.namedItem(name)).filter((item): item is HTMLInputElement | HTMLTextAreaElement =>
    item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement);
  try {
    const draft = JSON.parse(localStorage.getItem(key) || "{}");
    for (const input of inputs) if (!input.value && typeof draft[input.name] === "string") input.value = draft[input.name];
  } catch { /* An invalid old draft must not block HN's form. */ }
  const save = () => localStorage.setItem(key, JSON.stringify(Object.fromEntries(inputs.map(input => [input.name, input.value]))));
  for (const input of inputs) input.addEventListener("input", save, { signal: context.signal });
  form.addEventListener("submit", () => { save(); localStorage.setItem(pendingKey, "true"); }, { signal: context.signal });
}
