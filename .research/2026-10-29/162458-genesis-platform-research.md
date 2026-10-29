# Genesis platform research questions

Updated 29 October 2026. Architecture decisions live in ../../.architecture. This file records unresolved questions and experiments, not a competing roadmap. The historical source register is adjacent.

## Rendering and execution

Keep the original website runtime and mount owned UI around it. Compare alternatives only for a concrete failing workflow. A DOM snapshot cannot reproduce closures, event listeners, user activation, frames, or live media behavior. Shadow DOM provides style encapsulation, not a complete security boundary. Repeated competing website writes need bounded retries and visible failure.

The present TypeScript runtime was selected after HN Wasm loading failed qualification. Do not repeat a Rust/Wasm startup requirement without a new need. Qualify each browser provider's injection, messaging, navigation, and recovery APIs. A provider version alone is insufficient.

Experiments still needed: direct DOM access versus stronger execution isolation; recovery from an infinite loop; access to child frames and closed roots; retained original media behavior; multi-source and multiple-applet conflict policies. No universal site compatibility or browser-equivalent performance is established.

## Service transport and trust

The implemented service broker accepts applet-declared logical IDs and uses a user-configured HTTPS origin plus a separately stored token. Determine production permissions for LAN targets, trusted publishers, endpoint changes, credential rotation, certificate policy, and per-installation identity. Do not advertise the broker as total control over network activity by DOM-capable scripts.

Qualify configured service access from both injected HN and the packaged library on Android. Cover expired credentials, redirects, TLS failure, queue saturation, request timeout, lost acknowledgements, late replies after navigation, rotation, and renderer loss. A timed-out write can still commit. Future automatic retries need backend idempotency and a durable operation design.

## Application and backend lifetimes

Document-scoped callbacks currently end on navigation. A separate application execution context may coordinate several pages or background tasks later. Compare a bounded, restartable JS runtime against browser-owned execution only when needed. Specify persistence, cancellation, deadlines, suspension and resource budgets before promising background execution.

A separately deployed backend can use any compatible implementation and database. The supplied HN server is a single-tenant prototype with one bearer token per process. Multi-user accounts, tenancy, quotas, rate limiting and audit trails need explicit product requirements and server-side enforcement.

## Data portability and offline behavior

The new server does not automatically receive the device database. An explicit operator import preserves original keys and revisions into an empty server database. Qualify a consistent device-copy/export workflow without clearing user data. Future user-facing migration needs consent, progress, retry safety and conflict policy.

Offline use requires an applet-owned cache and synchronization design. Define authority, stale reads, conflict resolution and reconnection separately. Local Genesis storage may be used as a cache, but the platform should not define HN synchronization semantics.

## Packaging and creator independence

The strongest future acceptance is two independently installable applets with different backends working against one unchanged host binary. Current packaging remains APK-bundled. Research signed publisher identity, local forks, capability reapproval, immutable revisions, data migration, rollback, source availability and API version negotiation before calling installation independent.

Phone-only authoring also needs dependency resolution, compilation, source persistence and tooling. A browser compiler alone does not supply the entire workflow. A second active WebView or background context needs physical memory and battery measurements.

## Evidence discipline

Separate upstream documented behavior, design inference, implemented code, automated checks, emulator checks and physical-device results. Retain exact provider and tool versions. Recheck external links before drawing fresh platform conclusions. Existing report measurements remain scoped to their original build and local-storage data path.
