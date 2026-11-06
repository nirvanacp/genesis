import { defineSource } from "@genesis/sdk/source";
import { validItemId, type FeedData, type InfoData, type ItemData, type UserData } from "../model";
import { bytes, clean, comment, comments, morelink, parsing, requireHnPage, richText, signedIn, story } from "./page";

/** Feed route ids, matching `applet.json`, with the title each feed shows. */
export const FEED_TITLES: Record<string, string> = {
  home: "Top", news: "Top", newest: "New", front: "Past", newcomments: "Comments", ask: "Ask", show: "Show",
  shownew: "New Show", asknew: "New Ask", jobs: "Jobs", best: "Best", active: "Active", from: "From site",
  submitted: "Submissions", threads: "Comments", favorites: "Favorites", hidden: "Hidden", upvoted: "Upvoted",
};
const INFO_ROUTES = ["formatdoc", "faq", "guidelines", "lists", "leaders"];

const pageTitle = (doc: Document, fallback: string) =>
  clean(doc.title.replace(/\s*\|\s*Hacker News$/, ""), 120) || fallback;

function feed(routeId: string) {
  return {
    extract(doc: Document): FeedData | null {
      if (parsing(doc)) return null;
      requireHnPage(doc);
      const stories = [...doc.querySelectorAll("tr.athing.submission")]
        .map(row => story(row, doc)).filter(entry => entry !== null).slice(0, 100);
      const commentRows = [...doc.querySelectorAll("tr.athing[id]")].filter(row => row.querySelector(".comment"));
      const listed = comments(commentRows, doc, bytes(stories));
      return {
        title: routeId === "home" || routeId === "news" ? "Top" : pageTitle(doc, FEED_TITLES[routeId]),
        stories,
        comments: listed.list,
        nextUrl: morelink(doc),
        commentList: stories.length === 0 && commentRows.length > 0,
      };
    },
  };
}

const item = {
  extract(doc: Document): ItemData | null {
    if (parsing(doc)) return null;
    requireHnPage(doc);
    const fat = doc.querySelector("table.fatitem");
    if (!fat) throw new Error(clean(doc.querySelector("#bigbox")?.textContent, 200) || "No such item.");
    const storyRow = fat.querySelector("tr.athing.submission");
    const commentRow = storyRow ? null : fat.querySelector("tr.athing[id]");
    const head = {
      story: storyRow ? story(storyRow, doc) : null,
      comment: commentRow ? comment(commentRow, doc) : null,
      text: richText(fat.querySelector(".toptext"), 12_000),
      canComment: signedIn(doc) && doc.querySelector("form[action='comment'] textarea") !== null,
    };
    const thread = comments(doc.querySelectorAll("table.comment-tree tr.athing.comtr"), doc, bytes(head));
    return { ...head, comments: thread.list, partial: thread.partial };
  },
};

const user = {
  extract(doc: Document): UserData | null {
    if (parsing(doc)) return null;
    requireHnPage(doc);
    const fields = new Map<string, Element>();
    for (const row of doc.querySelectorAll("#bigbox table tr")) {
      const cells = row.querySelectorAll(":scope > td");
      if (cells.length === 2) fields.set(clean(cells[0].textContent, 20).replace(/:$/, ""), cells[1]);
    }
    const name = clean(fields.get("user")?.textContent, 64);
    if (!name) throw new Error(clean(doc.querySelector("#bigbox")?.textContent, 200) || "No such user.");
    return {
      name,
      created: clean(fields.get("created")?.textContent, 40) || null,
      karma: clean(fields.get("karma")?.textContent, 20) || null,
      about: richText(fields.get("about") ?? null, 8_000),
    };
  },
};

const info = {
  extract(doc: Document): InfoData | null {
    if (parsing(doc) || !doc.body) return null;
    return {
      title: pageTitle(doc, "Hacker News"),
      parts: richText(doc.querySelector("#bigbox") ?? doc.body, 60_000),
    };
  },
};

export default defineSource({
  id: "primary",
  routes: {
    ...Object.fromEntries(Object.keys(FEED_TITLES).map(id => [id, feed(id)])),
    item,
    user,
    ...Object.fromEntries(INFO_ROUTES.map(id => [id, info])),
  },
  intents: {
    vote(intent) {
      if (!validItemId(intent.id)) throw new Error("Invalid item id");
      return [{ click: `#up_${intent.id}` }, { waitFor: `#up_${intent.id}.nosee, #un_${intent.id}`, timeoutMs: 8000 }];
    },
  },
  /** Hidden and upvoted lists need an account; HN shows its login form instead. */
  isSignedIn: doc => parsing(doc) || doc.querySelector("input[type=password]") === null,
});
