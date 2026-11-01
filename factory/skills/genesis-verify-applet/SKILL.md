---
name: genesis-verify-applet
description: Verify a Genesis applet using its public SDK, product choices and portable factory guidance.
---

# Verify a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [defaults](../../guides/defaults.md), [records](../../guides/applet-records.md) and the applet's current specs. Use [product scope](../../guides/product-scope.md), [isolation](../../guides/isolated-applets.md), [SDK reference](../../guides/sdk-reference.md), [navigation](../../guides/navigation.md), [interactions](../../guides/interactions.md), [design](../../guides/design.md), [patterns](../../guides/patterns.md), [services/data](../../guides/services-and-data.md) and [verification](../../guides/verification.md) for the affected components.

1. Read current requirements, choices, route/interaction inventories and exact installed revisions. Check shared-intent classification and consistency of authorized guidance changes. Do not infer expected behavior from a historical prototype.
2. Run existing static checks scoped to the changed applet. No test files without a coverage request. Distinguish pre-existing failures and static/synthetic/live/device evidence.
3. Check actual launcher/content/action/persistence/Back/Return flows, menu default or recorded override, pending frames, failures, large text/themes and keyboard layout. A menu must open its choices; a mutation requires observed results and separately authorized persistence qualification.
4. Check stale/recycled identities, repeated navigation/refresh, provider Return without new publication, transient Back ownership and hidden-source pixels/accessibility/focus/audio. Do not submit real social/account/purchase actions as routine QA.
5. Diagnose owner: applet, website, environment/backend or platform. Report-only work does not authorize fixes/device mutations. Keep required blocked journeys explicit, preserve user data and safely clean diagnostics. Record exact outcomes and limitations in current specs and change record when work changes files.
