import { defineSource } from "@genesis/sdk/source";
import type { ExploreData, Trend } from "../model";
import { BUDGET_BYTES, bytes, clean, lines, parsing, postIntents, primaryColumn, readItems, readPeople, requireNoError } from "./page";

function trends(root: ParentNode): Trend[] {
  return [...root.querySelectorAll('[data-testid="trend"]')].slice(0, 30).map(element => {
    const text = lines(element).filter(line => line !== "·");
    // X shows the context ("Trending in Sports"), then the topic, then its post count.
    return { context: text[0] ?? "", name: clean(text[1] ?? text[0], 200), meta: text.slice(2).join(" · ").slice(0, 120) };
  }).filter(trend => trend.name);
}

/** Explore, search results and hashtags: trends, people and posts, whichever the page shows. */
function explore(doc: Document): ExploreData | null {
  const root = primaryColumn(doc);
  if (parsing(doc) || !root) return null;
  requireNoError(root);
  const found = { trends: trends(root), people: readPeople(root) };
  const posts = readItems(root, BUDGET_BYTES - bytes(found));
  const data = { ...posts, ...found };
  return data.items.length || data.trends.length || data.people.length || data.emptyText ? data : null;
}

export default defineSource({
  id: "explore",
  routes: {
    explore: { extract: explore },
    search: { extract: explore },
    hashtag: { extract: explore },
  },
  intents: postIntents,
});
