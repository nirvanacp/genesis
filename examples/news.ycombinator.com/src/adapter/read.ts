import type { ActionSpec } from "@genesis/sdk/adapter";
import { itemIdOf, ORIGIN, safeUrl, validItemId, type CommentEntry, type MoreLink, type Story, type TextPart } from "../model.ts";

/**
 * Reading helpers shared by the page definitions. Each one reads only the element it is given
 * and its descendants, which keeps region reads inside the item and extent the runtime watches.
 * Nothing here uses DOM globals, so the tests run them on a parsed fixture in Node.
 */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** Collapses whitespace and bounds the length of website text. */
export function clean(value: string | null | undefined, limit = 300): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/** The URL of the page a node belongs to; HN links are relative to it. */
function baseOf(node: Node): string {
  return node.ownerDocument?.location?.href ?? `${ORIGIN}/`;
}

/** An element's link as an absolute http(s) URL, or null. */
export function hrefOf(element: Element): string | null {
  const href = element.getAttribute("href");
  return href ? safeUrl(href, baseOf(element)) : null;
}

/** Positive evidence for every HN page: the document is parsed and HN's layout table exists. */
export const hnPage = (doc: Document) => doc.readyState !== "loading" && doc.querySelector("#hnmain") !== null;

/** The signed-in account: HN's `#me` link in the top bar, or null when signed out. */
export const account = (doc: Document) => clean(doc.querySelector("#me")?.textContent, 64) || null;

/** HN's allowed formatting as text runs. Scripts, styles and form fields are skipped. */
export function richText(node: Node | null, limit = 12_000): TextPart[] {
  const parts: TextPart[] = [];
  let length = 0;
  const walk = (current: Node, format: Omit<TextPart, "text">) => {
    if (length >= limit) return;
    if (current.nodeType === TEXT_NODE) {
      const text = (current.textContent ?? "").slice(0, limit - length);
      length += text.length;
      if (text) parts.push({ text, ...format });
      return;
    }
    if (current.nodeType !== ELEMENT_NODE) return;
    const element = current as Element;
    if (element.matches("script,style,input,textarea,select,button,noscript,form,img,.reply,.pagetop")) return;
    const next = { ...format };
    if (element.tagName === "A") {
      const href = hrefOf(element);
      if (href) next.href = href;
    }
    if (element.matches("b,strong")) next.strong = true;
    if (element.matches("i,em")) next.em = true;
    if (element.matches("code,pre")) next.code = true;
    if (element.matches("p,br,pre,li,tr,h1,h2,h3") && length > 0) {
      parts.push({ text: "\n\n" });
      length += 2;
    }
    for (const child of element.childNodes) walk(child, next);
  };
  if (node) walk(node, {});
  return parts;
}

/**
 * Vote state of an item from the nodes that hold its arrows. HN hides the upvote arrow with
 * `nosee` once the account voted and adds an `unvote` link (`#un_<id>`).
 */
function voteState(id: string, ...holders: (Element | null | undefined)[]) {
  const find = (prefix: string) => {
    for (const holder of holders) {
      const found = holder?.querySelector(`[id="${prefix}_${id}"]`);
      if (found) return found;
    }
    return null;
  };
  const up = find("up");
  const voted = up?.classList.contains("nosee") === true || find("un") !== null;
  return { canVote: up !== null && !voted, voted };
}

/** A story row (`tr.athing.submission`) and the subtext row after it, which is its extent. */
export function story(row: Element): Story | null {
  if (!validItemId(row.id)) return null;
  const link = row.querySelector(".titleline > a");
  const title = clean(link?.textContent, 400);
  if (!link || !title) return null;
  const href = hrefOf(link);
  const sub = row.nextElementSibling?.querySelector(".subtext") ?? null;
  const commentsLink = [...(sub?.querySelectorAll("a[href^='item?id=']") ?? [])]
    .reverse().find(a => /comment|discuss/i.test(a.textContent ?? ""));
  return {
    id: row.id,
    title,
    articleUrl: href && itemIdOf(href) !== row.id ? href : null,
    domain: clean(row.querySelector(".sitestr")?.textContent, 120) || null,
    submitter: clean(sub?.querySelector(".hnuser")?.textContent, 64) || null,
    score: clean(sub?.querySelector(".score")?.textContent, 40) || null,
    age: clean(sub?.querySelector(".age")?.textContent, 40) || null,
    comments: commentsLink ? clean(commentsLink.textContent, 40) : null,
    rank: clean(row.querySelector(".rank")?.textContent, 8).replace(/\.$/, "") || null,
    ...voteState(row.id, row, sub),
  };
}

