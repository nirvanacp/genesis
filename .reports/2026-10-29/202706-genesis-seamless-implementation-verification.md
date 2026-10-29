# Genesis seamless applet implementation and verification

Scope: the approved 194953 seamless-experience plan, Android host, Rust controller/contracts, SDK, HN applet, creator tools and local HTTPS backend. Verified on emulator-5554 on 29 October 2026. Existing AGENTS.md changes and the input plan were preserved.

## Delivered components

| Commit | Change |
| --- | --- |
| 9fd89f0 | Manifest shell, section destinations, exact customized paths, hashed original YC artwork, package validation. |
| cda3297 | Native shell, bounded section sessions, separate external reader, navigation/visual readiness, async SDK activation, private service provisioning transport. |
| cc2e78a | Shared HN typography/spacing, story/background semantics, retired duplicate navigation, Saved states, account refresh, React commit helper. |
| e62f919 | Creator-owned service declaration, HTTPS server, managed local start/status/stop/provision command. |
| 31f09e3 | Saved detail ownership, source URL/history restoration, recovery fixes, device-side service-health acknowledgement. |
| 621235c | Revision-checked applet draft/account writes and form styling. |
| bf4dd27 | External reader links return to customized app routes; obsolete Saved navigation CSS removed. |

The native shell owns navigation and reserves insets once. Rust classifies exact customized paths independently from trust eligibility and root/detail status. Source/local documents reveal only after commit, SDK preparation and visual callback; external children reveal on committed frames. Reader Close restores the live underlying page. Three customized views are retained; eviction stores history/scroll and Post drafts live in applet-scoped host documents.

Local service startup is a creator operation. The user-facing app receives its service connection privately, stores encrypted credentials and has no Save-time setup prompt. The same frontend can use a trusted deployed or separately running phone HTTPS endpoint. No phone Node runtime or background service supervisor is bundled.

## Findings mapped to implementation

| Finding | Delivered behavior or qualification limit |
| --- | --- |
| P01/P02 | Compact rank/vote columns and native table relationships retained after the user requested the earlier feed layout; shared page margins, bounded readable width and native shell insets. Me no longer doubles body padding. Thread nesting remains meaningful. Full size/font matrix needs qualification. |
| P03 | Story/background helper routes blank space to discussion; nested links, Shadow DOM controls, modified clicks and text selection retain actions. Saved uses the same rule and a real title anchor. |
| P04 | Packaged original YC mark and Hacker News brand, right-aligned manifest feed choices, original source headers hidden. Account entry is Me. |
| P05 | Customized detail uses app Back and persistent tabs, with no URL bar. Ordinary destinations use native browser controls. |
| P06 | Working local HTTPS service command, private one-time import, Keystore token, scoped certificate trust and Android health request. Actual Save/read/edit/remove verified. |
| P07 | Initial loading, authoritative empty, loaded rows, refresh and error have distinct presentation. No false zero/More available claim after initial failure. |
| P08 | Shell-enabled apps have no floating creator plus. Creator tools remain behind the brand long-press. |
| P09/P10/P11 | Host cover plus epoch/visual gating; awaited activation and standard React layout-effect helper; child external view excludes departing pixels. Recording inspected as described below. |
| P12 | Separate child reader preserves exact discussion opener; Close observed returning directly. |
| P13 | Three retained customized sessions, independent generations/channels, paused/detached hidden views; private history/scroll bundles for eviction and Activity restoration. Forced process death remains unqualified. |
| P14 | Public draft fields use serialized, revision-checked host writes. Redirects never delete drafts. Explicit Discard clears fields. Automatic post-success deletion is conservative; no real post was made. |
| P15 | Story extraction includes Past/account lists and known story feeds. Comment lists and paid Jobs keep their own native links; the app does not invent story IDs/bookmarks for unsupported job markup. Every feed needs a final release route sweep. |
| P16 | Saved restores scroll after rows exist, refreshes on focus, preserves rows on refresh failure, and rejects stale request applications. Public account identity prompts retained HN source refresh. |
| P17 | Actual sign-in succeeded, Me showed the authenticated account links, and Post exposed the real submission form. No account settings, votes, comments or stories were submitted. |
| P18 | Recovery paths and isolation implemented; complete platform/provider/accessibility and fault-injection matrix remains a release qualification task. |

