# Genesis README server operations

- Goal: Make local backend requirements and everyday operator commands visible in the repository README, as requested by the user.
- Changes: Added a section covering all-app and per-applet startup, device tunnels, shutdown/restart, prerequisites, stable ports, persistent state, first-time X account configuration, read-only validation/status and troubleshooting. Linked the factory service contract for future multi-server applets.
- Decisions: The user requested README instructions and a commit. The agent distinguished computer-side startup from Android provisioning because healthy local servers alone do not restore tunnels after reboot. Existing data remains authoritative; stopping servers preserves databases and credentials. Instructions retain the user's restriction on agents executing startup commands.
- Verification: Reviewed documented commands against the implemented launcher and creator CLI; read-only registry validation and `git diff --check` passed. No startup scripts or servers were executed. This documentation change does not establish live Android/backend readiness.
