/**
 * `@genesis/sdk/router`: the presentation rules of Genesis as an optional helper. It decides per
 * context whether the applet or the website shows, keeps overlay screens, and orders Back.
 */
export { createRouter } from "./router.js";
export type { CurrentScreen, NavigateTarget, Router, RouterOptions, RouterRoute, RouteStatus } from "./router.js";
export type { ContextState as RouterContextState, CoordinatorState, Presentation, Screen, TableRoute } from "@genesis/core";
