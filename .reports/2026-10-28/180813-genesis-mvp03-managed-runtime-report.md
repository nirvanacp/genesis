# Genesis MVP-03 managed runtime

MVP-03 is implemented and verified for the authorized emulator progression. Scope: `packages/sdk/`, shared contracts, generic Android controller/adapters and qualification text. HN bookmarks and native storage remain later stages.

## Implementation

The TS runtime owns one document observer, coalesced frame reconciliation, up to 200 element bindings per watcher, separate element/content identity, keyed styles and Shadow DOM mounts. It excludes owned nodes, discovers changed subtrees, revalidates retained targets and calls leave before enter when a row changes identity. Three removals within a second suspend an effect. Disposal aborts tasks and releases callbacks, timers, observers, bindings, mounts and styles despite creator cleanup exceptions.

The SDK provides route callbacks, owned modal rendering, native Back dismissal and typed source/page navigation. RPC has 32 pending requests, a 256 KiB UTF-8 envelope limit, five-second timeout, explicit errors and retirement rejection. Native validates declared destinations and origins, replies before deferred view replacement, and rejects stale deferred destinations. Native modal dismissal has a document-bound 300 ms deadline and renderer recovery. Static manifest path rules now have build/native validation and redirect handling; HN declares none. Dynamic query-value policy remains outside scope.

Reused components are the qualified nonce challenge, single-view scheduler, Java adapter, source registry, packaged local-page loader, native recovery, existing React entry and toolchain. Inactive applets and the Wasm crate remain intact. Browser cookies and website storage remain independent and are not cleared.

## Verification

- `npm run typecheck`, `npm run check:packages`, `cargo fmt --all -- --check`, native Clippy with `--locked -- -D warnings`, and `git diff --check` passed.
- Android `:app:assembleDebug :app:lintDebug` passed with JDK 17. Both native ABIs built. The normal-entry final rebuild passed in one second.
- A temporary manual probe in the actual isolated HN realm passed absent/inserting/replaced/recycled targets, text updates, duplicate watcher/mount rejection, repeated-removal suspension, route callbacks, cleanup exceptions and zero retained effects/bindings/watchers/disposers/routes after disposal.
- Live modal opening/native Back left the HN page in place. An undeclared origin returned `INVALID_ARGUMENT`. Bound `pages.open` activated the packaged React page.
- Background through Android Home and resume reactivated one local React root. Landscape/portrait rotation retained the current source and native controls.
- A deliberate bounded renderer stall left native controls usable; native termination recovered ordinary HN. No claim is made that TypeScript can preempt a loop in the renderer.
- Temporary stdin checks against actual native controller modules passed nonce/ready validation, stale messages, destination acknowledgement ordering, modal Back and late deadlines, explicit sequential selection of two declared sources, and rejection of callbacks from the destroyed view.
- A Node stdin check against the bundled real RPC client passed pending/message limits, stale and matching replies, retirement and closed-client rejection.

The probes were temporary files under `/tmp`, imported only in verification APKs. The normal HN entry was restored and rebuilt before commit; no automated test file was added to the repository. Numerical performance and physical hardware remain MVP-07 checks. Back/BFCache binding behavior reuses the verified handshake; this does not claim every Android navigation uses BFCache.

## Next stage

MVP-04 may implement the generic native SQLite worker and SDK storage. Authentication is not a prerequisite. New Android Studio `.idea` files present at session start remain unrelated and uncommitted.
