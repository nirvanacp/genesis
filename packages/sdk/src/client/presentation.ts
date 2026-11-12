import type { Session } from "./session.js";

export interface WebsiteState {
  /** The context whose website is shown over the UI, or null when the UI is shown. */
  shown: string | null;
}

type WebsiteEvent = "viewWebsite" | "done" | "showContext";

/** Shows a context's website over the UI, or the UI again. The shell keeps drawing its bar, Done and menu. */
export interface Website {
  readonly state: WebsiteState;
  show(contextId: string): void;
  hide(): void;
  subscribe(listener: () => void): () => void;
  /**
   * The user's choices in the shell, each with the context id: View website from the menu, Done
   * on the website bar, and a link from outside opened in a context. Without a listener for an
   * event the client applies its default: `show` for `viewWebsite` and `showContext`, `hide` for
   * `done`.
   */
  on(event: WebsiteEvent, listener: (contextId: string) => void): () => void;
}

export function createPresentation(session: Session) {
  let state: WebsiteState = { shown: null };
  const listeners = new Set<() => void>();
  const userListeners: Record<WebsiteEvent, Set<(contextId: string) => void>> = {
    viewWebsite: new Set(), done: new Set(), showContext: new Set(),
  };
  const fail = (method: string) => (error: unknown) => console.error(`Genesis ${method} failed`, error);
  const first = session.bound.manifest.contexts[0].id;

  function set(shown: string | null) {
    if (state.shown === shown) return;
    state = { shown };
    for (const listener of [...listeners]) listener();
  }

  const website: Website = {
    get state() { return state; },
    show(contextId) {
      set(contextId);
      session.request("context.reveal", { id: contextId }).catch(fail("context.reveal"));
    },
    hide() {
      set(null);
      session.request("context.cover").catch(fail("context.cover"));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    on(event, listener) {
      userListeners[event].add(listener);
      return () => { userListeners[event].delete(listener); };
    },
  };

  function user(event: WebsiteEvent, fallback: (id: string) => void) {
    session.on(`user.${event}`, (data: { id?: string | null } | null) => {
      const id = data?.id ?? state.shown ?? first;
      const set = userListeners[event];
      if (set.size === 0) fallback(id);
      for (const listener of [...set]) listener(id);
    });
  }
  user("viewWebsite", id => website.show(id));
  user("showContext", id => website.show(id));
  user("done", () => website.hide());

  // Back: the newest handler runs first; the host waits `limits.backAnswerMs` for the answer.
  const backHandlers: (() => boolean)[] = [];
  session.on("back", () => {
    let handled = false;
    for (const handler of [...backHandlers].reverse()) {
      try {
        if (handler()) { handled = true; break; }
      } catch (error) {
        console.error("Genesis Back handler failed", error);
      }
    }
    session.request("back.handled", { handled }).catch(fail("back.handled"));
  });

  return {
    website,
    onBack(handler: () => boolean) {
      backHandlers.push(handler);
      return () => {
        const index = backHandlers.lastIndexOf(handler);
        if (index >= 0) backHandlers.splice(index, 1);
      };
    },
    leave() {
      session.request("back.leave").catch(fail("back.leave"));
    },
  };
}
