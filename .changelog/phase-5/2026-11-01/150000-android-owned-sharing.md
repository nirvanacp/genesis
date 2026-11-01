# Foreground native sharing

- Goal: Share a foreground link without opening a website reader.
- Changes: Added role-bound sharing dispatch, bounded URL/title validation, feature advertisement and Android chooser launch acknowledgement. Completions match generation, document and request identity.
- Decisions: A presented chooser does not mean a link was sent. Source, website/recovery and duplicate pending requests are rejected.
- Verification: Rust clippy passed, existing Cargo test command passed with zero tests, and Android debug assemble/lint passed. Chooser device qualification follows SDK integration. No social writes occurred.
