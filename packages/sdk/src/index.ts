export type { ExecutionContext, QualificationContext, QualificationEntry } from "./protocol";
export type { AppletContext, ElementBinding, WatchOptions, ElementHandlers, MountOptions, Dispose } from "./runtime";
export { GenesisError } from "./rpc";
import type { AppletContext, Dispose } from "./runtime";
export interface AppletEntry { activate(context: AppletContext): void | Dispose | Promise<void | Dispose>; inspect?(): unknown }
export const defineApplet = (entry: AppletEntry): AppletEntry => entry;
export interface PageEntry { mount(context: AppletContext, container: HTMLElement): void | Dispose | Promise<void | Dispose>; inspect?(): unknown }
export function definePage(entry: PageEntry | AppletEntry): AppletEntry {
  // Retain activate compatibility for preserved inactive applet workspaces.
  return "mount" in entry ? { activate: context => entry.mount(context, context.root), inspect: entry.inspect } : entry;
}
export type { AppletStorage, StoredDocument, StorageBatch, StorageCheck, StoragePut, StorageKey, StorageChange } from "./storage";

/** Wait for creator-owned initial layout, without waiting for website network activity. */
export function initialLayout(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export function serviceMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (["CONFIGURATION_REQUIRED", "AUTHENTICATION_FAILED", "CERTIFICATE_FAILED", "SERVICE_UNREACHABLE", "TIMEOUT", "SERVICE_FAILURE"].includes(code ?? ""))
    return "Saved stories are temporarily unavailable. Try again in a moment.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
