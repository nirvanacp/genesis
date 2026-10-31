# Genesis native isolation component verification

Scope: phase-5 prerequisite verification of `AppletPresentation.java`, 31 October 2026. This is a synthetic native component check. The component is not connected to the production host lifecycle; this report does not qualify X/HN, route transitions, authentication, forms, media or applet backend behavior.

Environment: `emulator-5554`, Google Android WebView `156.0.8078.47`, AndroidX WebKit `1.18.0`. No physical device was exercised. The existing `app.nirvana.genesis` installation was not replaced. A disposable `app.nirvana.genesis.isolationprobe` APK instantiated the production composition class with a red source WebView containing a canvas, an autofocus input and repeated script focus attempts, plus a green owned foreground. It contained no user records or credentials.

| Explicit phase | Frame observation | Fresh accessibility tree |
| --- | --- | --- |
| Initial foreground | Foreground green, no source red | Source text absent |
| Foreground DOM removed and background made transparent | No source red; provider may retain the last foreground frame | Source text absent |
| Foreground WebView removed | Opaque native backing, no source pixels | Source text absent |
| Source explicitly adopted for website presentation | Source visible | Source input present, as required for website use |
| Provider closed, source returned behind backing | Opaque native backing | Source text absent |

`WebViewCompat.isAudioMuted(source)` returned true after registration. This confirms the provider API state, not a physical audio-output measurement. The source was never rendered by copying HTML into the foreground. The native barrier stays independently owned and receives opaque colors even when passed a color with alpha. Visual callbacks check a transition epoch, current foreground identity, disposal state and current presentation before revealing.

An initial timer-driven capture attempt could cross phases while accessibility dumping waited for idle. It was discarded as phase evidence. The final probe used explicit Android intents for each phase and required a fresh successful accessibility dump. Synthetic screenshots and XML are held in `/tmp/genesis-isolation-probe/`; they are not private source evidence or committed product artifacts. The disposable package and its device-side XML outputs were removed after verification.

Android assemble/lint passed for the component. The root Rust format check reports pre-existing formatting differences in untouched `android/native/src/controller.rs`; changed Rust files were formatted, while unrelated formatting was preserved. Existing workspace typecheck, HN package validation, Rust check/clippy/test and temporary route parity checks passed in the preceding contract step. Rust suites currently contain zero tests.

Remaining prerequisites before an isolated runtime release: role-bound foreground/source creation and handshake, shared-renderer failure handling, native popup/fullscreen/permission policy, lifecycle/resource-budget integration and broker revocation before source adoption. The composition class alone cannot authorize website mode or prove those controls. SDK/broker/provider wiring, creator generation, full X/HN owned screens, updated customization instructions and real internal/external interaction qualification remain pending. No existing applet has yet been migrated or certified under API 3.
