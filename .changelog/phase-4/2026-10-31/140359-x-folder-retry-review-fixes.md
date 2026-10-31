# X folder and retry review fixes

- Goal: Keep long posts eligible for the X folder fallback and unblock edits after a definite rejected retry.
- Changes: `folder-source.ts` bounds the complete one-use return state before arming the host handoff, reducing links and then text as needed and marking shortened text as an excerpt. `repository.ts` clears the matching pending operation on a definite retry rejection, while retaining uncertain operations for reconciliation.
- Decisions: The user requested the attached review fixes. The agent retained the full captured post for direct custom editing, and bounded only the navigation ticket because the host enforces a 16 KiB state limit. Retry cleanup follows the existing submit path.
- Verification: X workspace TypeScript typecheck, the standalone applet checker and bundle build through the local CLI entrypoint, and `git diff --check` passed. The `npx` wrapper stalled without output and was stopped; direct CLI commands completed. Real X source and backend flows were not rerun.
