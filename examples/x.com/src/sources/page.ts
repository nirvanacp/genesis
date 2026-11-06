/** Reading X's rendered pages. X marks its parts with `data-testid`; everything read is bounded plain text. */
import {
  imageUrl, postUrl, safeLink, validHandle,
  type FeedData, type FeedItem, type NoticeView, type Person, type PostView, type TextPart,
} from "../model";

/** Snapshot budget, below the host's 196 608-byte limit. */
export const BUDGET_BYTES = 150_000;
const MAX_ITEMS = 40;
const encoder = new TextEncoder();
export const bytes = (value: unknown) => encoder.encode(JSON.stringify(value)).length;

/** Collapses whitespace and bounds the length of website text. */
export function clean(value: string | null | undefined, limit = 300): string {
  return [...(value ?? "").replace(/\s+/g, " ").trim()].slice(0, limit).join("");
}

/** Rendered text split into its visual lines. */
export function lines(element: Element | null): string[] {
  const text = element instanceof HTMLElement ? element.innerText : element?.textContent ?? "";
  return text.split("\n").map(line => clean(line, 300)).filter(Boolean);
}

export const parsing = (doc: Document) => doc.readyState === "loading";
export const signedOut = (doc: Document) => doc.querySelector('[data-testid="loginButton"]') !== null;

/** X's main column; the side columns are not part of any screen. */
export const primaryColumn = (doc: Document) => doc.querySelector('[data-testid="primaryColumn"]') ?? doc.querySelector("main");

export const emptyText = (root: ParentNode) => clean(root.querySelector('[data-testid="emptyState"]')?.textContent, 200) || null;

/** Throws X's "Something went wrong" message so the screen shows it as an error. */
export function requireNoError(root: ParentNode): void {
  const heading = [...root.querySelectorAll("span")].find(span => /^Something went wrong/i.test(span.textContent ?? ""));
  if (heading && root.querySelector('[role="button"], button')) throw new Error(clean(heading.textContent, 200));
}

const POST = 'article[data-testid="tweet"]';

/** True when `element` belongs to `article` itself, not to a nested quote. */
const own = (element: Element, article: Element) =>
  element.closest(POST) === article && !element.parentElement?.closest('div[role="link"]');
const owned = (article: Element, selector: string) => [...article.querySelectorAll(selector)].filter(element => own(element, article));

/** Post text as runs; emoji images become their alt text and links keep their target. */
export function textParts(node: Element | null, limit = 7000): TextPart[] {
  const parts: TextPart[] = [];
  let length = 0;
  const push = (text: string, href?: string) => {
    if (length >= limit || !text) return;
    const slice = [...text].slice(0, limit - length).join("");
    length += [...slice].length;
    parts.push(href ? { text: slice, href } : { text: slice });
  };
  const walk = (current: Node, href?: string) => {
    if (current.nodeType === Node.TEXT_NODE) return push(current.textContent ?? "", href);
    if (!(current instanceof Element)) return;
    if (current.tagName === "IMG") return push(current.getAttribute("alt") ?? "", href);
    if (current.matches("script,style,button,svg")) return;
    const link = current.tagName === "A" ? safeLink(current.getAttribute("href"), current.ownerDocument.location.href) ?? undefined : href;
    for (const child of current.childNodes) walk(child, link);
  };
  if (node) walk(node);
  return parts;
}

const plain = (parts: TextPart[]) => parts.map(part => part.text).join("");
const count = (element: Element | undefined) => clean(element?.textContent, 20);

