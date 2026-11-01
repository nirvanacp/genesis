# Source route metadata and shared subscriptions

- Goal: Complete the public metadata needed by applet migration without introducing local presentation routers.
- Changes: Bound source contexts now include the host-resolved route; SDK execution bindings and route result types expose it. Navigation subscription setup is shared once per foreground instead of issuing a host subscription for every link.
- Decisions: Integration showed that adapters need their accepted route at activation and large feeds must not exhaust the RPC pending limit when links subscribe. Both are framework responsibilities from the implementation plan.
- Verification: SDK build, workspace typechecks, native Clippy and offline Android build/lint passed. The installed API-4 X adapter rendered real profile and Subs models using host route metadata. Full final artifact acceptance remains in the release stage.
