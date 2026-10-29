import { backendStorage } from "./backend";
import { defineApplet, type ElementBinding, type Dispose } from "@genesis/sdk";
import theme from "./theme.css";
import sourceCss from "./source.css";
import { inspectTargets } from "./targets";
import { extractItem, STORY_SELECTOR } from "./extract-item";
import { CategoryRepository } from "./categories";
import { BookmarkRepository, bookmarkKey } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
interface Control { anchor: Element; binding: ElementBinding; button: HTMLButtonElement; dispose: Dispose; active: boolean; revision: number }
export default defineApplet({
  activate(ctx) {
    ctx.styles.add("hn-editorial", theme + sourceCss);
    ctx.ui.mountAt("hn-navigation", document.body, { position: "append", css: theme + `:host{font:14px system-ui}.nav{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:var(--card);border-top:1px solid var(--line);display:flex;padding:6px 12px calc(6px + env(safe-area-inset-bottom))}.nav button{flex:1;border:0;background:transparent;color:var(--muted);font:600 13px system-ui;min-height:58px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px}.nav button[aria-current]{color:var(--accent)}.error{position:fixed;bottom:80px;background:var(--paper);color:var(--ink);padding:12px}`,
      render(container) {
        const nav = document.createElement("nav"); nav.className = "nav"; nav.setAttribute("aria-label", "Main navigation");
        const feedback = document.createElement("div"); feedback.setAttribute("role", "status");
        for (const [name, path, action] of [
          ["Feed", "M3 10 12 3l9 7v11h-6v-7H9v7H3z", () => ctx.sources.open("primary")],
          ["Saved", "M6 3h12v19l-6-4-6 4z", () => ctx.pages.open("library")],
        ] as const) {
          const button = document.createElement("button"); button.type = "button";
          button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`; button.append(name);
          if (name === "Feed") button.setAttribute("aria-current", "page");
          button.onclick = () => { void action().catch(error => { feedback.className = "error"; feedback.textContent = error.message; }); };
          nav.append(button);
        }
        container.append(nav, feedback);
      } });
    const repository = new BookmarkRepository(backendStorage(ctx)), controls = new Map<string, Control>(), queue = new Set<Control>();
    let running = 0, categoryRead = 0;
    let categoryNames = new Map<string, string>();
    const pump = () => {
      while (running < 8 && queue.size && !ctx.signal.aborted) {
        const control = queue.values().next().value!; queue.delete(control);
        if (!control.active) continue;
        const revision = control.revision; running++;
        void repository.get(control.binding.contentKey).then(saved => {
          if (control.active && revision === control.revision && !ctx.signal.aborted) {
            const names = saved?.value.categoryIds.map(id => categoryNames.get(id)).filter(Boolean) ?? [];
            control.button.title = saved ? `Saved${names.length ? ` in ${names.join(", ")}` : ""}. Change bookmark` : "Save story";
            control.button.setAttribute("aria-pressed", String(!!saved));
            control.button.setAttribute("aria-label", saved ? "Edit Genesis bookmark" : "Save story to Genesis");

          }
        }).catch(error => { if (control.active) control.button.title = `Saved state unavailable: ${error.message ?? error}`; })
          .finally(() => { running--; pump(); });
      }
    };
    const refresh = (control: Control) => { control.revision++; queue.add(control); pump(); };
    const reloadCategories = () => {
      const version = ++categoryRead;
      void new CategoryRepository(backendStorage(ctx)).read().then(snapshot => {
        if (ctx.signal.aborted || version !== categoryRead) return;
        categoryNames = new Map(snapshot.categories.map(category => [category.value.id, category.value.name]));
        for (const control of controls.values()) refresh(control);
      }).catch(() => { /* Bookmark controls remain usable when category labels cannot be read. */ });
    };
    reloadCategories();
    const remove = (binding: ElementBinding) => {
      const control = controls.get(binding.id); if (!control) return;
      control.active = false; queue.delete(control); control.dispose(); controls.delete(binding.id);
    };
    const mount = (binding: ElementBinding) => {
      const anchor = binding.element.querySelector(".titleline > a:first-child")?.closest("td"); if (!anchor) return;
      const button = document.createElement("button"); button.type = "button";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v19l-6-4-6 4z"/></svg>';
      button.setAttribute("aria-label", "Save story to Genesis");
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const snapshot = extractItem(binding.element);
        if (snapshot?.itemId === binding.contentKey && binding.element.isConnected && !ctx.signal.aborted) openStoryDialog(ctx, snapshot);
      });
      const dispose = ctx.ui.mountAt(`story:${binding.id}`, anchor, { position: "append",
        css: theme + ":host{position:absolute;right:0;top:0;display:block}button{display:flex;align-items:center;justify-content:center;color:var(--accent);background:transparent;border:0;border-radius:8px;padding:10px;min-width:44px;min-height:44px;cursor:pointer}button[aria-pressed=true] svg{fill:currentColor}",
        render: container => { container.append(button); } });
      const control = { anchor, binding, button, dispose, active: true, revision: 0 }; controls.set(binding.id, control); refresh(control);
    };
    ctx.watchElements("hn-stories", { selector: STORY_SELECTOR, attributes: ["id", "class", "href"], text: true, limit: 200,
      contentKey: element => extractItem(element)?.itemId ?? null }, {
      enter: mount,
      update(binding) {
        const control = controls.get(binding.id);
        const anchor = binding.element.querySelector(".titleline > a:first-child")?.closest("td");
        if (control && anchor !== control.anchor) { remove(binding); mount(binding); }
        else if (control) refresh(control);
      }, leave: remove,
    });
    backendStorage(ctx).onChanged(change => {
      if (change.changes.some(c => c.collection === "categories")) reloadCategories();
      for (const control of controls.values()) if (change.changes.some(c => c.collection === "bookmarks" && c.key === bookmarkKey(control.binding.contentKey))) refresh(control);
    });
    ctx.onDispose(() => { for (const control of controls.values()) { control.active = false; control.dispose(); } controls.clear(); queue.clear(); });
  }, inspect: inspectTargets,
});
