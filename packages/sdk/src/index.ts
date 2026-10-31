export type { ExecutionContext, QualificationContext, QualificationEntry } from "./protocol";
export type { AppletContext, ElementBinding, WatchOptions, ElementHandlers, MountOptions, Dispose } from "./runtime";
export { GenesisError } from "./rpc";
import type { AppletContext, Dispose } from "./runtime";
export interface AppletEntry { registration?: {screens?:string[];adapters?:string[]}; activate(context: AppletContext): void | Dispose | Promise<void | Dispose>; inspect?(): unknown }
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
    return "This feature is temporarily unavailable. Try again in a moment.";
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export { RUNTIME_API_VERSION } from "./manifest";
export type { Manifest, Source, AppletBundle } from "./manifest";
export interface ServiceResponse<T = unknown> { status: number; body: T }

export type { SourceSnapshot, SourceState } from "./runtime";
export type { IsolatedManifest, RouteContract, RouteRule } from "./manifest";
export function defineForeground(entry: PageEntry & { screens: string[] }): AppletEntry {
  return { ...definePage(entry), registration: {screens:entry.screens} };
}
/** Source adapters observe website DOM and publish data; foreground capabilities
 * are intentionally absent from their authoring context. The host enforces roles. */
export type SourceAdapterContext = Pick<AppletContext,'binding'|'signal'|'watchElements'|'onFocus'|'onDispose'> & {
  readonly sourceId:string;
  source:Pick<AppletContext['source'],'publish'|'onCommand'>;
  navigation:Pick<AppletContext['navigation'],'onChange'>;
};
export interface SourceAdapterEntry {adapters:string[];activate(context:SourceAdapterContext):void|Dispose|Promise<void|Dispose>;inspect?():unknown}
export function defineSourceAdapter(entry:SourceAdapterEntry):AppletEntry {
  return {registration:{adapters:entry.adapters},inspect:entry.inspect,activate(context){
    if(context.binding.runtimeApiVersion!==3||context.binding.role!=='source'||context.sourceId===null)throw new Error('Source adapters require an isolated source context');
    return entry.activate(context as SourceAdapterContext);
  }};
}
export {createOwnedScope} from './owned-scope';
