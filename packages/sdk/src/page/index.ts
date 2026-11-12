/**
 * `@genesis/sdk/page`: what an applet's page module imports. The module runs in the website page
 * next to the page agent; the generated page script calls `startAgent` with it. Importing this
 * entry does not touch the DOM.
 */
export { definePageModule, list, one, value } from "./module.js";
export type {
  Command,
  CommandContext,
  CommandSteps,
  ListOptions,
  ListReader,
  OneOptions,
  OneReader,
  PageModule,
  PageModuleDefinition,
  Reader,
  ValueOptions,
  ValueReader,
} from "./module.js";
export { startAgent } from "./agent.js";
export type { Evidence, Locator, PageStep, ReadSpec, UrlGuard } from "@genesis/core";
