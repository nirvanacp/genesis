/** One entry of the foreground's own screen stack. */
export interface Screen {
  /** Unique per entry; scroll memory and cache lookups use it. */
  key: string;
  /** Declared screen name from `foreground.screens`. */
  id: string;
  params: Record<string, string>;
  /** The page this screen shows, when it shows one. */
  source: { sourceId: string; url: string; routeId: string } | null;
}

export interface NavigationState {
  /** Owned screens; the last one is current. Never empty. */
  stack: Screen[];
  /** The website sheet, when open. */
  website: { url: string } | null;
  leaveGuard: { message: string } | null;
}

export type NavigationEvent =
  | { type: "push"; screen: Screen }
  | { type: "replace"; screen: Screen }
  | { type: "root"; screen: Screen }
  | { type: "back" }
  | { type: "website.opened"; url: string }
  | { type: "website.changed"; url: string }
  | { type: "website.closed" }
  | { type: "guard"; guard: NavigationState["leaveGuard"] };

export type Effect =
  | { type: "host.website.close" }
  | { type: "host.back.unhandled" }
  | { type: "confirmLeave"; message: string };

export function initialState(rootScreen: Screen): NavigationState {
  return { stack: [rootScreen], website: null, leaveGuard: null };
}

export function currentScreen(state: NavigationState): Screen {
  return state.stack[state.stack.length - 1];
}

/**
 * Pure navigation reducer. Back closes an open website sheet first, then asks to confirm when
 * a leave guard is set, then pops, and on the root screen reports Back as unhandled.
 * Changing the current screen clears the leave guard, which belonged to the screen that set it.
 */
export function reduce(state: NavigationState, event: NavigationEvent): { state: NavigationState; effects: Effect[] } {
  switch (event.type) {
    case "push":
      return { state: { ...state, stack: [...state.stack, event.screen], leaveGuard: null }, effects: [] };
    case "replace":
      return { state: { ...state, stack: [...state.stack.slice(0, -1), event.screen], leaveGuard: null }, effects: [] };
    case "root":
      return { state: { ...state, stack: [event.screen], leaveGuard: null }, effects: [] };
    case "back":
      if (state.website) return { state: { ...state, website: null }, effects: [{ type: "host.website.close" }] };
      if (state.leaveGuard) return { state, effects: [{ type: "confirmLeave", message: state.leaveGuard.message }] };
      if (state.stack.length > 1) return { state: { ...state, stack: state.stack.slice(0, -1) }, effects: [] };
      return { state, effects: [{ type: "host.back.unhandled" }] };
    case "website.opened":
    case "website.changed":
      return { state: { ...state, website: { url: event.url } }, effects: [] };
    case "website.closed":
      return { state: state.website ? { ...state, website: null } : state, effects: [] };
    case "guard":
      return { state: { ...state, leaveGuard: event.guard }, effects: [] };
  }
}