## Device evidence

- Cold launch showed the packaged YC logo, Home and five native tabs, with no login button in the brand header.
- Story blank area opened the correct HN item. Discussion had native Back, tabs and Visit website.
- Visit website opened mistral.ai in the isolated reader with origin, Back/Forward/Close and menu actions. Close restored the same live discussion.
- Saved -> Discussion showed Saved selected, and Back returned to the existing Saved library.
- Local Save produced an acknowledged bookmark and one Saved row. Editing completed; removal of the verification bookmark returned the library to its empty state. No upstream HN favorite action was used.
- Stop/start preserved bookmark data across backend restart. Android provisioning completed an authenticated HTTPS health request using its own transport.
- Stopping the backend produced a friendly temporary-unavailability message and Retry, without connection instructions, false counts or blocked navigation. The backend was restarted after this check.
- HN sign-in succeeded with privately supplied credentials. Credentials were not stored in source, package assets, this report or setup docs.
- The actual authenticated Post form was inspected without publishing. An unpublished title draft survived eviction after switching through Saved, Search and Me; explicit Discard cleared it.

Evidence lives in [genesis-seamless-evidence](genesis-seamless-evidence). The 49.98-second recording covers Home -> discussion -> external -> Close -> Saved -> Me -> Post and the start of Home return. Reviewed two frames per second and scene-change frames. Those reviewed frames show opaque loading states followed by customized content, and ordinary external rendering without the source behind it. This is evidence from one emulator run; it does not establish absence of every possible single-frame flash or provider race. A deliberately throttled/redirect/failure recording remains a release check.

## Commands and results

- `npm run typecheck`: passed for SDK and all existing applet workspaces.
- `npm run check:packages`: passed, including shell assets and creator service declaration validation.
- `cargo check --workspace`, `cargo fmt --all -- --check`, `cargo clippy --workspace -- -D warnings`: passed.
- `cargo test --workspace`: passed; the current workspace reports zero Rust unit/doc tests. This is not regression-test coverage.
- `node --check` for changed tool/backend scripts: passed.
- `./gradlew :app:assembleDebug :app:lintDebug --offline`: passed using configured toolchains. Existing warnings remain; no lint errors.
- `git diff --check`: passed.
- Debug APK installed with adb; local service start/stop/restart and native health import succeeded.

No test files were added or edited, per repository instructions.

## Remaining qualification and operational limits

Physical devices, all feed/footer/account routes, 320/360/tablet/landscape layouts, 200% font scale, dark mode, TalkBack, full keyboard/modal Back, forced process death, renderer termination, unsupported providers, TLS rejection/token faults, popups/downloads and all redirect/BFCache/SPA cases have not each been exercised in this run. Retained JavaScript state survives residency, not arbitrary eviction/process death. Device history persistence cannot serialize arbitrary website application state.

The real-post prelaunch TODO remains. Automatic successful-post draft deletion has not been claimed. Remote/phone HTTPS endpoint support uses the same transport contract; no deployed remote backend or phone-hosted runtime was provisioned here. Production installation/credential lifecycle remains separate from this debug import channel. The existing legacy bookmark database was neither migrated nor silently selected as fallback.

## Final design correction requested during verification

The user preferred the earlier compact Home layout and requested the navigation icons back. Home now uses continuous native HN table rows, small ranks and separators, without the separate rounded cards. Footer icons for Home, Search, Post, Saved and Me are declared in shell metadata and rendered as native vector drawables with labels and selected-state colors. The Save control is anchored to the title span rather than positioning the table cell.

The emulator exposed stale hardware-rendered table tiles: DOM geometry was correct but metadata was replaced by old painted titles. Temporary DOM-only diagnostics and software/hardware layer comparisons isolated this renderer behavior. Customized pages use software layers on ranchu/goldfish/generic emulators; physical devices retain their normal rendering and the independent external reader remains accelerated. Temporary diagnostic logging was removed. The final installed emulator screenshot shows complete metadata, clean compact rows and all five footer icons. Physical-device performance remains unqualified.

Final screenshot: [restored Home and footer](genesis-seamless-evidence/genesis-home-restored-final.png). The earlier navigation recording predates this final visual correction. Android build/lint, package checks, TypeScript and strict Rust checks passed after the correction.
