# Visit-scoped applet inspection

- Goal: Make the existing debug inspector useful for diagnosing isolated source variants during real applet qualification.
- Changes: Selecting Inspect current document in a debuggable host enables local WebView inspection for that applet visit, alongside bounded native lifecycle diagnostics. Destroying/leaving the visit disables it. Release hosts have no such developer action and startup keeps inspection disabled.
- Decisions: The agent needed actual X overlay structure to repair media extraction without guessed selectors. Inspection stays an explicit operator action rather than being enabled for every website by default. It does not grant source adapters new SDK capabilities.
- Verification: Android assembly and lint passed. Emulator developer selection displayed the visit-scoped notice and exposed the expected owned foreground and hidden-source targets through authorized local adb forwarding. No test files changed.
