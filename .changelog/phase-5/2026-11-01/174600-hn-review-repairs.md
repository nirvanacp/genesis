# HN review repairs

- Goal: Address Greptile's private-cache disclosure and incomplete comment-collapse findings.
- Changes: Restrict failed-refresh retention to known public feed routes and discussions, excluding account screens, profiles and all user activity lists. Group flat depth-ordered comments into nested native details elements so closing a parent hides its descendants.
- Decisions: The user requested the three supplied review fixes. The agent chose a public-route allowlist over account matching because a failed reload cannot establish fresh account identity. Native disclosure preserves descendant open state and requires no parallel collapsed-state store. Source adapters, routes, records and website forms remain unchanged.
- Verification: HN TypeScript, applet check/build and whitespace checks passed. Disposable executable assertions passed private route exclusion, account exclusion, public feed retention and nested/sibling branch grouping. No test files were added. Device sign-out/failure and disclosure accessibility journeys were not exercised in this task.
