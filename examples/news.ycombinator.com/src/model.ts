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
  /** The page offers an upvote arrow for it. Signed out, the arrow leads to HN's login page. */
  canVote: boolean;
  voted: boolean;
}

export interface CommentEntry {
  id: string;
  author: string | null;
  age: string | null;
  /** Nesting level from HN's indent, 0 for a top-level comment. */
  depth: number;
  /** The id of the comment it answers, from HN's "parent" link, or null at the top level. */
  parent: string | null;
  parts: TextPart[];
  /** The story a comment belongs to, when the item is itself a comment. */
  onStory: { id: string; title: string } | null;
  /** Thread links such as parent and context, as absolute HN URLs; only on an item that is a comment. */
  links: { label: string; url: string }[];
  /** HN shows a reply link for it. */
  canReply: boolean;
  canVote: boolean;
  voted: boolean;
}

/** The head of a discussion page: its story, or its comment when the item is a comment. */
export interface ItemHead {
  story: Story | null;
  comment: CommentEntry | null;
  text: TextPart[];
  /** HN shows its add-comment form on the page. */
  canComment: boolean;
}

/** HN's "More" link of a paged list or thread. */
export interface MoreLink {
  url: string;
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

/** HN's submit form: the values its fields hold and the message HN shows after a rejection. */
export interface SubmitForm {
  title: string;
  url: string;
  text: string;
  error: string | null;
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
