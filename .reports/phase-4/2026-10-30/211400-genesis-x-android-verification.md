# Genesis X Android verification

Phase-4, `proto/phase-4`, 30 October 2026, Asia/Kolkata. **Implementation is available as a development revision; authenticated X qualification and default APK enablement are incomplete.** X limited the emulator's login at the username step with “We’ve temporarily limited your login. Please try again later.” No password was entered into the emulator or saved in source, artifacts or a password manager. The upstream restriction was not bypassed or repeatedly retried.

## Environment and installed result

| Item | Recorded value |
| --- | --- |
| Android Studio device | Medium Phone API 37.0, `emulator-5554`, arm64 |
| WebView provider | `com.google.android.webview` 156.0.8078.47 |
| Physical phone | None connected; physical acceptance remains outstanding |
| Host | Debug APK assembled/linted and installed with replacement, preserving data/cookies |
| Contract | SDK/tools 0.3.0, runtime API 2, manifest/data/bundle schema 1; API 1 compatibility implemented |
| X applet | `x-bookmarks`, reviewed revision `4a26aca3272218f72e35eeb435ab0eee2e3fe0afc9b5d59f491efdf08526e1c5` accepted by debug importer |
| X service | Separate local HTTPS backend provisioned; helper returned ready during provisioning; final process status running, health not rechecked by status |
| Default APK selection | HN only; X deliberately remains outside `genesis.packages.json` pending the gate |

Website sessions and service credentials remain separate. Private service credentials/database/logs are outside the checkout. No source post, message, follow, like, repost, bookmark mutation, purchase, passcode or security-setting change was performed for this implementation verification.

## Completed checks

| Area | Verification and observable result |
| --- | --- |
| Workspace | `npm run typecheck`, `npm run check:packages`, X CLI check and reviewed bundle build passed. HN remains selected and valid. |
| Rust | Formatting, locked workspace check, strict clippy and existing `cargo test --workspace --locked` passed. Targets currently report zero tests; these are build/lint checks, not automated behavioral coverage. |
| Android | `:app:assembleDebug` and `:app:lintDebug` passed. APK installed without clearing website/session/application data. |
| Route contracts | Disposable checks covered literal/dynamic/final-wildcard matching, ordinary exclusions, encoded-path rejection and manifest validation. Full/SPA authenticated boundary behavior remains a manual gap. |
| Backend | Syntax checks plus disposable SQLite/domain and authenticated HTTP checks covered normalized-name duplicates, 50-category/10-membership limits, atomic membership changes, revision conflicts, empty-only deletion, receipt replay/payload mismatch, search and cursor invalidation. No permanent test files were added. |
| Frontend validation | Disposable checks covered decimal/canonical post URLs and bounded response shapes. Account-ticket checks covered one-use consumption, mismatch, expiry and idle absence of polling. |
| Owned Android UI | Actual library/editor/manager components rendered with synthetic posts in a separately identified `x-ui-qualification` applet. Category chooser, sheet layout, multi-category Save feedback, manager, modal Back and Saved native highlighting were observed. These checks substitute only the account/data providers, not the actual UI components. |
| Generic navigation | Disposable source Back callback consumed Back and updated its visible transient state. Native section navigation showed Stay/Leave; Stay preserved the source. After disabling the guard, Saved opened the packaged page with Saved highlighted. |
| HN regression | Existing feed, native five-section shell and original palette rendered. An external article opened the child reader with its origin. External content load/redirect/Close restoration was not fully qualified in this run. |
| Picker | Website file input opened Android's document picker and displayed the harmless Downloads text fixture. The creator-owned fixture input was disposed on Activity suspension/recreated on resume, so returned byte delivery was not established. Repeat using a website-owned form; this result is not a passing attachment test. |

Temporary preview source/bundle/fixtures were kept under `/private/tmp` and a separate debug applet identity. They are not production X records or shipped repository tests. The debug launcher still includes **X UI preview**, visibly separate from **X**. A harmless `genesis-picker-qualification.txt` fixture remains in emulator Downloads. Existing development applets and user data were preserved.

## Sanitized UI evidence

Android Studio's screenshot action captured only synthetic content. Its output preference was restored after capture. The first library image shows a page opened under the Home owner; the final image below shows the library opened from its Saved section.

- [Final Categories library with Saved highlighted](210200-x-verification-evidence/Screenshot_20261030_211318.png).
- [Category editor sheet](210200-x-verification-evidence/Screenshot_20261030_210312.png).
- [Earlier library preview](210200-x-verification-evidence/Screenshot_20261030_210215.png).

## Remaining acceptance and enablement gate

1. Resume ordinary X sign-in after the upstream restriction clears, without saving the password. Establish a genuine signed-in Android source baseline before assessing UI parity.
2. Exercise Home/Explore/Alerts/profile/conversation/reply/quote/media/Lists/Communities and source ordinary settings/chat/auth returns. Verify selectors, post recycling, complete/excerpt snapshots and source account identification.
3. Verify actual X/category save independence with an explicitly selected disposable post, real category service and account handshake. Confirm Saved source/library ownership, reader/detail return, filters and scroll.
4. Verify website-owned file delivery/cancellation, MIME/multiple selection, stale document results and composer native guards without submitting a post. Investigate any failure before advertising attachment support.
5. Qualify target-blank/t.co redirects, final origins, reader Close/opener scroll, unsupported handlers, video fullscreen and pause/resume behavior.
6. Qualify more-than-three-section eviction, rotation/process recreation, pending receipt recovery, network/401/malformed responses and actual account switching when an additional account is available.
7. Run physical-device checks, TalkBack/native chrome modality, keyboard/IME resize, dark mode and reduced-motion behavior. Source mobile-motion parity is not established by still screenshots or a successful build.
8. Once core acceptance passes, add X alongside HN to the APK selection, rebuild/reverify and commit enablement separately. Production hosting/signing/distribution remain separate scope.

The [execution plan](../../../.plans/phase-4/2026-10-30/195728-genesis-x-platform-execution-plan.md) now records implemented components and this incomplete gate. The [development guide](../../../.docs/phase-4/2026-10-30/210800-genesis-x-development-guide.md) provides safe continuation commands. Implemented navigation and persistence capabilities must not be represented as fully qualified X behavior while these checks remain outstanding.
