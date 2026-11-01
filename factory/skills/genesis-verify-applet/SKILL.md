---
name: genesis-verify-applet
description: Verify or diagnose a Genesis applet with package checks, TypeScript, source identity and cleanup checks, device navigation, and service/data failure checks. Use before handing off an applet or when it fails; distinguish applet defects from missing platform capabilities.
---

# Verify a Genesis applet

Apply [design and interaction fidelity](../../guides/design.md) to visual work. Compare the agreed native/mobile reference with the actual applet under comparable conditions. Inventory all changed controls and verify their results, dismissal, persistence and Back/Close as applicable. Screenshots, static checks and synthetic previews do not establish real interaction parity. Keep blocked acceptance requirements pending.

Read [the API-3 isolation contract](../../guides/isolated-applets.md), then [factory instructions](../../AGENTS.md), [product scope and clarification](../../guides/product-scope.md), and [verification](../../guides/verification.md). Use [SDK reference](../../guides/sdk-reference.md) to confirm expected behavior.

1. Read the latest user requirements and applet brief before choosing checks. Identify intended apps/launcher entries, exact revisions, selected build, SDK version and device/provider. Ask about unresolved material scope or data semantics before assuming expected behavior. Use the standalone checker for this applet; the Genesis root checker covers only the current APK selection, not every dev-installed applet.
2. Run existing static checks appropriate to the change. Inspect their output and separate pre-existing failures. Do not add test files or install unrelated tooling as a substitute for the existing workflow.
3. Verify complete required journeys from the actual launcher through source extraction, owned UI, service/write/read-back where relevant, detail and return. Also check duplicate mounts, content-key changes, cleanup, route changes and stale async results. Confirm the requested app count and preserve working neighboring apps. Internal pages/sources must not become extra delivered apps.
4. For stateful features, distinguish no records from failed reads. Check conflicts and uncertain writes with disposable applet data only. Never retry an ambiguous write blindly, change the authoritative store silently, or expose credentials in evidence.
5. Check the native-feeling requirements: usable navigation during failures, correct shell selection, initial UI before network data, touch targets, text scaling, TalkBack labels, and no duplicate source/app navigation. Record unperformed checks honestly.
6. Classify each failure as applet logic, source-site change, environment/backend, or platform contract. Give a minimal reproduction and file ownership. Fix within the user's authorized scope; a verification-only request produces findings without edits. Authentication failure or a missing device blocks affected verification; it does not approve reduced scope.
7. Label synthetic, component, integrated-source and device checks separately. A preview with substituted account/data providers cannot pass real authentication or integration acceptance. Inventory temporary installations and complete supported cleanup without erasing data. If cleanup cannot be completed safely, report it as unfinished delivery. Give every required flow a passed, failed, blocked or not-run result, with evidence or reason; only the user can approve deferral of a requirement.

The handoff states expected and actual behavior, changed files if any, commands/results, device evidence, and remaining blockers. A passing typecheck is not a live-site pass. Read-only verification does not authorize publishing content, modifying accounts, or deploying a backend.

Require a route-to-owned-screen/provider inventory for changed behavior. Verify internal query/path transitions, external website/Close, authentication/POST preservation, stale replies, failed loading and source accessibility/audio isolation. CSS and inline source controls cannot satisfy an API-3 foreground migration. Never claim source selectors or backend interactions verified from a typecheck or synthetic preview.

Require [evidence-based loading](../../guides/patterns.md#loading-is-an-unresolved-observation). Define readiness, empty, auth/challenge and failure evidence per route. Missing selectors or HTML completion never prove failure. Verify recorded transitions through slow initialization and real failures, including repeated navigation and provider return. Ordinary loading must not ask for Retry; compilation and final screenshots cannot qualify this behavior. Platform faults require a minimal sanitized reproduction; keep website selectors in applets.

Use [skeletons by default](../../guides/design.md#skeletons-are-the-default-pending-ui) across source transitions, owned libraries, account verification, pagination and dialog reads. Replace visible loading prose with destination-shaped neutral placeholders; keep assistive status, useful existing content and real failure/empty/confirmation copy. Verify a pending frame, completion, errors and Back/Close. This is a default design requirement, not a question the user must answer.


## Explicit navigation requirement

Read [navigation](../../guides/navigation.md). New work uses schema 3/API 4 and SDK/tools 0.5.0. Build establishes the route/action inventory before rendering. Customization updates the manifest, adapter/model, renderer and README acceptance table together. Verification exercises actual links, unknown tabs, redirects, query/hash changes, original-site actions, external pages, website Back and Return.

Do not maintain an independent presentation regex or use unknown/missing content as a website fallback. Resolve observed URL tabs and label website controls before activation. Use host route metadata for source screen selection. Preserve required custom workflows; inaccessible content stays required/blocked. Direct webViews.open examples elsewhere apply only to legacy API 3. A route/typecheck pass is not live navigation or source qualification. Never submit protected actions just to verify entry/return.
