import { collection, single, type Page } from "@genesis/sdk/adapter";
import { hnPage, moreLink, setVoted, story } from "./read.ts";

/**
 * A story list (`/`, `/news`). Each story is two table rows: `tr.athing.submission` holds the
 * rank and title, the next row holds the subtext with score, author, age and the vote state.
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
    more: single({ root: "a.morelink", read: moreLink }),
  },
  actions: {
    loadMore: () => ({ steps: [{ click: "a.morelink" }], navigates: true, expect: { page: "feed" } }),
  },
};
