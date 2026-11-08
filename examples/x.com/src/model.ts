/** Data the adapters publish, the screens render and the bookmarks service stores. Website text is plain strings only. */

export const ORIGIN = "https://x.com";

// ---- Page data ------------------------------------------------------------------------------

/** A run of post text; links, mentions and hashtags carry an absolute href. */
export interface TextPart {
  text: string;
  href?: string;
}

export interface PostView {
  postId: string;
  url: string;
  handle: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  /** X's short relative time ("3h") and the machine-readable time, when shown. */
  time: string;
  dateTime: string | null;
  parts: TextPart[];
  textState: "complete" | "excerpt" | "unavailable";
  photos: string[];
  videos: number;
  replies: string;
  reposts: string;
  likes: string;
  views: string;
  liked: boolean;
  reposted: boolean;
  bookmarked: boolean;
  /** The controls this page offers for the post, so the screen shows only working buttons. */
  canLike: boolean;
  canBookmark: boolean;
  quote: { handle: string | null; name: string; text: string; url: string | null } | null;
  /** "Name reposted" or "Pinned", linked to its account when X links it. */
  context: { text: string; url: string | null } | null;
}

/** A notification without a post body, such as "X and 3 others liked your post". */
export interface NoticeView {
  id: string;
  text: string;
  url: string | null;
  avatars: string[];
}

export type FeedItem = { kind: "post"; post: PostView } | { kind: "notice"; notice: NoticeView };

export interface Person {
  handle: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  description: string;
}

export interface Trend {
  context: string;
  name: string;
  meta: string;
}

export interface ProfileHeader {
  handle: string;
  name: string;
  verified: boolean;
  avatar: string | null;
  banner: string | null;
  description: string;
  details: string;
  /** Following and followers counts as X labels them, with their links. */
  links: { label: string; url: string }[];
  own: boolean;
}

export interface MediaData {
  image: string | null;
  hasNext: boolean;
}

export interface AccountData {
  handle: string | null;
  name: string | null;
}

// ---- Bookmarks service records (unchanged from the first release) ---------------------------

export interface Library { version: 1; libraryId: string; expectedHandle: string; revision: number }
export interface Category { version: 1; id: string; name: string; nameKey: string; revision: number; createdAtMs: number; updatedAtMs: number; count: number }
export interface Snapshot {
  authorHandle: string; authorName: string; text: string; textState: "complete" | "excerpt" | "unavailable";
  capturedAtMs: number; media: { kind: "none" | "photo" | "video" | "mixed"; count: number };
  links: { text: string; href: string }[]; quotedPostId?: string;
}
export interface Post { postId: string; url: string; snapshot: Snapshot }
export interface Membership { postId: string; revision: number; categoryIds: string[] }
export interface Bookmark extends Post, Membership { version: 1; savedAtMs: number; updatedAtMs: number }
export interface Receipt { operationId: string; kind: string; status: "committed"; result: unknown; libraryRevision: number; createdAtMs: number }
export interface BookmarkPage { entries: Bookmark[]; nextCursor: string | null; libraryRevision: number; filter: { categoryId: string | null; query: string } }

export const CATEGORY_LIMIT = 50;
export const MEMBERSHIP_LIMIT = 10;

// ---- Validation -----------------------------------------------------------------------------

export const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
export const validHandle = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_]{1,15}$/.test(value);
export const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,25}$/.test(value);
export const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const isNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

/** An http(s) URL without credentials, or null. */
export function safeLink(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Only X's own image hosts; the foreground loads these directly. */
export function imageUrl(value: unknown): string | null {
  const safe = safeLink(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" && ["pbs.twimg.com", "abs.twimg.com"].includes(url.hostname) && !url.port ? url.href : null;
}

/** The canonical post URL `https://x.com/<handle>/status/<id>`, or null. */
export function postUrl(value: unknown): { postId: string; handle: string; url: string } | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, ORIGIN);
    const match = /^\/([A-Za-z0-9_]{1,15})\/status\/([0-9]{1,25})$/.exec(url.pathname);
    return url.origin === ORIGIN && !url.username && !url.password && match
      ? { postId: match[2], handle: match[1], url: `${ORIGIN}/${match[1]}/status/${match[2]}` } : null;
  } catch {
    return null;
  }
}

export function validMembership(value: unknown): value is Membership {
  return isObject(value) && validId(value.postId) && isNumber(value.revision) && value.revision > 0
    && Array.isArray(value.categoryIds) && value.categoryIds.length <= MEMBERSHIP_LIMIT && value.categoryIds.every(isUuid);
}

export function validSnapshot(value: unknown): value is Snapshot {
  if (!isObject(value) || !validHandle(value.authorHandle) || typeof value.authorName !== "string" || value.authorName.length > 800
    || typeof value.text !== "string" || value.text.length > 16000 || !isNumber(value.capturedAtMs)) return false;
  if (!["complete", "excerpt", "unavailable"].includes(String(value.textState)) || !isObject(value.media)
    || !["none", "photo", "video", "mixed"].includes(String(value.media.kind)) || !isNumber(value.media.count) || value.media.count > 16) return false;
  return Array.isArray(value.links) && value.links.length <= 8
    && value.links.every(link => isObject(link) && typeof link.text === "string" && !!safeLink(link.href));
}

export function validBookmark(value: unknown): value is Bookmark {
  return validMembership(value) && isObject(value) && value.version === 1 && validSnapshot(value.snapshot)
    && postUrl(value.url)?.postId === value.postId && isNumber(value.savedAtMs) && isNumber(value.updatedAtMs);
}

export function validCategory(value: unknown): value is Category {
  return isObject(value) && value.version === 1 && isUuid(value.id) && typeof value.name === "string" && value.name.length <= 320
    && typeof value.nameKey === "string" && isNumber(value.revision) && value.revision > 0 && isNumber(value.count)
    && isNumber(value.createdAtMs) && isNumber(value.updatedAtMs);
}

export const validLibrary = (value: unknown): value is Library =>
  isObject(value) && value.version === 1 && isUuid(value.libraryId) && validHandle(value.expectedHandle) && isNumber(value.revision);

export const validReceipt = (value: unknown): value is Receipt =>
  isObject(value) && isUuid(value.operationId) && value.status === "committed" && typeof value.kind === "string"
  && isNumber(value.libraryRevision) && isNumber(value.createdAtMs) && isObject(value.result);

/** The category name rules the service enforces, checked before sending. */
export function validateName(value: string): string | null {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!name) return "Enter a category name.";
  if ([...name].length > 80 || new TextEncoder().encode(name).length > 320) return "Use 80 characters or fewer.";
  if (/[\u0000-\u001f\u007f]/u.test(name)) return "Use a name without control characters.";
  return null;
}

export const profileUrl = (handle: string) => `${ORIGIN}/${handle}`;
export const searchUrl = (query: string, tab?: string) =>
  `${ORIGIN}/search?q=${encodeURIComponent(query)}&src=typed_query${tab ? `&f=${tab}` : ""}`;
