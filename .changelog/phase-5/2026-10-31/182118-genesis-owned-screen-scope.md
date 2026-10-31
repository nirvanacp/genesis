# Owned screen lifetimes

- Goal: Reuse existing owned page modules within the persistent API-3 foreground without leaking subscriptions or React roots after navigation.
- Changes: Added the public createOwnedScope helper, which creates an independent AbortSignal and tracks screen-owned focus/storage/source subscriptions, Back handlers, UI mounts and dialogs. Screen disposal detaches the parent abort listener and releases all registered resources; document disposal also closes every child scope.
- Decisions: The agent keeps one foreground document across routes instead of creating another WebView for Saved/Search. Existing page activation and service/storage APIs remain reusable. Asynchronous screen mounts must recheck retirement before registering their disposer.
- Verification: SDK declaration/bundle compilation passed; the HN owned screen using the helper passed CLI check/build. Full repeated-route and modal interaction checks follow in the HN device qualification. No test files were added.
