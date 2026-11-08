import { collection, single, type Page } from "@genesis/sdk/adapter";
import { validItemId, type ItemHead } from "../model.ts";
import { comment, hnPage, moreLink, richText, setVoted, story } from "./read.ts";

/** The item at the top of `/item?id=`: a story with its text, or a comment on its own page. */
function itemHead(table: Element): ItemHead {
  const row = table.querySelector("tr.athing");
  const head = row?.matches(".submission") ? story(row) : null;
  return {
    story: head,
    comment: row && !head ? comment(row, { links: true }) : null,
    text: richText(table.querySelector(".toptext")),
    canComment: table.querySelector("form[action='comment'] textarea") !== null,
  };
}

/**
 * The id of the item at the top of the page, which `setVoted` on the head acts on. A head without
 * an item row falls back to the `id` in the page's URL, so the record always has a key.
 */
function headId(table: Element): string {
  const row = table.querySelector("tr.athing")?.id;
  if (row) return row;
  const routed = new URLSearchParams(table.ownerDocument?.location?.search ?? "").get("id");
  return validItemId(routed) ? routed : "item";
}

/**
 * An item page. HN renders the thread flat: each comment row carries its depth in
 * `td.ind[indent]`, and its parent through the "parent" link, so the foreground rebuilds the tree.
 */
export const item: Page = {
  ready: hnPage,
  regions: {
    story: single({
      root: "table.fatitem",
      key: headId,
      entityType: "story",
      read: itemHead,
      actions: {
        setVoted: (table, args) => setVoted(table!.ownerDocument, headId(table!), args),
      },
    }),
    comments: collection({
      root: "table.comment-tree",
      items: "tr.athing.comtr",
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
};
