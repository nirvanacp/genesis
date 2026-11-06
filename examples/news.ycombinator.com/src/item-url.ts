const origin = "https://news.ycombinator.com";
export const validItemId = (id: unknown): id is string => typeof id === "string" && id.length <= 128 && /^[1-9][0-9]*$/.test(id);
export const discussionUrl = (id: string): string => {
  if (!validItemId(id)) throw new Error("Invalid HN story ID");
  return `${origin}/item?id=${id}`;
};
export function parseItemUrl(value: string, base = origin): string | null {
  try {
    const url = new URL(value, base);
    const ids = url.searchParams.getAll("id");
    return url.origin === origin && !url.username && !url.password && url.pathname === "/item"
      && ids.length === 1 && validItemId(ids[0]) ? ids[0] : null;
  } catch { return null; }
}
export function safeArticleUrl(value: string, base = origin): string | null {
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      && new TextEncoder().encode(url.href).length <= 2048 ? url.href : null;
  } catch { return null; }
}
