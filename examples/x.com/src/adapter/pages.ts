import { collection, single, type ActionSpec, type Page } from "@genesis/sdk/adapter";
import {
  account, clean, currentAccount, failureText, hash, ITEMS, itemKey, personKey, POST, readItem, readPerson, readPhoto,
  readProfileHeader, readPost, readTrend, toggle,
} from "./read.ts";

/**
 * X's pages. X is a single-page app: `ready` waits until the main column shows items, X's
 * empty state, or its error message, which becomes the page's error.
 */

const MAIN = "main";
const EMPTY = '[data-testid="emptyState"]';

function shows(doc: Document, content: string): boolean {
  if (doc.readyState === "loading") return false;
  const main = doc.querySelector(MAIN);
  if (!main) return false;
  const failure = failureText(main);
  if (failure) throw new Error(failure);
  return main.querySelector(`${content}, ${EMPTY}`) !== null;
}

const postActions = {
  setLiked: (article: Element | null, args: { liked?: unknown }) => toggle(article, args?.liked, { on: "like", off: "unlike" }),
  setBookmarked: (article: Element | null, args: { bookmarked?: unknown }) =>
    toggle(article, args?.bookmarked, { on: "bookmark", off: "removeBookmark" }),
};

/** A list of posts and notifications. X drops rows that scroll far away, so the region keeps them. */
const timeline = (items = ITEMS) => collection({
  root: MAIN,
  items,
  key: itemKey,
  entityType: "post",
  read: readItem,
  virtualized: true,
  actions: postActions,
});

/** X's empty-state heading, when it shows one. */
const empty = single({ root: EMPTY, read: root => clean(root.textContent, 200) || null });

/** The key of the last item in the main column. */
const lastKey = (doc: Document) => {
  const items = doc.querySelectorAll(`${MAIN} :is(${ITEMS})`);
  return items.length ? itemKey(items[items.length - 1]) : null;
};

/**
 * Scrolls X's page to the end, which makes X load the next rows. A new last row is the evidence;
 * a page whose last row stays put has nothing more to load right now.
 */
function loadMore(): ActionSpec {
  const before = lastKey(document);
  return { steps: [{ scroll: { target: "window", to: "end" } }], until: doc => lastKey(doc) !== before, deadlineMs: 10_000 };
}

/** Home, Notifications, Bookmarks and Likes: they belong to an account; X shows its login button otherwise. */
export const timelinePage: Page = {
  ready: doc => shows(doc, ITEMS),
  requiresAccount: true,
  regions: { timeline: timeline(), empty },
  actions: { loadMore },
};

/** A post with its thread. The screen splits ancestors and replies at the post the URL names. */
export const postPage: Page = {
  ready: doc => shows(doc, POST),
  regions: { thread: timeline(POST), empty },
};

/** One-segment X paths that `/:handle` matches but that are not profiles. */
const RESERVED = new Set([
  "home", "explore", "notifications", "messages", "settings", "i", "login", "logout", "signup", "tos", "privacy",
  "about", "download", "compose", "search", "jobs", "communities", "premium", "lists", "bookmarks", "account",
]);

export const profilePage: Page = {
  ready: doc => {
    const handle = doc.location.pathname.split("/")[1] ?? "";
    if (RESERVED.has(handle.toLowerCase()) || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new Error("This X page isn't a profile");
    return shows(doc, `${POST}, [data-testid="UserName"]`);
  },
  regions: { header: single({ root: MAIN, read: readProfileHeader }), posts: timeline(), empty },
  actions: { loadMore },
};

/** Explore, search results and hashtags: trends, people and posts, whichever the page shows. */
export const explorePage: Page = {
  ready: doc => shows(doc, `${POST}, [data-testid="trend"], [data-testid="UserCell"]`),
  regions: {
    trends: collection({ root: MAIN, items: '[data-testid="trend"]', key: element => `t:${hash(clean(element.textContent, 300))}`, read: readTrend }),
    people: collection({ root: MAIN, items: '[data-testid="UserCell"]', key: personKey, read: readPerson }),
    results: collection({
      root: MAIN, items: POST, key: itemKey, entityType: "post",
      read: element => readPost(element), virtualized: true, actions: postActions,
    }),
    empty,
  },
  actions: { loadMore },
};

/** The photo viewer X opens over the post. Swiping moves the photos, so their size and position are watched. */
export const mediaPage: Page = {
  ready: doc => doc.readyState !== "loading" && doc.querySelector('[data-testid="swipe-to-dismiss"]') !== null,
  regions: { photos: single({ root: '[data-testid="swipe-to-dismiss"]', read: readPhoto, measure: true }) },
};

/** `/settings/account`, read only for the signed-in handle. */
export const accountPage: Page = {
  ready: doc => account(doc) !== undefined,
  requiresAccount: true,
  regions: { handle: single({ root: "body", read: root => currentAccount(root.ownerDocument) }) },
};
