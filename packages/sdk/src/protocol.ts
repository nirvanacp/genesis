export interface ExecutionContext {
  runtimeApiVersion?: number;
  role?: "foreground" | "source";
  route?: import("./manifest").RouteResolution;
  instanceId: string;
  appletId: string;
  viewId: string;
  generation: number;
  binding: { kind: "source"; sourceId: string } | { kind: "page"; pageId: string };
}
export interface BootstrapConfig extends ExecutionContext { revision: string }
export interface RuntimeScope { root(): HTMLElement; dispose(): void; free(): void }
export interface QualificationContext {
  readonly binding: ExecutionContext;
  readonly signal: AbortSignal;
  readonly root: HTMLElement;
}
export interface QualificationEntry {
  activate(context: QualificationContext): void | (() => void);
  inspect?(): unknown;
}
