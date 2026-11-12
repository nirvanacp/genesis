import { COMPAT } from "@genesis/core";
import type { Session } from "./session.js";

/** What the UI saves across a recreation of its document: the router's state and the app's own. */
export interface SavedState {
  router?: unknown;
  app?: unknown;
}

const SAVE_DELAY_MS = 500;
const KEYS = new Set(["router", "app"]);

/**
 * `saved` is the state of the last `session.save` when it has this client's version and only the
 * keys `router` and `app`; anything else is dropped. `save` merges, waits `SAVE_DELAY_MS`, and
 * skips a save that would not change the stored value. `flush` saves at once.
 */
export function createSavedState(session: Session) {
  const stored = session.bound.session;
  const saved = stored && stored.version === COMPAT.sessionState && isSavedState(stored.state) ? stored.state : undefined;
  let current: SavedState = { ...saved };
  let sentJson = saved ? JSON.stringify(current) : "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const json = JSON.stringify(current);
    if (json === sentJson || session.retired) return;
    sentJson = json;
    session.request("session.save", { version: COMPAT.sessionState, state: current })
      .catch(error => console.error("Genesis session.save failed", error));
  }

  return {
    saved,
    save(value: SavedState) {
      current = { ...current };
      if ("router" in value) current.router = value.router;
      if ("app" in value) current.app = value.app;
      if (timer === null) timer = setTimeout(flush, SAVE_DELAY_MS);
    },
    flush,
  };
}

function isSavedState(value: unknown): value is SavedState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.keys(value).every(key => KEYS.has(key));
}
