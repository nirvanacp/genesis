import type { ActionSpec } from "@genesis/sdk/adapter";
import {
  imageUrl, postUrl, safeLink, validHandle,
  type AccountData, type FeedItem, type MediaData, type NoticeView, type Person, type PostView, type ProfileHeader, type TextPart, type Trend,
} from "../model.ts";

/**
 * Reading X's rendered pages. X marks its parts with `data-testid`; everything read is bounded
 * plain text. Each read function reads only the element it is given and its descendants.
 */

export const POST = 'article[data-testid="tweet"]';
/** Posts and notifications in a list, in page order. */
export const ITEMS = `${POST}, [data-testid="notification"]`;

/** Collapses whitespace and bounds the length of website text. */
export function clean(value: string | null | undefined, limit = 300): string {
  return [...(value ?? "").replace(/\s+/g, " ").trim()].slice(0, limit).join("");
}

/** Rendered text split into its visual lines. */
export function lines(element: Element | null): string[] {
  const text = element instanceof HTMLElement ? element.innerText : element?.textContent ?? "";
  return text.split("\n").map(line => clean(line, 300)).filter(Boolean);
}

/** A short stable key for website text. */
export function hash(text: string): string {
  let value = 5381;
  for (const char of text) value = (value * 33 + char.charCodeAt(0)) >>> 0;
  return value.toString(36);
}

/** X's "Something went wrong" message, when the column shows it with its retry button. */
export function failureText(root: ParentNode): string | null {
  const heading = [...root.querySelectorAll("span")].find(span => /^Something went wrong/i.test(span.textContent ?? ""));
  return heading && root.querySelector('[role="button"], button') ? clean(heading.textContent, 200) : null;
}

export const signedOut = (doc: Document) => doc.querySelector('[data-testid="loginButton"]') !== null;

/** True when `element` belongs to `article` itself, not to a nested quote. */
const own = (element: Element, article: Element) =>
  element.closest(POST) === article && !element.parentElement?.closest('div[role="link"]');
const owned = (article: Element, selector: string) => [...article.querySelectorAll(selector)].filter(element => own(element, article));

/** The post's own permalink: the link around its time. */
function identityOf(article: Element) {
  const identities = owned(article, "a[href]").filter(link => link.querySelector("time"))
    .map(link => ({ link, id: postUrl(link.getAttribute("href")) })).filter(entry => entry.id !== null);
  const first = identities[0];
  if (!first || identities.some(entry => entry.id!.postId !== first.id!.postId)) return null;
  return { link: first.link, ...first.id! };
}

/** The key of a list item: the post id, or a hash of a notification's text. */
export function itemKey(element: Element): string {
  if (element.matches(POST)) return identityOf(element)?.postId ?? `p:${hash(clean(element.textContent, 600))}`;
  return `n:${hash(clean(element.textContent, 600))}`;
}

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
  const identity = identityOf(article);
  if (!identity) return null;
  const time = identity.link.querySelector("time");
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
    // A focused post's analytics link reads "87.7K Views"; a list row's reads "87K".
    views: count(owned(article, 'a[href$="/analytics"]')[0]).replace(/\s*views?$/i, ""),
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

function readNotice(element: Element): NoticeView | null {
  const text = clean(element.textContent, 600);
  if (!text) return null;
  const link = [...element.querySelectorAll("a[href]")].map(a => postUrl(a.getAttribute("href"))).find(Boolean);
  return {
    id: hash(text),
    text,
    url: link?.url ?? null,
    avatars: [...element.querySelectorAll("img")].map(image => imageUrl(image.getAttribute("src")))
      .filter((src): src is string => src !== null).slice(0, 4),
  };
}

/** A post or a notification row. */
export function readItem(element: Element): FeedItem | null {
  if (element.matches(POST)) {
    const post = readPost(element);
    return post && { kind: "post", post };
  }
  const notice = readNotice(element);
  return notice && { kind: "notice", notice };
}

