import { collection, single, type Page } from "@genesis/sdk/adapter";
import { comment, hnPage, moreLink, setVoted, story } from "./read.ts";

/**
 * A list page. Story lists (`/`, `/newest`, `/ask`, ...) put each story in two table rows:
 * `tr.athing.submission` holds the rank and title, the next row holds the subtext with score,
 * author, age and the vote state. Comment lists (`/newcomments`, `/threads`) put one comment in
 * each `tr.athing` row, so a page fills one region or the other.
 */
export const feed: Page = {
  ready: hnPage,
  regions: {
    stories: collection({
      root: "#hnmain",
      items: "tr.athing.submission",
      key: row => row.id,
      entityType: "story",
      read: story,
      extent: row => [row.nextElementSibling],
      more: "a.morelink",
      actions: {
        setVoted: (row, args) => setVoted(row!.ownerDocument, row!.id, args),
      },
    }),
    comments: collection({
      root: "#hnmain",
      items: "tr.athing:not(.submission)",
      key: row => row.id,
      entityType: "comment",
      read: row => comment(row),
      more: "a.morelink",
      actions: {
        setVoted: (row, args) => setVoted(row!.ownerDocument, row!.id, args),
      },
    }),
    more: single({ root: "a.morelink", read: moreLink }),
  },
  actions: {
    loadMore: () => ({ steps: [{ click: "a.morelink" }], navigates: true, expect: { page: ["feed", "private-feed"] } }),
  },
};

/** Hidden and upvoted stories: HN shows them only to their owner and shows its login form otherwise. */
export const privateFeed: Page = { ...feed, requiresAccount: true };
