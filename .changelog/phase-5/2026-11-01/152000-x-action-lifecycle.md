# X action lifecycle verification fixes

- Goal: Prevent a late source publication or uncertain foreground timeout from restoring expired action authority.
- Changes: Foreground tracking now retains navigation mode, cancels pending UI on source/epoch change and clears action descriptors after its watchdog. Check status uses the accepted source snapshot to reload safely. Mutation buttons expose busy state to accessibility.
- Decisions: Reading a fresh source is the recovery path after uncertainty; no automatic mutation retry.
- Verification: X TypeScript and applet build passed; no social action submitted. Final device checks are recorded in the verification report.