/** The handle of a `UserCell` row, or a hash when the row links no profile. */
export function personKey(cell: Element): string {
  return handleOf(cell) ?? `u:${hash(clean(cell.textContent, 300))}`;
}

function handleOf(cell: Element): string | null {
  return [...cell.querySelectorAll("a[href]")].map(a => /^\/([A-Za-z0-9_]{1,15})$/.exec(a.getAttribute("href") ?? "")?.[1])
    .find(validHandle) ?? null;
}

/** An account row from a `UserCell` element. */
export function readPerson(cell: Element): Person | null {
  const handle = handleOf(cell);
  if (!handle) return null;
  const text = lines(cell);
  const at = text.findIndex(line => line.toLowerCase() === `@${handle.toLowerCase()}`);
  return {
    handle,
    name: (at > 0 ? text[0] : null) ?? handle,
    avatar: imageUrl(cell.querySelector("img")?.getAttribute("src")),
    verified: cell.querySelector('[data-testid="icon-verified"]') !== null,
    description: clean(text.slice(at + 1).filter(line => !/^(Follow|Following|Follows you|Unfollow)$/.test(line)).join(" "), 300),
  };
}

/** A post count or similar figure under a trend ("12.5K posts"). */
const isMeta = (line: string) => /\b(posts?|tweets?)$/i.test(line) || /^[0-9][0-9.,]*[KMB]?$/i.test(line);
/** A trend's category line ("Trending in Sports", "Politics · Trending", "News · LIVE"). */
const isContext = (line: string) => line.length <= 80 && /trending|^[^·]{1,40} · [^·]{1,40}$|^(sports|politics|entertainment|news|technology|business|music|gaming)$/i.test(line);

/**
 * A trend cell. Regular trends show the category, the topic, then a post count; news-style
 * trends lead with a headline and put the category below it. Lines are mapped by their role,
 * not their position: the category is the line that reads like one, the name is the first other line.
 */
export function readTrend(element: Element): Trend | null {
  const text = lines(element).filter(line => line !== "·");
  const context = text.find(isContext) ?? "";
  const rest = text.filter(line => line !== context);
  const name = clean(rest.find(line => !isMeta(line)) ?? "", 200);
  if (!name) return null;
  return { context, name, meta: rest.filter(line => line !== name && isMeta(line)).join(" · ").slice(0, 120) };
}

/** The profile header for the handle in the page's URL, or null until X shows it. */
export function readProfileHeader(root: Element): ProfileHeader | null {
  const handle = root.ownerDocument.location.pathname.split("/")[1] ?? "";
  const nameBox = root.querySelector('[data-testid="UserName"]');
  const nameLines = lines(nameBox);
  if (!nameBox || !nameLines.some(line => line.toLowerCase() === `@${handle.toLowerCase()}`)) return null;
  const linked = (path: string) => imageUrl(root.querySelector(`a[href="/${handle}/${path}" i] img`)?.getAttribute("src"));
  return {
    handle,
    name: nameLines[0],
    verified: nameBox.querySelector('[data-testid="icon-verified"]') !== null,
    avatar: linked("photo"),
    banner: linked("header_photo"),
    description: clean(root.querySelector('[data-testid="UserDescription"]')?.textContent, 1000),
    // Each item (location, link, join date) is its own child; textContent would run them together.
    details: clean([...root.querySelector('[data-testid="UserProfileHeader_Items"]')?.children ?? []]
      .map(item => item.textContent?.trim()).filter(Boolean).join(" · "), 300),
    links: [...root.querySelectorAll("a[href]")]
      .filter(a => new RegExp(`^/${handle}/(following|followers|verified_followers)$`, "i").test(a.getAttribute("href") ?? ""))
      .slice(0, 2).flatMap(a => {
        const url = safeLink(a.getAttribute("href"), root.ownerDocument.location.href);
        return url ? [{ label: clean(a.textContent, 60), url }] : [];
      }),
    own: root.querySelector('[data-testid="editProfileButton"]') !== null,
  };
}

