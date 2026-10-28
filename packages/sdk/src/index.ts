export type { ExecutionContext, QualificationContext, QualificationEntry } from "./protocol";
export type { AppletContext, ElementBinding, WatchOptions, ElementHandlers, MountOptions, Dispose } from "./runtime";
export { GenesisError } from "./rpc";
import type { AppletContext, Dispose } from "./runtime";
export interface AppletEntry { activate(context: AppletContext): void | Dispose; inspect?(): unknown }
export const defineApplet = (entry: AppletEntry): AppletEntry => entry;
// Retain activate compatibility for preserved inactive applet workspaces.
export const definePage = defineApplet;
export type { AppletStorage, StoredDocument, StorageBatch, StorageCheck, StoragePut, StorageKey, StorageChange } from "./storage";
