import type { AppletContext } from "@genesis/sdk";

export type TabId = "home" | "search" | "post" | "saved" | "me";
const origin = "https://news.ycombinator.com";
export const tabs: { id: TabId; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "M3 10 12 3l9 7v11h-6v-7H9v7H3z" },
  { id: "search", label: "Search", path: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0" },
  { id: "post", label: "Post", path: "M12 4v16M4 12h16" },
  { id: "saved", label: "Saved", path: "M6 3h12v19l-6-4-6 4z" },
  { id: "me", label: "Me", path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0" },
];

export const icons = {
  folder: "M3 5h7l2 3h9v13H3z",
  search: tabs[1].path,
};
export function Icon({ name }: { name: keyof typeof icons }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[name]} /></svg>;
}

export function openTab(context: AppletContext, id: TabId): Promise<void> {
  switch (id) {
    case "home": return context.sources.open("primary");
    case "search": return context.pages.open("search");
    case "post": return context.sources.open("post");
    case "saved": return context.pages.open("library");
    case "me": return context.sources.open("me", origin + "/news");
  }
}

export function Navigation({ context, current, error }: { context: AppletContext; current: TabId; error(message: string): void }) {
  return <nav className="bottom-nav" aria-label="Main navigation">
    {tabs.map(tab => <button key={tab.id} aria-current={current === tab.id ? "page" : undefined}
      onClick={() => { if (current !== tab.id) void openTab(context, tab.id).catch(e => error(e.message)); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.path} /></svg>{tab.label}
    </button>)}
  </nav>;
}

export function mountSourceNavigation(context: AppletContext, current: TabId): void {
  context.ui.mountAt("hn-navigation", document.body, { position: "append", css: `
    :host{font:13px Verdana,Geneva,sans-serif}.nav{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:var(--card,#fff);border-top:1px solid var(--line,#ddd);display:flex;padding:4px 4px calc(4px + env(safe-area-inset-bottom))}.nav button{flex:1;min-width:0;border:0;background:transparent;color:var(--muted,#555);font:600 11px Verdana,Geneva,sans-serif;min-height:56px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:3px;padding:4px}.nav button[aria-current]{color:var(--accent,#b93800)}.nav svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.error{position:fixed;bottom:76px;background:var(--paper,#fff);color:var(--ink,#222);padding:12px}`,
    render(container) {
      const nav = document.createElement("nav"); nav.className = "nav"; nav.setAttribute("aria-label", "Main navigation");
      const feedback = document.createElement("div"); feedback.setAttribute("role", "status");
      for (const tab of tabs) {
        const button = document.createElement("button"); button.type = "button";
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${tab.path}"/></svg>`;
        button.append(tab.label);
        if (tab.id === current) button.setAttribute("aria-current", "page");
        button.onclick = () => { if (tab.id !== current) void openTab(context, tab.id).catch(error => {
          feedback.className = "error"; feedback.textContent = error.message;
        }); };
        nav.append(button);
      }
      container.append(nav, feedback);
    },
  });
}
