# Retained document completions

- Goal: give storage and service operations the same document-identity delivery rules.
- Changes: both completion handlers use one active/retained lookup that verifies generation, document ID, channel, failure state, and applet identity where provided. Storage notifications still refresh the active document of the same applet; retained documents refresh on focus. Updated the factory contract.
- Decisions: completing a request submitted while active does not enable new hidden-view requests or persistent background execution. Retired/evicted destinations receive no replies, and a remote write may still have committed.
- Verification: a temporary executable compiled against the actual reducer accepted matching retained storage/service replies and rejected wrong-document and evicted-document completions. Rust check/strict clippy and Android debug assembly/lint passed. HN native shell was observed on the emulator with all five sections and generic choice accessibility text. No repository test files were created or modified.
