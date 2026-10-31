/** Compatibility of the document API, independent of npm package semver. */
export const RUNTIME_API_VERSION = 2;
export interface Manifest {
  schemaVersion: 1;
  id: string;
  name: string;
  dataSchemaVersion: 1;
  sources: Source[];
  pages: { id: string; entry: string }[];
  actions: { id: string; label: string; pageId: string }[];
  capabilities: ('dom' | 'navigation-policy' | 'storage' | 'services')[];
  services?: string[];
  shell?: {
    title: string; brandAsset: string; colorScheme?: "default" | "neutral";
    sections: { id: string; label: string; sourceId: string; pageId?: string | null; icon?: 'home' | 'search' | 'post' | 'bookmark' | 'person' | 'notifications' }[];
    choices?: { label: string; url: string; sourceId?: string }[];
  };
}
export interface Source {
  id: string; startUrl: string; origins: string[]; entry: string;
  homePaths?: string[]; customizedPaths?: string[];
  customizedRoutes?: string[]; ordinaryRoutes?: string[];
  navigationRules?: { id: string; pathPrefix: string; action: 'block'; fallbackUrl: string }[];
}
export interface AppletBundle {
  formatVersion: 1; runtimeApiVersion: 1 | 2; sdkVersion: string;
  package: { manifest: Manifest; revision: string; assets: { path: string; sha256: string }[] };
}

/** API 3 authoring types. Runtime API 2 hosts cannot execute these packages. */
export interface RouteContract {
  id: string;
  origins: string[];
  routes: RouteRule[];
  unmatched: "unsupported";
}
export interface RouteRule {
  id: string;
  path: string;
  query?: Record<string, "present" | { equals: string }>;
  fragment?: { equals: string };
  result: { kind: "custom"; screen: string; adapter: string }
    | { kind: "website" | "blocked"; reason: string };
}
export type RouteResolution = { kind: "matched"; routeId: string; result: RouteRule["result"] }
  | { kind: "unsupported" | "external" | "blocked" };
export interface IsolatedSource {
  id: string; startUrl: string; routeContractId: string; entry: string; homePaths?: string[];
}
export interface IsolatedManifest extends Omit<Manifest, "schemaVersion" | "sources"> {
  schemaVersion: 2;
  sources: IsolatedSource[];
  routeContracts: RouteContract[];
  foreground: { pageId: string; screens: string[] };
}
