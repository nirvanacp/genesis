/** Compatibility of the document API, independent of npm package semver. */
export const RUNTIME_API_VERSION = 1;
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
    title: string; brandAsset: string;
    sections: { id: string; label: string; sourceId: string; pageId?: string | null; icon?: 'home' | 'search' | 'post' | 'bookmark' | 'person' }[];
    choices?: { label: string; url: string; sourceId?: string }[];
  };
}
export interface Source {
  id: string; startUrl: string; origins: string[]; entry: string;
  homePaths?: string[]; customizedPaths?: string[];
  navigationRules?: { id: string; pathPrefix: string; action: 'block'; fallbackUrl: string }[];
}
export interface AppletBundle {
  formatVersion: 1; runtimeApiVersion: 1; sdkVersion: string;
  package: { manifest: Manifest; revision: string; assets: { path: string; sha256: string }[] };
}
