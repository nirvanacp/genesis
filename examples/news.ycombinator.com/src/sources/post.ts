import { defineSource } from "@genesis/sdk/source";
import { safeUrl, TITLE_LIMIT, type SubmitData } from "../model";
import { parsing, signedIn } from "./page";

const FORM = "form[action='r']";

export default defineSource({
  id: "post",
  routes: {
    submit: {
      extract(doc): SubmitData | null {
        if (parsing(doc)) return null;
        return { form: doc.querySelector(`${FORM} input[name='title']`) !== null };
      },
    },
  },
  intents: {
    /** Fills HN's own form and submits it; HN then decides where the page goes. */
    submit(intent) {
      const title = typeof intent.title === "string" ? intent.title.trim() : "";
      const url = typeof intent.url === "string" ? intent.url.trim() : "";
      const text = typeof intent.text === "string" ? intent.text : "";
      if (!title || title.length > TITLE_LIMIT) throw new Error("Invalid title");
      if (url && !safeUrl(url)) throw new Error("Invalid URL");
      return [
        { fill: `${FORM} input[name='title']`, value: title },
        { fill: `${FORM} input[name='url']`, value: url },
        { fill: `${FORM} textarea[name='text']`, value: text },
        { submit: `${FORM} input[type='submit']` },
      ];
    },
  },
  /** Signed out, /submit is a bare login page with no account link and no submit form. */
  isSignedIn: doc => parsing(doc) || signedIn(doc) || doc.querySelector(`${FORM} input[name='title']`) !== null,
});
