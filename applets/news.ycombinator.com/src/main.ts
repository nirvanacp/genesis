import { backendStorage } from "./backend";
import { defineApplet, type AppletContext, type ElementBinding, type Dispose } from "@genesis/sdk";
import theme from "./theme.css";
import sourceCss from "./source.css";
import { inspectTargets } from "./targets";
import { extractItem, STORY_SELECTOR } from "./extract-item";
import { CategoryRepository } from "./categories";
import { BookmarkRepository, bookmarkKey } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
import { mountSourceNavigation } from "./components/navigation";
import { mountAccountHub } from "./me";
import { preservePostDraft } from "./post";
interface Control { anchor: Element; binding: ElementBinding; button: HTMLButtonElement; dispose: Dispose; active: boolean; revision: number }
export default defineApplet({
  activate(ctx) {
    ctx.styles.add("hn-editorial", theme + sourceCss);
    const section = ctx.sourceId === "post" ? "post" : ctx.sourceId === "me" ? "me" : "home";
    const topLevel = section === "home" ? location.pathname === "/" || feedOptions.some(option => option.path === location.pathname)
      : section === "post" ? location.pathname === "/submit" || location.pathname === "/login" && new URLSearchParams(location.search).get("goto") === "submit"
      : ["/", "/news"].includes(location.pathname);
    if (topLevel) mountSourceNavigation(ctx, section);
    if (section === "home") mountFeedSelector(ctx);
    if (section === "me" && ["/", "/news"].includes(location.pathname)) mountAccountHub(ctx);
    if (section === "post") preservePostDraft(ctx);
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

const feedOptions = [
  { label: "Top", path: "/news" }, { label: "New", path: "/newest" },
  { label: "Past", path: "/front" }, { label: "Comments", path: "/newcomments" },
  { label: "Ask", path: "/ask" }, { label: "Show", path: "/show" },
  { label: "Jobs", path: "/jobs" },
];
function mountFeedSelector(ctx: AppletContext): void {
  const header = document.querySelector("#hnmain > tbody > tr:first-child > td");
  if (!header) return;
  const selected = feedOptions.find(option => option.path === (location.pathname === "/" ? "/news" : location.pathname));
  if (!selected) return;
  sessionStorage.setItem("genesis.hn.feed", selected.path);
  ctx.ui.mountAt("feed-selector", header, { position: "append", css: theme + `
    :host{display:block;font:14px Verdana,Geneva,sans-serif}.feed-choice{margin:4px 0 12px;position:relative}.feed-choice summary{list-style:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 12px;border-radius:10px;background:var(--wash);font-weight:700;cursor:pointer}.feed-choice summary::-webkit-details-marker{display:none}.feed-choice .options{position:absolute;top:48px;left:0;z-index:100;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 24px #0002;min-width:170px;padding:5px}.feed-choice button{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:8px;min-height:42px;padding:7px 12px;color:var(--ink);font:inherit}.feed-choice button[aria-current]{color:var(--accent);font-weight:700}`,
    render(container) {
      const details = document.createElement("details"); details.className = "feed-choice";
      const summary = document.createElement("summary"); summary.textContent = `${selected.label} stories  ▾`;
      const options = document.createElement("div"); options.className = "options";
      for (const option of feedOptions) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = option.label;
        if (option.path === selected?.path) button.setAttribute("aria-current", "page");
        button.onclick = () => { sessionStorage.setItem("genesis.hn.feed", option.path); void ctx.sources.open("primary", `https://news.ycombinator.com${option.path}`); };
        options.append(button);
      }
      details.append(summary, options); container.append(details);
    },
  });
}
