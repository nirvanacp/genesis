import { defineApplet, type ElementBinding, type Dispose } from "@genesis/sdk";
import { inspectTargets } from "./targets";
import { extractItem, STORY_SELECTOR } from "./extract-item";
import { BookmarkRepository, bookmarkKey } from "./repository";
import { openStoryDialog } from "./components/story-dialog";
interface Control { anchor: Element; binding: ElementBinding; button: HTMLButtonElement; dispose: Dispose; active: boolean; revision: number }
export default defineApplet({
  activate(ctx) {
    const repository = new BookmarkRepository(ctx.storage), controls = new Map<string, Control>(), queue = new Set<Control>();
    let running = 0;
    const pump = () => {
      while (running < 8 && queue.size && !ctx.signal.aborted) {
        const control = queue.values().next().value!; queue.delete(control);
        if (!control.active) continue;
        const revision = control.revision; running++;
        void repository.get(control.binding.contentKey).then(saved => {
          if (control.active && revision === control.revision && !ctx.signal.aborted) {
            control.button.textContent = saved ? "Saved · Edit" : "Save to Genesis";
            control.button.setAttribute("aria-label", saved ? "Edit Genesis bookmark" : "Save story to Genesis");
            control.button.title = "";
          }
        }).catch(error => { if (control.active) control.button.title = `Saved state unavailable: ${error.message ?? error}`; })
          .finally(() => { running--; pump(); });
      }
    };
    const refresh = (control: Control) => { control.revision++; queue.add(control); pump(); };
    const remove = (binding: ElementBinding) => {
      const control = controls.get(binding.id); if (!control) return;
      control.active = false; queue.delete(control); control.dispose(); controls.delete(binding.id);
    };
    const mount = (binding: ElementBinding) => {
      const anchor = binding.element.querySelector(".titleline > a:first-child")?.closest("td"); if (!anchor) return;
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Save to Genesis";
      button.setAttribute("aria-label", "Save story to Genesis");
      button.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const snapshot = extractItem(binding.element);
        if (snapshot?.itemId === binding.contentKey && binding.element.isConnected && !ctx.signal.aborted) openStoryDialog(ctx, snapshot);
      });
      const dispose = ctx.ui.mountAt(`story:${binding.id}`, anchor, { position: "append",
        css: ":host{display:inline-block;margin:4px 0 3px 7px}button{font:12px system-ui;color:#21583d;background:#edf5ee;border:1px solid #a7bfae;border-radius:5px;padding:4px 7px;min-height:28px;cursor:pointer}button:focus-visible{outline:2px solid #21583d;outline-offset:2px}",
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
    ctx.storage.onChanged(change => {
      for (const control of controls.values()) if (change.changes.some(c => c.collection === "bookmarks" && c.key === bookmarkKey(control.binding.contentKey))) refresh(control);
    });
    ctx.onDispose(() => { for (const control of controls.values()) { control.active = false; control.dispose(); } controls.clear(); queue.clear(); });
  }, inspect: inspectTargets,
});
