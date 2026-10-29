import { discussionUrl, parseItemUrl, safeArticleUrl, validItemId } from "./item-url";
export interface StorySnapshot {
  itemId: string; discussionUrl: string; articleUrl: string | null;
  title: string; submitter: string | null; truncated: boolean; capturedAtMs: number;
}
export const STORY_SELECTOR = "tr.athing.submission[id]";
export function supportedRoute(url: string): boolean {
  try { const parsed = new URL(url);
    return parsed.origin === "https://news.ycombinator.com" && ["/", "/news", "/newest", "/ask", "/show", "/item"].includes(parsed.pathname);
  } catch { return false; }
}
function bounded(text: string, limit: number): { text: string; truncated: boolean } {
  const clean = text.replace(/\s+/g, " ").trim(); let result = "", bytes = 0;
  for (const char of clean) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > limit) return { text: result, truncated: true };
    result += char; bytes += size;
  }
  return { text: result, truncated: false };
}
/** Reads only a submission's title and its immediately associated metadata. */
export function extractItem(row: Element, pageUrl = location.href): Readonly<StorySnapshot> | null {
  if (!supportedRoute(pageUrl) || !row.matches(STORY_SELECTOR) || row.classList.contains("comtr") || !validItemId(row.id)) return null;
  const page = new URL(pageUrl);
  if (page.pathname === "/item" && parseItemUrl(pageUrl) !== row.id) return null;
  const title = row.querySelector<HTMLAnchorElement>(".titleline > a:first-child");
  if (!title) return null;
  const text = bounded(title.textContent ?? "", 2048); if (!text.text) return null;
  const next = row.nextElementSibling;
  const metadata = next && !next.matches("tr.athing") ? next.querySelector(".subtext") : null;
  // HN job promotions have age metadata but neither story score nor submitter.
  if (metadata && !metadata.querySelector(".score,.hnuser")) return null;
  if (metadata) for (const link of metadata.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    let parsed: URL; try { parsed = new URL(link.href, pageUrl); } catch { continue; }
    if (parsed.origin === page.origin && parsed.pathname === "/item" && parseItemUrl(parsed.href) !== row.id) return null;
  }
  const author = bounded(metadata?.querySelector(".hnuser")?.textContent ?? "", 256);
  const article = safeArticleUrl(title.getAttribute("href") ?? "", pageUrl);
  if (article && new URL(article).origin === page.origin && new URL(article).pathname === "/item" && parseItemUrl(article) !== row.id) return null;
  return Object.freeze({ itemId: row.id, discussionUrl: discussionUrl(row.id),
    articleUrl: article && parseItemUrl(article) !== row.id ? article : null,
    title: text.text, submitter: author.text || null, truncated: text.truncated || author.truncated,
    capturedAtMs: Date.now() });
}