/** The id a "parent" link points to: `#123` inside a thread, `item?id=123` on a comment's own page. */
function parentOf(row: Element): string | null {
  const link = [...row.querySelectorAll(".navs a[href]")].find(a => clean(a.textContent, 20) === "parent");
  const href = link?.getAttribute("href") ?? "";
  const id = href.startsWith("#") ? href.slice(1) : (itemIdOf(safeUrl(href, baseOf(row)) ?? "") ?? "");
  return validItemId(id) ? id : null;
}

/**
 * A comment row (`tr.athing.comtr` in a thread, `tr.athing` at the head of a comment's page).
 * `links` keeps the head's navigation links; thread rows leave them out to keep pages small,
 * since `parent` already carries the one link a thread needs.
 */
export function comment(row: Element, { links = false } = {}): CommentEntry | null {
  if (!validItemId(row.id)) return null;
  const body = row.querySelector(".comment");
  if (!body) return null;
  const text = body.querySelector(".commtext");
  const onStory = row.querySelector(".onstory a[href]");
  const storyId = onStory ? itemIdOf(hrefOf(onStory) ?? "") : null;
  return {
    id: row.id,
    author: clean(row.querySelector(".hnuser")?.textContent, 64) || null,
    age: clean(row.querySelector(".age")?.textContent, 40) || null,
    depth: Math.min(20, Math.max(0, Number(row.querySelector(".ind")?.getAttribute("indent") ?? 0) || 0)),
    parent: parentOf(row),
    parts: text ? richText(text, 8_000) : [{ text: clean(body.textContent, 100) || "[no text]" }],
    onStory: storyId ? { id: storyId, title: clean(onStory!.getAttribute("title") || onStory!.textContent, 400) } : null,
    links: links ? [...row.querySelectorAll(".navs a[href]")].flatMap(a => {
      const label = clean(a.textContent, 20);
      const url = hrefOf(a);
      return url && label && !a.classList.contains("togg") && a.closest(".onstory") === null ? [{ label, url }] : [];
    }).slice(0, 6) : [],
    canReply: body.querySelector(".reply a[href^='reply?id=']") !== null,
    ...voteState(row.id, row),
  };
}

/** HN's "More" link. Its URL carries no token: it is the next page of the list or thread. */
export function moreLink(link: Element): MoreLink | null {
  const url = hrefOf(link);
  return url ? { url } : null;
}

/**
 * The `setVoted` action for an item in `doc`. It does nothing when the page already shows the
 * wanted state, else clicks HN's own arrow or unvote link, which carries the account's vote
 * token, so the token never leaves the page. The page showing the new state is the evidence.
 */
export function setVoted(doc: Document, id: string, args: unknown): ActionSpec {
  const voted = (args as { voted?: unknown } | null)?.voted;
  if (typeof voted !== "boolean") throw new Error("setVoted needs { voted: boolean }");
  if (!validItemId(id)) throw new Error("Not a Hacker News item");
  const shows = (d: Document) => voteState(id, d.documentElement).voted;
  if (shows(doc) === voted) return { satisfied: true };
  const link = `[id="${voted ? "up" : "un"}_${id}"]`;
  if (!doc.querySelector(link)) throw new Error(voted ? "This item cannot be upvoted here" : "This vote cannot be undone here");
  return { steps: [{ click: link }], until: d => shows(d) === voted };
}
