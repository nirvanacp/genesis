import { single, type Page } from "@genesis/sdk/adapter";
import { TITLE_LIMIT, type SubmitForm } from "../model.ts";
import { clean } from "./read.ts";

/** HN's submit form. It posts to `/r`; a rejected submission shows the form again there. */
const FORM = "form[action='/r']";
const FIELDS = ["title", "url", "text"] as const;
type FieldName = typeof FIELDS[number];

const field = (form: Element, name: FieldName) =>
  form.querySelector(`[name='${name}']`) as HTMLInputElement | HTMLTextAreaElement | null;

/**
 * The form's field values and the message HN shows above it after a rejected submission.
 * The message is the text of the page's box outside the form and its script.
 */
function readForm(form: Element): SubmitForm {
  const values = Object.fromEntries(FIELDS.map(name => [name, field(form, name)?.value ?? ""])) as Record<FieldName, string>;
  const box = form.closest("#bigbox, td") ?? form.parentElement;
  let message = "";
  for (const node of box?.childNodes ?? []) {
    if (node === form || (node as Element).tagName === "SCRIPT" || (node as Element).contains?.(form)) continue;
    message += ` ${node.textContent ?? ""}`;
  }
  return { ...values, error: clean(message, 300) || null };
}

const isField = (name: unknown): name is FieldName => FIELDS.includes(name as FieldName);

/**
 * `/submit` and `/r`. Signed out, HN shows its login form here instead, and the page has no
 * top bar either way, so the form itself is the evidence of an account.
 */
export const submit: Page = {
  ready: doc => doc.readyState !== "loading" && doc.querySelector("#hnmain") !== null,
  account: doc => (doc.querySelector(FORM) ? undefined : null),
  requiresAccount: true,
  regions: {
    form: single({
      root: FORM,
      // The rejection message sits beside the form, in the page's box, outside the region's root.
      dependsOn: ["#hnmain"],
      fields: true,
      read: readForm,
      actions: {
        /** Types a value into one of HN's fields, firing its input events. */
        setField: (form, args: { name?: unknown; value?: unknown }) => {
          const { name, value } = args ?? {};
          if (!isField(name) || typeof value !== "string") throw new Error("setField needs { name: title | url | text, value }");
          if (name === "title" && value.length > TITLE_LIMIT) throw new Error(`Titles are at most ${TITLE_LIMIT} characters`);
          const input = field(form!, name);
          if (!input) throw new Error(`The form has no ${name} field`);
          if (input.value === value) return { satisfied: true };
          return {
            steps: [{ fill: `${FORM} [name='${name}']`, value }],
            until: doc => (doc.querySelector(`${FORM} [name='${name}']`) as HTMLInputElement | null)?.value === value,
          };
        },
        /**
         * Submits HN's form as it stands. HN decides: the new story, the list of new stories or
         * an existing discussion of the same link count as success; the form again is a rejection.
         */
        submit: () => ({ steps: [{ submit: FORM }], navigates: true, expect: { page: ["item", "feed"], notPage: "submit" } }),
      },
    }),
  },
};
