import { safeUrl, validItemId, itemIdOf, type CommentEntry, type Story, type TextPart } from "../model";

/** Snapshot budget for lists, below the host's 196 608-byte snapshot limit. */
export const BUDGET_BYTES = 150_000;
const encoder = new TextEncoder();
export const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/** Collapses whitespace and bounds the length of website text. */
export function clean(value: string | null | undefined, limit = 300): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/** True while the HTML is still arriving; extractors return null until it is parsed. */
export const parsing = (doc: Document) => doc.readyState === "loading";

export const signedIn = (doc: Document) => doc.querySelector("#me") !== null;

/**
 * Throws the website's message when the page is not an HN page, such as the rate-limit notice.
 * The message becomes the snapshot's error, shown as text.
 */
export function requireHnPage(doc: Document): void {
  if (doc.querySelector("#hnmain")) return;
  const message = clean(doc.body?.textContent, 200);
  throw new Error(message || "Hacker News returned an empty page");
}

/** HN's allowed formatting as text runs. Scripts, styles and form fields are skipped. */
export function richText(node: Node | null, limit = 12_000): TextPart[] {
  const parts: TextPart[] = [];
  let length = 0;
  const walk = (current: Node, format: Omit<TextPart, "text">) => {
    if (length >= limit) return;
    if (current.nodeType === Node.TEXT_NODE) {
      const text = (current.textContent ?? "").slice(0, limit - length);
      length += text.length;
      if (text) parts.push({ text, ...format });
      return;
    }
    if (!(current instanceof Element) || current.matches("script,style,input,textarea,select,button,noscript,form,img,.reply,.pagetop")) return;
    const next = { ...format };
    if (current.tagName === "A") {
      const href = safeUrl(current.getAttribute("href") ?? "", current.ownerDocument.location.href);
      if (href) next.href = href;
    }
    if (current.matches("b,strong")) next.strong = true;
    if (current.matches("i,em")) next.em = true;
    if (current.matches("code,pre")) next.code = true;
    if (current.matches("p,br,pre,li,tr,h1,h2,h3") && length > 0) {
      parts.push({ text: "\n\n" });
      length += 2;
    }
    for (const child of current.childNodes) walk(child, next);
  };
  if (node) walk(node, {});
  return parts;
}

/** A story row (`tr.athing.submission`) and the metadata row after it. */
export function story(row: Element, doc: Document): Story | null {
  if (!validItemId(row.id)) return null;
  const link = row.querySelector<HTMLAnchorElement>(".titleline > a");
  const title = clean(link?.textContent, 400);
  if (!link || !title) return null;
  const href = safeUrl(link.getAttribute("href") ?? "", doc.location.href);
  const sub = row.nextElementSibling?.querySelector(".subtext") ?? null;
  const up = row.querySelector(`[id="up_${row.id}"]`);
  const commentsLink = [...(sub?.querySelectorAll<HTMLAnchorElement>("a[href^='item?id=']") ?? [])]
    .reverse().find(a => /comment|discuss/i.test(a.textContent ?? ""));
  const member = signedIn(doc);
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
    canVote: member && up !== null && !up.classList.contains("nosee"),
    voted: member && (up?.classList.contains("nosee") === true || sub?.querySelector(`[id="un_${row.id}"]`) !== null),
  };
}

/** A comment row: `tr.athing.comtr` on threads, `tr.athing` with comment text on comment lists. */
export function comment(row: Element, doc: Document): CommentEntry | null {
  if (!validItemId(row.id)) return null;
  const body = row.querySelector(".comment");
  if (!body) return null;
  const text = body.querySelector(".commtext");
  const onStory = row.querySelector<HTMLAnchorElement>(".onstory a[href]");
  const storyId = onStory ? itemIdOf(onStory.href) : null;
  const links = [...row.querySelectorAll<HTMLAnchorElement>(".navs a[href]")].flatMap(a => {
    const label = clean(a.textContent, 20);
    const url = safeUrl(a.getAttribute("href") ?? "", doc.location.href);
    return url && label && !a.classList.contains("togg") && a.closest(".onstory") === null ? [{ label, url }] : [];
  }).slice(0, 6);
  return {
    id: row.id,
    author: clean(row.querySelector(".hnuser")?.textContent, 64) || null,
    age: clean(row.querySelector(".age")?.textContent, 40) || null,
    depth: Math.min(20, Math.max(0, Number(row.querySelector(".ind")?.getAttribute("indent") ?? 0) || 0)),
    parts: text ? richText(text, 8_000) : [{ text: clean(body.textContent, 100) || "[no text]" }],
    onStory: storyId ? { id: storyId, title: clean(onStory!.getAttribute("title") || onStory!.textContent, 400) } : null,
    links,
    canReply: signedIn(doc) && body.querySelector(".reply a[href^='reply?id=']") !== null,
  };
}

/** Comments in page order until the snapshot budget is spent. */
export function comments(rows: Iterable<Element>, doc: Document, used: number): { list: CommentEntry[]; partial: boolean } {
  const list: CommentEntry[] = [];
  let size = used;
  for (const row of rows) {
    const entry = comment(row, doc);
    if (!entry) continue;
    size += bytes(entry);
    if (size > BUDGET_BYTES || list.length >= 400) return { list, partial: true };
    list.push(entry);
  }
  return { list, partial: false };
}

export const morelink = (doc: Document) => {
  const href = doc.querySelector<HTMLAnchorElement>("a.morelink")?.getAttribute("href");
  return href ? safeUrl(href, doc.location.href) : null;
};
