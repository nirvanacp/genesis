import type { AppletContext } from "@genesis/sdk";
export const icons = {
  feed: "M3 10 12 3l9 7v11h-6v-7H9v7H3z", saved: "M6 3h12v19l-6-4-6 4z",
  folder: "M3 5h7l2 3h9v13H3z", search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
};
export function Icon({ name }: { name: keyof typeof icons }) { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>; }
export function Navigation({ context, current, categories, error }: { context: AppletContext; current: "saved" | "categories"; categories(): void; error(message: string): void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">
    <button onClick={() => { void context.sources.open("primary").catch(e => error(e.message)); }}><Icon name="feed" />Feed</button>
    <button aria-current="page" onClick={() => { if (current !== "saved") categories(); }}><Icon name="saved" />Saved</button>

  </nav>;
}
