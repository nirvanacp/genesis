# Scoped navigation return

- Goal: preserve a user intent across a source action that enters an ordinary route and retires its applet binding.
- Changes: added SDK return methods, validated in-memory guard/ticket state in Rust, and a generic covered location-replacement command in Android. No website-specific routes or selectors enter platform code.
- Decisions: keep this additive under API 2 with explicit rejection on older hosts. Match exact same-origin paths, expire after ten seconds, bound opaque state, retire old bindings, and consume only from the same generation at the eligible return URL. Section changes clear state. Location replacement avoids retaining the denied destination in Back history.
- Verification: SDK typecheck and existing Rust tests run before commit. Actual provider return and loaded-host compatibility require the integrated emulator qualification below; no new test files were added.
