# SDK and manifest reference


Current implementation uses SDK `0.5.1` / tools `0.5.0`, runtime API `4`, manifest schema `3`, data schema `1` and bundle format `1`. Read [the isolated architecture and contract](isolated-applets.md) before building or changing an applet. Packages are supplied as packed artifacts, not a published registry service. The supported imports are `@genesis/sdk`, `@genesis/sdk/react` and `@genesis/sdk/manifest`. Bootstrap/runtime exports are tooling-only.

## Entry points and ownership

`defineSourceAdapter({adapters:string[],activate(context)})` runs inside a hidden source. `defineForeground({screens:string[],mount(context,root)})` runs inside a packaged document and renders owned UI. `definePage` remains useful for internal owned screen modules. `defineApplet` is a legacy entry point, not a new-app starter. Register exactly the manifest's screen/adapter names. A mismatch fails activation. Mount must finish initial local layout within five seconds; source network loading runs separately.

Source adapters use managed watchers, disposal and the source publish/command channel. The host rejects source storage/service/UI/navigation requests. Foregrounds own storage/services, modals, page navigation and explicit website presentation. SourceAdapterContext exposes observation, disposal, publication and validated command callbacks. Storage, services and UI helpers are absent from its authoring type; host role checks independently enforce authority. Do not call private bridge globals/JNI or import host source.

| API | Contract |
| --- | --- |
| `context.source.publish({state,data?,error?})` | Source only. Coalesced bounded JSON snapshots; 192 KiB maximum data envelope. Returns queue acknowledgement, not completion of an upstream action. |
| `context.source.subscribe(callback)` | Foreground receives the latest accepted `SourceSnapshot`, then replacements. Returns a disposer. |
| `SourceSnapshot` | `state`, `data`, `error`, actual `url`, `sourceId`, internal `pageId`, optional `sectionId`, `epoch`, and resolved route. Values are document-bound; applet validates content fields. |
| `context.source.command({name,payload?,epoch})` | Foreground-to-current-adapter read/navigation or qualified user-intent action request; promise acknowledges dispatch. No automatic mutation retry. |
| `context.source.onCommand(callback)` | Source callback; revalidate DOM, content key, account and route before acting. Returns a disposer. |
| `context.sources.open(sourceId,url?)` | Navigate a declared source inside the same applet. Exact source-origin permission required. |
| `context.pages.open(pageId)` | Select a declared internal owned page. Foreground renders that page from the snapshot destination. |
| `context.navigation.resolve(targets)` | Classify destinations without activation. See navigation guide for limits. |
| `context.navigation.activate({decision,intent})` | Revalidate and activate a decision with navigate/open-website intent. |
| `context.navigation.subscribe(callback)` | Observe accepted navigation mode/version/destination; dispose subscription on exit. |
| `context.webViews.close(sessionId?)` | Request Close and restore/revalidate the applet; the promise acknowledges dispatch, and Stay/Leave may still be pending. An expired session ID is rejected; owned navigation cannot replace an open reader. |
| `context.ui.openModal(key,render)` | Owned foreground dialog with native Back, focus and cleanup. Render is synchronous; return an unmount disposer. |
| `context.navigation.onBack(handler)` | Boolean or async boolean transient Back handler, with bounded native fallback. Return false to continue ordinary applet Back. |
| `context.navigation.setLeaveGuard({message})` | Guard applet-owned unsaved changes; pass null to clear. Website forms retain website-owned behavior. |
| `context.onFocus(callback)` | Revalidate records/account after provider return or app resume. Returns disposer. |
| `context.onDispose(callback)`, `context.signal` | Document cleanup/cancellation. Check content identity separately after async work. |
| `watchElements(key,options,handlers)` | Managed element discovery for source extraction. Options include selector, attributes, text, limit and contentKey. Handlers receive stable binding ID, element, contentKey and routeRevision. |
| `context.storage` | Foreground, optional `storage` capability. Applet-scoped get/list/atomic commit and onChanged. Keeps stable IDs across code updates. |
| `context.services.request(serviceId,{path,method,body?})` | Foreground, declared `services` capability/ID. Native credential-backed HTTPS request; response is `{status,body}`. Backend defines authorization, receipts and revisions. |

`mountReact(context,root,element)` returns first-layout readiness and disposes its React tree with the context. Source CSS/mount helpers remain available for legacy maintenance but cannot form an API-3 foreground. Do not style a source tree to make it the applet UI.

## Manifest and transport

Use `NavigationManifest`, `NavigationTarget`, `NavigationDecision` and `SourceSnapshot` from public exports. Schema-3 sources declare `id`, `startUrl`, `entry`, `routeContractId` and optional `homePaths`. Contracts contain `defaultSourceId`, exact `origins`, ordered titled `routes`, and mandatory `unmatched:"unsupported"`. Foreground names a declared page and its screen registrations. See the full schema/example in [isolated applets](isolated-applets.md). Legacy customization/path/exclusion arrays cannot appear on schema-3 sources.

The host derives applet, package, source, generation, document/channel and navigation identity. RPC has a 256 KiB envelope, 32 pending requests and a 15-second deadline. Retirement rejects pending SDK requests; it cannot undo a remote server commit. Source publication is bounded/coalesced and cannot address another applet. The framework does not serialize DOM nodes or execute source-provided HTML in the foreground.

## Data and services

Storage supports `get(collection,key)`, `list(collection,{limit,afterKey?})`, `commit({checks,puts,deletes})`, and `onChanged`. Check records carry `expectedRevision:number|null`; puts carry `{collection,key,value}`. Stored documents have key/value/revision/update time. Retain collection keys and data authority during rendering migrations. Use [services and data](services-and-data.md) for provisioning, server startup, secrets, backend authority and uncertain-write recovery.

No always-running source context, cross-source DOM access, independent cookie jars, public publisher trust, camera/microphone access or automatic authentication-popup compatibility is promised. Protected website interactions require real provider qualification. Report unsupported workflows explicitly instead of changing the requested product.

`SourcePublication<T>` and `SourceProblem` are public types. `error` has required safe `message`, optional fixed `code` and `retryable`; accepted snapshots include host-assigned `origin: "host" | "adapter"`. Codes are NETWORK, HTTP, SOURCE_TIMEOUT, ADAPTER_FAILED, SOURCE_RENDERER_FAILED, UNSUPPORTED_ROUTE, CONTENT_UNRECOGNIZED, UPSTREAM_FAILURE and ADAPTER_NOT_IMPLEMENTED. The existing state/method contract is unchanged. The host bounds unresolved content independently of source activation. See [observation semantics](patterns.md#loading-is-an-unresolved-observation).

## Compatibility and optional capabilities

| Component | Current target |
| --- | --- |
| SDK | 0.5.1 |
| Tools | 0.5.0 |
| Runtime API | 4 |
| Manifest schema | 3 |
| Data schema / bundle format | 1 / 1 |

Inspect installed artifacts and host supported-runtime list rather than assuming semver grants a capability. Schema-2/API-3 packages remain legacy-compatible. Direct `context.webViews.open({url})` is legacy API 3 only; API 4 rejects it with USE_DECLARED_NAVIGATION. New work uses [declared navigation](navigation.md).

Optional foreground `context.sharing.supported` and `context.sharing.shareUrl({url,title?})` require a capable host. Result means presented, not sent. Keep Copy/selectable-link fallback and follow [interaction semantics](interactions.md). Source action commands are applet-defined, not new SDK mutation APIs.
