# Genesis backend migration validation

Created 29 October 2026, Asia/Kolkata. Scope: applet-owned HN server, generic host service transport, HN frontend adapter, and consolidated documentation. This records implementation checks, not device acceptance.

## Implemented

The independent Node server owns HN persistence. The HN client uses the generic services request capability rather than native SQLite. Native service settings select the HTTPS origin and protect a separate bearer token with Android Keystore encryption. The old device database remains intact. An explicit import tool copies supported legacy records into an empty backend database. No production server was deployed and no existing device bookmarks were uploaded, removed or modified.

## Passed checks

- npm run typecheck for all four SDK/applet workspaces.
- npm run check:packages and Node syntax checks for build/package scripts and all backend scripts.
- cargo fmt --all -- --check and cargo clippy -p genesis-android --locked -- -D warnings.
- Android :app:assembleDebug and :app:lintDebug with JDK 17. Gradle compiled the Java transport and built native libraries for arm64-v8a and x86_64. The generated APK is android/app/build/outputs/apk/debug/app-debug.apk.
- Disposable backend HTTP checks with a generated test token and temporary SQLite files: incorrect-token rejection; get/list/commit; stale revision rollback; collection and payload limits; persistence after restart; legacy key/revision preservation; populated-destination import refusal.
- All five renamed plans compare byte-for-byte with their previous tracked contents.
- Active documentation local links resolve. Archived plans retain their original text and links, and historical reports retain their original evidence. Source-register links are preserved provenance, not freshly checked upstream research.
- git diff --check after removing an extra trailing blank line.

No repository test files were created or changed. The temporary integration script lives outside the repository and does not constitute maintained automated test coverage.

## Not verified

No Android device was configured against a trusted HTTPS backend in this task. Native settings interaction, Keystore behavior on the target provider/device, phone-to-server requests, end-to-end Save/category/library behavior, activity recreation during network I/O, and physical-device performance remain unverified for this new data path. Earlier local-storage reports cannot establish these results.

The server is a personal single-tenant prototype. Production deployment, multi-user authorization, rate controls, user-facing data export/import, independent package installation, offline caching and automatic synchronization are not delivered by this migration. Follow the current architecture and HN operations guide before qualifying or extending those capabilities.
