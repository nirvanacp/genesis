/** Data the adapters publish and the screens render. Website text arrives as plain strings only. */

export const ORIGIN = "https://news.ycombinator.com";

/** A run of text with the formatting HN allows in comments and pages. */
export interface TextPart {
  text: string;
  href?: string;
  strong?: boolean;
  em?: boolean;
  code?: boolean;
}

export interface Story {
  id: string;
  title: string;
  /** The linked article, or null for Ask HN and other text posts. */
  articleUrl: string | null;
  domain: string | null;
  submitter: string | null;
  score: string | null;
  age: string | null;
  /** "123 comments", "discuss", or null for job posts. */
  comments: string | null;
  rank: string | null;
  /** True when the signed-in account can upvote it on this page. */
  canVote: boolean;
  voted: boolean;
}

export interface CommentEntry {
  id: string;
  author: string | null;
  age: string | null;
  depth: number;
  parts: TextPart[];
  /** The story a comment belongs to, on comment lists. */
  onStory: { id: string; title: string } | null;
  /** Thread links such as parent, next and context, as absolute HN URLs. */
  links: { label: string; url: string }[];
  canReply: boolean;
}

export interface FeedData {
  title: string;
  stories: Story[];
  comments: CommentEntry[];
  nextUrl: string | null;
  /** True when the page lists comments rather than stories. */
  commentList: boolean;
}

export interface ItemData {
  story: Story | null;
  /** The top comment when the item is itself a comment. */
  comment: CommentEntry | null;
  text: TextPart[];
  comments: CommentEntry[];
  /** True when more comments exist than fit in one snapshot. */
  partial: boolean;
  canComment: boolean;
}

export interface UserData {
  name: string;
  created: string | null;
  karma: string | null;
  about: TextPart[];
}

export interface InfoData {
  title: string;
  parts: TextPart[];
}

export interface AccountData {
  name: string;
  karma: string | null;
}

export interface SubmitData {
  /** Whether the page shows HN's submit form for the signed-in account. */
  form: boolean;
}

/** HN's limit for submission titles. */
export const TITLE_LIMIT = 80;

export const validItemId = (id: unknown): id is string =>
  typeof id === "string" && id.length <= 20 && /^[1-9][0-9]*$/.test(id);

export const validUserName = (name: unknown): name is string =>
  typeof name === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(name);

export const itemUrl = (id: string) => `${ORIGIN}/item?id=${id}`;
export const userUrl = (name: string) => `${ORIGIN}/user?id=${encodeURIComponent(name)}`;

/** An http(s) URL without credentials, resolved against `base`, or null. */
export function safeUrl(value: string, base: string = ORIGIN): string | null {
  try {
    const url = new URL(value, base);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
      && url.href.length <= 2048 ? url.href : null;
  } catch {
    return null;
  }
}

/** The item id of an HN item URL, or null. */
export function itemIdOf(value: string): string | null {
  try {
    const url = new URL(value, ORIGIN);
    const id = url.searchParams.get("id");
    return url.origin === ORIGIN && url.pathname === "/item" && validItemId(id) ? id : null;
  } catch {
    return null;
  }
}