/** One post card, or null when its identity is not clear. */
export function readPost(article: Element): PostView | null {
  const identities = owned(article, "a[href]").filter(link => link.querySelector("time"))
    .map(link => ({ link, id: postUrl(link.getAttribute("href")) })).filter(entry => entry.id !== null);
  const identity = identities[0]?.id;
  if (!identity || identities.some(entry => entry.id!.postId !== identity.postId)) return null;
  const time = identities[0].link.querySelector("time");

  const textNode = owned(article, '[data-testid="tweetText"]')[0] ?? null;
  const parts = textNode ? textParts(textNode) : [];
  const full = textNode?.textContent ?? "";
  const nameLink = owned(article, '[data-testid="User-Name"] a')[0];
  const control = (id: string) => owned(article, `[data-testid="${id}"]`)[0];
  const photos = owned(article, '[data-testid="tweetPhoto"] img').filter(image => {
    const target = postUrl(image.closest("a[href]")?.getAttribute("href")?.replace(/\/photo\/[0-9]+$/, ""));
    return target?.postId === identity.postId;
  }).map(image => imageUrl(image.getAttribute("src"))).filter((src): src is string => src !== null).slice(0, 4);

  const social = owned(article, '[data-testid="socialContext"]')[0];
  const quoteBox = [...article.querySelectorAll('div[role="link"]')]
    .find(box => box.closest(POST) === article && box.querySelector('[data-testid="User-Name"]'));
  let quote: PostView["quote"] = null;
  if (quoteBox) {
    const name = lines(quoteBox.querySelector('[data-testid="User-Name"]'));
    const handle = name.find(line => line.startsWith("@"))?.slice(1) ?? null;
    quote = {
      name: name[0] ?? "",
      handle: validHandle(handle) ? handle : null,
      text: clean(quoteBox.querySelector('[data-testid="tweetText"]')?.textContent, 1200),
      url: postUrl(quoteBox.querySelector('a[href*="/status/"]')?.getAttribute("href")?.replace(/\/(photo|video)\/[0-9]+$/, ""))?.url ?? null,
    };
  }

  return {
    postId: identity.postId,
    url: identity.url,
    handle: identity.handle,
    name: clean(nameLink?.textContent, 200) || identity.handle,
    avatar: imageUrl(owned(article, '[data-testid="Tweet-User-Avatar"] img')[0]?.getAttribute("src")),
    verified: owned(article, '[data-testid="User-Name"] [data-testid="icon-verified"]').length > 0,
    time: clean(time?.textContent, 60),
    dateTime: time?.getAttribute("datetime")?.slice(0, 40) ?? null,
    parts,
    textState: !full ? "unavailable"
      : plain(parts).length < full.length || control("tweet-text-show-more-link") ? "excerpt" : "complete",
    photos,
    videos: owned(article, '[data-testid="videoPlayer"]').length,
    replies: count(control("reply")),
    reposts: count(control("retweet") ?? control("unretweet")),
    likes: count(control("like") ?? control("unlike")),
    views: count(owned(article, 'a[href$="/analytics"]')[0]),
    liked: !!control("unlike"),
    reposted: !!control("unretweet"),
    bookmarked: !!control("removeBookmark"),
    canLike: !!(control("like") ?? control("unlike")),
    canBookmark: !!(control("bookmark") ?? control("removeBookmark")),
    quote,
    context: social ? {
      text: clean(social.textContent, 200),
      url: safeLink(social.closest("a[href]")?.getAttribute("href"), article.ownerDocument.location.href),
    } : null,
  };
}

/** A short stable key for website text. */
function key(text: string): string {
  let hash = 5381;
  for (const char of text) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

function readNotice(element: Element): NoticeView | null {
  const text = clean(element.textContent, 600);
  if (!text) return null;
  const link = [...element.querySelectorAll("a[href]")].map(a => postUrl(a.getAttribute("href"))).find(Boolean);
  return {
    id: key(text),
    text,
    url: link?.url ?? null,
    avatars: [...element.querySelectorAll("img")].map(image => imageUrl(image.getAttribute("src")))
      .filter((src): src is string => src !== null).slice(0, 4),
  };
}

/** Posts and notifications in page order, within the snapshot budget. */
export function readItems(root: ParentNode, budget = BUDGET_BYTES): FeedData {
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  let used = 0;
  let partial = false;
  for (const element of root.querySelectorAll(`${POST}, [data-testid="notification"]`)) {
    const item: FeedItem | null = element.matches(POST)
      ? (post => post && { kind: "post" as const, post })(readPost(element))
      : (notice => notice && { kind: "notice" as const, notice })(readNotice(element));
    if (!item) continue;
    const id = item.kind === "post" ? item.post.postId : item.notice.id;
    if (seen.has(id)) continue;
    used += bytes(item);
    if (items.length >= MAX_ITEMS || used > budget) { partial = true; break; }
    seen.add(id);
    items.push(item);
  }
  return { items, partial, emptyText: emptyText(root) };
}

/** Account rows from `UserCell` elements. */
export function readPeople(root: ParentNode, limit = 20): Person[] {
  const people: Person[] = [];
  for (const cell of root.querySelectorAll('[data-testid="UserCell"]')) {
    const handle = [...cell.querySelectorAll("a[href]")].map(a => /^\/([A-Za-z0-9_]{1,15})$/.exec(a.getAttribute("href") ?? "")?.[1])
      .find(validHandle);
    if (!handle || people.some(person => person.handle === handle)) continue;
    const text = lines(cell);
    const at = text.findIndex(line => line.toLowerCase() === `@${handle.toLowerCase()}`);
    people.push({
      handle,
      name: (at > 0 ? text[0] : null) ?? handle,
      avatar: imageUrl(cell.querySelector("img")?.getAttribute("src")),
      verified: cell.querySelector('[data-testid="icon-verified"]') !== null,
      description: clean(text.slice(at + 1).filter(line => !/^(Follow|Following|Follows you|Unfollow)$/.test(line)).join(" "), 300),
    });
    if (people.length >= limit) break;
  }
  return people;
}