/** The photo X's viewer centres, and whether another one follows it. */
export function readPhoto(overlay: Element): MediaData | null {
  const width = overlay.ownerDocument.defaultView?.innerWidth ?? 0;
  const images = [...overlay.querySelectorAll("img")].filter(image => {
    const src = imageUrl(image.getAttribute("src"));
    return src && new URL(src).pathname.startsWith("/media/");
  });
  const middle = width / 2;
  const selected = images.find(image => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.left <= middle && box.right >= middle;
  });
  if (!selected) return null;
  const src = new URL(imageUrl(selected.getAttribute("src"))!);
  if (src.searchParams.has("name")) src.searchParams.set("name", "large");
  return { image: src.href, hasNext: images.some(image => image.getBoundingClientRect().left >= width - 2) };
}

const STATE = "window.__INITIAL_STATE__=";

/** The signed-in account from X's bootstrap state; never the author of a post on the page. */
function bootstrapAccount(doc: Document): { handle: string; name: string } | null {
  const script = [...doc.scripts].find(element => element.textContent?.startsWith(STATE));
  if (!script) return null;
  try {
    const text = script.textContent ?? "";
    const end = text.indexOf(";window.");
    const initial = JSON.parse(text.slice(STATE.length, end < 0 ? undefined : end));
    const user = initial.entities?.users?.entities?.[initial.session?.user_id];
    return validHandle(user?.screen_name) && typeof user.name === "string" ? { handle: user.screen_name.toLowerCase(), name: user.name } : null;
  } catch {
    return null; // A streamed script may be incomplete; the next mutation reads it again.
  }
}

/**
 * The account handle, confirmed by X's own signed-in controls: the desktop profile link, the mobile
 * profile menu labelled with the account's name, or the signed-in navigation bar.
 */
export function currentAccount(doc: Document): AccountData | null {
  const link = doc.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute("href")?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1];
  const account = bootstrapAccount(doc);
  if (validHandle(link)) return { handle: link.toLowerCase(), name: account?.handle === link.toLowerCase() ? account.name : null };
  if (!account) return null;
  const mobile = doc.querySelector('[data-testid="DashButton_ProfileIcon_Link"]');
  if (mobile) return mobile.getAttribute("aria-label") === `Profile menu ${account.name}` ? account : null;
  return doc.querySelector('[data-testid="AppTabBar_Notifications_Link"]') ? account : null;
}

/** The adapter's account: the handle, null when X shows its login button, undefined when the page shows neither. */
export function account(doc: Document): string | null | undefined {
  if (doc.readyState === "loading") return undefined;
  if (signedOut(doc)) return null;
  return currentAccount(doc)?.handle ?? undefined;
}

/**
 * A desired-state toggle on a post: does nothing when the post already shows `on`, else clicks
 * X's own control and waits for X to show the opposite one.
 */
export function toggle(article: Element | null, on: unknown, press: { on: string; off: string }): ActionSpec {
  if (typeof on !== "boolean") throw new Error("Needs a boolean");
  if (!article?.matches(POST)) throw new Error("Not a post");
  const identity = identityOf(article);
  if (!identity) throw new Error("This post has no clear identity");
  const shows = (element: Element) => owned(element, `[data-testid="${press.off}"]`).length > 0;
  if (shows(article) === on) return { satisfied: true };
  const post = `${POST}:has(a[href$="/status/${identity.postId}"] time)`;
  if (!owned(article, `[data-testid="${on ? press.on : press.off}"]`).length) throw new Error("X shows no control for this here");
  return {
    steps: [{ click: `${post} [data-testid="${on ? press.on : press.off}"]` }],
    until: doc => {
      const now = doc.querySelector(post);
      return now !== null && shows(now) === on;
    },
  };
}
