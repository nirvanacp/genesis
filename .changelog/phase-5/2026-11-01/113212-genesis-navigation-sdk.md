# Policy-driven SDK navigation

- Goal: Give applet authors host-resolved navigation and controls that communicate website handoffs.
- Changes: Added typed resolve/activate/subscribe APIs, a bounded per-visit cache with batched requests, React/vanilla controls with website cues, source scheduling and registration support for APIs 3/4, and scoped subscription cleanup. SDK 0.5.0 advertises both isolated runtime APIs.
- Decisions: Stale activation refreshes the decision but does not automatically retry website entry. Existing API-3 applets retain their original calls; schema-3 consumers use the new policy. Source adapters retain their limited context.
- Verification: SDK build and workspace typechecks passed. Temporary executable checks verified batching/deduplication, version invalidation and disposal. No permanent tests changed. Integrated API-4 applet/device acceptance remains in the migration stages.
