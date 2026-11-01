# X and HN interaction delivery verification

Implemented against the [interaction plan](../../../.plans/phase-5/2026-11-01/122058-x-interaction-and-navigation-plan.md). SDK 0.5.1, tools 0.5.0, runtime API 4 and manifest schema 3. Final code is installed in the existing app.nirvana.genesis debug host on emulator-5554. Stable applet/source/page/service identities, source cookies and backend records were preserved. No services were started or reset.

## Delivered behavior

X Like and Bookmark are owned buttons with visit/account/entity-bound desired-state requests and observed results. Repost opens owned options and uses a scoped source confirmation. Follow uses observed relationship controls; ambiguous, missing or localized confirmation stays uncertain. Share opens an owned sheet with Copy link and optional native Android sharing. Reply uses the inspected contextual composer URL; Post/Quote/editors remain website workflows. Views remains custom navigation. Media shares the action renderer and offers the live post when its source controls are absent. Cached rows cannot confer action authority. More/trend/media options open owned controls. Failed resolution offers Retry; load-more completion follows content observation instead of a success timer.

HN preserves local Save/category/collapse. Numeric comment scrolling now requires ordinary same-document origin/path/query identity; explicit original-site navigation cannot be swallowed. Combined Vote/comment copy now describes opening the original discussion.

The factory guide, instructions and all three skills distinguish navigation from interaction outcomes. The exported kit includes the new guide. Native sharing contains no X/HN selectors or entity logic.

## Checks and observations

| Check | Result and limits |
| --- | --- |
| Workspace TypeScript and package checks | Passed; includes inactive YouTube dependency compatibility only, with no activation |
| X and HN standalone check/build | Passed |
| Rust clippy with warnings denied | Passed |
| Cargo test command | Passed with zero tests; compilation evidence only |
| Android debug assemble and lint | Passed; selected HN assets rebuilt with final HN source |
| Temporary validator diagnostics | Passed valid request, unknown-field rejection, invalid sequence and descriptor bounds; no permanent tests added |
| Packed SDK/tools and exported factory kit | Passed. Default npm cache was unwritable; packing succeeded using a task-owned /tmp cache without changing cache permissions |
| Packed React/vanilla create/check/build | Passed using supplied packed SDK/tools and existing local dependency links; no public-registry installation claim |
| X live source inspection | Reply editor, Repost menu/retweetConfirm and disabled source Repost observed without a mutation |
| Contextual Reply | Direct /compose/post?in_reply_to URL opened an editor with post context; cancelled without entering/submitting text |
| Installed owned feed controls | Three sampled Like controls were BUTTON elements, enabled from source evidence, without website cues. Three Share buttons were present. Post-action links were contextual Reply and internal analytics |
| Owned Share sheet | Copy link and native Share link options present; one owned dialog |
| Android chooser | Share link opened com.android.intentresolver ChooserActivityLauncher. SDK reported presented only after launch. Back cancelled to the same owned feed with three posts; no recipient selected |
| HN device smoke | Updated native shell/title/Home observed. A loaded feed, fragment journey and forms were not independently qualified in this pass |
| Final installation | X a6bc4cfb458af2da19aef0457fbe3e16ee3dbb1aa5537f2c7292f800d8d38b64 and HN c4458640305be3b9e50074b5045b8c69ef686bc16a9e1d1bed7d34a2baa564bb installed in place |
| Whitespace and portable links | Passed |

Device feed/chooser samples used intermediate integration revision 5101b9484f298011406e281dbd082ae7a470ece0569a57177d6fc44f0833553c. Later source-error/lifecycle/accessibility-label fixes passed check/build and final installation. Those later variants were not exercised through real social writes. No full final-device matrix is claimed.

## Remaining qualification

No real Like/Unlike, Bookmark/remove, Repost/Undo, Follow/Unfollow, message, post or account mutation was submitted. Their server persistence and rollback/read-back remain unqualified. Private/requested Follow, inverse confirmation markup, localization, Quote editor context, source-disabled variants beyond the sampled Repost, all virtualization/cancellation races, Copy permission failure, 200% text/dark/narrow/TalkBack, physical devices and the full HN fragment/form/Saved matrix remain unqualified. A source UI observation is not durable server confirmation.

Required features are not redefined as excluded. Source markup that cannot be identified stays disabled/uncertain with read-only recovery. Real social-write qualification requires explicit mutation scope and an appropriate account. This report establishes implementation, static validation and the sampled non-mutating device behavior, not full native-client parity.

## Implementation deviations and cleanup

The existing public command/publication transport was sufficient, so no new generic source-action RPC was added. Load-more completion is observed in the foreground rather than adding a second read-receipt transport. Existing source tab/entry/quote read commands retain their established dispatch behavior; exhaustive result-flow qualification remains pending. The optional chooser is additive and feature-detected rather than requiring a schema/runtime bump. Existing original-page actions remain explicit recovery choices, not social-action implementations.

Temporary local inspector forwarding and device UI dump were removed. Diagnostic XML stayed in /tmp and was removed after inspection. Inspector-only source session marker was removed. Existing hidden diagnostic applets, backend tunnels, credentials and records were preserved. No new everyday applet was installed.

## Component commits

- `00e229f` feat/(x): specify source interaction qualification boundaries
- `2e0ad61` feat/(x): add visit-bound source action execution
- `c78381d` feat/(x): render owned post action controls and sharing sheet
- `592ac5a` feat/(android): share foreground links without navigation
- `a5e2def` feat/(sdk): expose optional native link sharing
- `025c534` feat/(x): integrate sharing and contextual action flows
- `32ab624` feat/(hacker-news): separate local scrolling from website entry
- `4a3c4e0` feat/(x): complete overflow and pending navigation feedback
- `5c7a668` feat/(factory): require action semantics and result verification
- `2233d4f` feat/(x): revoke action authority across navigation and timeout
- `ac9da66` feat/(x): preserve uncertainty across confirmation failures
- `f392b13` feat/(x): label follow and unavailable actions clearly
