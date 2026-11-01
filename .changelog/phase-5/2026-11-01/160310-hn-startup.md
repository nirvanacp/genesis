# HN foreground startup

- Goal: Restore Hacker News opening from the existing launcher entry.
- Changes: Removed the per-link source subscriptions introduced by the fragment-navigation change. Each link now derives current URL identity from its existing navigation subscription, preserving same-document fragment checks without extra source RPCs.
- Decisions: The agent traced the failure to RPC saturation: a 30-story feed mounts over 150 links, while each source subscription issued an independent bridge call against a 32-pending-request limit. Keep the fix applet-local and retain host route authority and the source isolation boundary.
- Verification: HN TypeScript, applet check/build and in-place installation passed. Actual emulator source contains 30 stories and the fixed owned foreground renders 30 stories with 152 anchors, instead of the native preparation error. Backend records/cookies preserved. Social actions and record writes were not submitted. Physical-device lifecycle remains unqualified.
