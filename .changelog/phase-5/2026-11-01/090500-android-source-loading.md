# Android source loading lifecycle

- Goal: bound unresolved content loading and distinguish framework failures from unsupported content.
- Changes: reducer-owned deadline tokens cover initial and subsequent loading, pause across suspension, reject stale callbacks and preserve genuine failures against unresolved observations. Main-frame failures carry fixed categories; adapter exceptions revoke their binding and report ADAPTER_FAILED. Debug inspection exposes a bounded content-free transition history. Adopted sources cancel their deadlines.
- Decisions: implemented the generic lifecycle portion of plan step 2 with existing API-3 authority and source isolation. No applet selectors or data caches entered the host.
- Verification: Rust clippy passed with warnings denied; Cargo test compiled with zero unit cases. Android offline assembly and lint passed. Device and deadline-behavior qualification remains scheduled with the final installed applets.
