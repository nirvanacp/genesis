import { single, type Page } from "@genesis/sdk/adapter";
import type { InfoData, TextPart } from "../model.ts";
import { account, clean, richText } from "./read.ts";

const BREAK = "\n\n";
const blank = (part: TextPart) => !part.href && part.text.trim() === "";

/**
 * HN lays these pages out with tables, spacer cells and hard-wrapped lines, which read as runs of
 * empty paragraphs and broken sentences. Keeps one break per run of breaks, joins wrapped lines
 * outside code, trims both ends, and drops a first heading that repeats the page title.
 */
function tidy(parts: TextPart[], title: string): TextPart[] {
  const kept: TextPart[] = [];
  const last = () => kept[kept.length - 1];
  for (const part of parts) {
    if (part.text === BREAK) {
      if (kept.length > 0 && last().text !== BREAK) kept.push(part);
    } else if (part.code) kept.push(part);
    else {
      let text = part.text.replace(/\s*\n\s*/g, " ");
      // A paragraph starts at its first word.
      if (kept.length === 0 || last().text === BREAK) text = text.trimStart();
      if (text) kept.push({ ...part, text });
    }
  }
  while (kept.length > 0 && blank(last())) kept.pop();
  if (kept[0]?.text.trim() === title) kept.shift();
  while (kept.length > 0 && blank(kept[0])) kept.shift();
  return kept;
}

/**
 * HN's information pages: guidelines, FAQ, formatting help, lists and leaders. The guidelines
 * and FAQ are static files outside HN's layout table and without its top bar, so they do not
 * show the account; the others do.
 */
function sections(html: Element): InfoData {
  const doc = html.ownerDocument;
  const body = html.querySelector("#bigbox") ?? html.querySelector("body");
  const title = clean(doc.title.replace(/\s*\|\s*Hacker News$/, ""), 120) || "Hacker News";
  return { title, parts: tidy(richText(body, 60_000), title) };
}

export const info: Page = {
  ready: doc => doc.readyState !== "loading" && doc.body !== null,
  account: doc => (doc.querySelector("#hnmain") ? account(doc) : undefined),
  regions: {
    sections: single({ root: "html", read: sections }),
  },
};
