# Before launch

- [ ] Verify a real Hacker News post with a disposable, authorized account or explicit production approval. Implementation verification must stop before publishing. No story or comment was published during phone verification.
- [ ] Configure release signing with an operator-owned key, then verify the signed release APK on a phone. The current release artifact is unsigned.
- [ ] Provision and verify an HTTPS bookmark backend reachable independently of the Mac/USB adb tunnel, including the release credential lifecycle. The verified local backend is a development setup; a phone Node runtime is not bundled.
- [ ] Complete the remaining Android qualification matrix: Past/Comments and remaining footer/account routes, source-network failures, TLS rejection, popups/downloads, renderer exit, TalkBack, font scaling and other supported devices/providers. Publisher Forward remains unqualified; deep publisher-site exploration was excluded from the remaining phone work at the user's request.

# Physical phone verification completed, 29 October 2026

Samsung Galaxy M30s, Android 11 / API 30, arm64-v8a, Android System WebView 156.0.8078.47. These passes qualify this device/provider and the debug build only.

- [x] Install, native shell, YC brand, footer icons and customized Top/New/Ask/Show/Jobs feeds.
- [x] HN story-background discussion navigation, app Back, article-reader entry and return to the customized opener.
- [x] Search placeholder; signed-out and authenticated Post forms without publication.
- [x] Sign-in/sign-out, Me, profile/settings, submissions, comments and HN favorites navigation without account edits.
- [x] Retained Post refresh after sign-in and sign-out. Fixed missing observers on login forms and incorrect account evidence from minimal headers; replayed both transitions on the final APK.
- [x] Unpublished draft recovery after tab eviction and explicit Discard. Verification draft cleared.
- [x] Fresh-install HTTPS backend import, bookmark create/read/edit/remove, tunnel interruption and retry. Verification bookmark removed; tunnel restored.
- [x] Saved selection and bookmark persistence after confirmed background process death and task recreation.
- [x] Simulated customization failure and Retry recovery; sampled native loading-cover recording.
- [x] Final TypeScript/package checks, debug/release builds and lint, debug signing verification and APK alignment checks.

Report: [223320-genesis-android-phone-verification.md](.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md).
