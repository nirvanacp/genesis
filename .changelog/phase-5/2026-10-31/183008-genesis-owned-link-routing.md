# Owned link and source handoff fixes

- Goal: Repair framework issues discovered during HN migration before qualifying the applet.
- Changes: Standard user-activated anchors in owned pages now resolve to a declared custom destination or bridge-free website reader rather than being silently blocked. Adapter commands require the current source epoch and a live bound source. Repeated identical destinations no longer add redundant Back entries. Website adoption sends source retirement before revoking its channel so managed observers/timers dispose before original-site interaction.
- Decisions: The agent preserves normal semantic anchor behavior for reused owned components. Source commands acknowledge dispatch only and cannot target stale documents. Hidden source script navigation cannot claim a foreground user gesture.
- Verification: Rust clippy/check and Android assemble/lint passed. HN QA verified owned discussion, original-site form presentation and Close return without posting. Further anchor and command checks continue with integrated applet acceptance. No test files were added.
