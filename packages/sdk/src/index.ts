/**
 * `@genesis/sdk`: the client a UI document uses to drive an applet's contexts. It depends on no
 * UI framework; only the default transport needs the WebView bridge.
 */
export { connect, openSession } from "./client/session.js";
export type { ConnectOptions, Genesis, Session } from "./client/session.js";
export { webViewTransport } from "./client/transport.js";
export type { Transport } from "./client/transport.js";
export type {
  CallOptions,
  ContextHandle,
  ContextState,
  Expect,
  InputCallOptions,
  PendingInput,
  Watch,
  WatchOptions,
} from "./client/context.js";
export { createWatchStore, emptyWatchValue } from "./client/watch.js";
export type { EmitResult, WatchStore, WatchValue } from "./client/watch.js";
export { css, field, record, role, text } from "./client/locator.js";
export type { Website, WebsiteState } from "./client/presentation.js";
export type { Services } from "./client/services.js";
export type { SavedState } from "./client/state.js";
export { GenesisError, ServiceError, serviceMessage } from "./types.js";
export type { ServiceResponse, Storage, StorageBatch, StorageChange, StorageKey, StoredDocument } from "./types.js";
export type {
  ActionOutcome,
  ActionResult,
  CallDetails,
  ElementState,
  ErrorBody,
  ErrorCode,
  Evidence,
  Field,
  Fields,
  InspectResult,
  Limits,
  ListValue,
  Locator,
  Manifest,
  NavigateMode,
  PageInfo,
  PageOp,
  Step,
  ReadSpec,
  ScrollPosition,
  ScrollTo,
  UrlGuard,
  ViewId,
} from "@genesis/core";
