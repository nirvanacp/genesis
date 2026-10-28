export type { ExecutionContext, QualificationContext, QualificationEntry } from "./protocol";
export type { AppletContext, ElementBinding, WatchOptions, ElementHandlers, MountOptions, Dispose } from "./runtime";
export { GenesisError } from "./rpc";
import type { AppletContext, Dispose } from "./runtime";
export interface AppletEntry { activate(context: AppletContext): void | Dispose; inspect?(): unknown }
export const defineApplet = (entry: AppletEntry): AppletEntry => entry;
export interface PageEntry { mount(context: AppletContext, container: HTMLElement): void | Dispose; inspect?(): unknown }
export function definePage(entry: PageEntry | AppletEntry): AppletEntry {
  // Retain activate compatibility for preserved inactive applet workspaces.
  return "mount" in entry ? { activate: context => entry.mount(context, context.root), inspect: entry.inspect } : entry;
}
export type { AppletStorage, StoredDocument, StorageBatch, StorageCheck, StoragePut, StorageKey, StorageChange } from "./storage";
