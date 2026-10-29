import { writeLocal } from "./local-state";
import { backendStorage } from "./backend";
import { defineApplet, type AppletContext, type ElementBinding, type Dispose } from "@genesis/sdk";
import theme from "./theme.css";
import sourceCss from "./source.css";
import { inspectTargets } from "./targets";
import { extractItem, STORY_SELECTOR } from "./extract-item";
import { CategoryRepository } from "./categories";
import { BookmarkRepository, bookmarkKey } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
import { bindDiscussionTile } from "./story-interaction";
import { mountAccountHub } from "./me";
import { preservePostDraft } from "./post";
interface Control { anchor: Element; binding: ElementBinding; button: HTMLButtonElement; dispose: Dispose; active: boolean; revision: number }
export default defineApplet({
  activate(ctx) {
    synchronizeAccount(ctx);
    ctx.styles.add("hn-editorial", theme + sourceCss);
    const section = ctx.sourceId === "post" ? "post" : ctx.sourceId === "me" ? "me" : "home";
    document.documentElement.classList.add("genesis-hn");
    ctx.onDispose(() => document.documentElement.classList.remove("genesis-hn"));
    if (section === "me" && ["/", "/news"].includes(location.pathname)) mountAccountHub(ctx);
    if (section === "post") preservePostDraft(ctx);
    if (location.pathname === "/item") {
      const row = document.querySelector(STORY_SELECTOR), item = row && extractItem(row);
      const anchor = row?.querySelector(".titleline");
      if (item?.articleUrl && anchor) {
        const visit = document.createElement("a"); visit.href = item.articleUrl; visit.textContent = "Visit website ↗"; visit.className = "visit-website";
        anchor.append(visit); ctx.onDispose(() => visit.remove());
      }
    }
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
        }).catch(error => { if (control.active) control.button.title = "Saved stories are temporarily unavailable. Tap to retry."; })
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
    ctx.onFocus(reloadCategories);
    const remove = (binding: ElementBinding) => {
      const control = controls.get(binding.id); if (!control) return;
      control.active = false; queue.delete(control); control.dispose(); controls.delete(binding.id);
    };
    const mount = (binding: ElementBinding) => {
      const anchor = binding.element.querySelector(".titleline"); if (!anchor) return;
      const button = document.createElement("button"); button.type = "button";
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v19l-6-4-6 4z"/></svg>';
      button.setAttribute("aria-label", "Save story to Genesis");
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const snapshot = extractItem(binding.element);
        if (snapshot?.itemId === binding.contentKey && binding.element.isConnected && !ctx.signal.aborted) openStoryDialog(ctx, snapshot);
      });
      const disposeMount = ctx.ui.mountAt(`story:${binding.id}`, anchor, { position: "append",
        css: theme + ":host{position:absolute;right:0;top:0;display:block}button{display:flex;align-items:center;justify-content:center;color:var(--accent);background:transparent;border:0;border-radius:8px;padding:10px;min-width:44px;min-height:44px;cursor:pointer}button[aria-pressed=true] svg{fill:currentColor}",
        render: container => { container.append(button); } });
      const disposeTile = location.pathname !== "/item" ? bindDiscussionTile(binding.element, () => extractItem(binding.element)?.discussionUrl ?? null) : () => {};
      const metadata = binding.element.nextElementSibling;
      const disposeMeta = location.pathname !== "/item" && metadata ? bindDiscussionTile(metadata, () => extractItem(binding.element)?.discussionUrl ?? null) : () => {};
      const dispose = () => { disposeTile(); disposeMeta(); disposeMount(); };
      const control = { anchor, binding, button, dispose, active: true, revision: 0 }; controls.set(binding.id, control); refresh(control);
    };
    ctx.watchElements("hn-stories", { selector: STORY_SELECTOR, attributes: ["id", "class", "href"], text: true, limit: 200,
      contentKey: element => extractItem(element)?.itemId ?? null }, {
      enter: mount,
      update(binding) {
        const control = controls.get(binding.id);
        const anchor = binding.element.querySelector(".titleline");
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

/** Website cookies stay in WebView. Only public account identity coordinates retained views. */
function synchronizeAccount(context: AppletContext): void {
  const profile = document.querySelector(".pagetop a[href^='user?id=']");
  const login = document.querySelector(".pagetop a[href^='login']");
  // Login forms and minimal submission headers observe changes without declaring a sign-out.
  const identity = profile ? profile.textContent?.trim() ?? "" : login ? "" : null;
  const initialIdentity = context.storage.get<{ identity: string }>("session", "hn-account").then(async ({ document }) => {
    if (context.signal.aborted) return null;
    if (identity !== null && document?.value.identity !== identity) {
      await writeLocal(context, "session", "hn-account", { identity });
    }
    return identity ?? document?.value.identity ?? "";
  }).catch(() => identity);
  context.onFocus(() => {
    void initialIdentity.then(async baseline => {
      const { document } = await context.storage.get<{ identity: string }>("session", "hn-account");
      if (!context.signal.aborted && document && document.value.identity !== baseline) location.reload();
    }).catch(() => {});
  });
}
