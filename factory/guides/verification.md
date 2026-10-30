# Verify and maintain an applet

Start with the requested behavior and the selected applet, not the entire platform. Record SDK/package version, source routes, host build, and device/provider for live checks. Follow [factory instructions](../AGENTS.md); do not create or modify test files without a coverage request.

## Static and development checks

From the standalone applet directory with its installed SDK/tools:

```sh
npx --no-install genesis-applet check . --json
npx --no-install genesis-applet build . --out dist --json
npx --no-install genesis-applet dev status --device emulator-5554 --json
npx --no-install genesis-applet dev install dist --device emulator-5554 --replace --json
git diff --check
```

Omit `--replace` for first installation. `check` validates the manifest, file containment, optional service declaration, and TypeScript. `build` emits bounded hashed assets plus `bundle.json`, rejects backend imports and undeclared bundle files, and invokes no native compiler, device, or backend. Output replacement is permitted only for its recognized generated directory. Rebuild after source changes; edit the applet rather than generated bundle bytes.

Use `node --check <changed-file.mjs>` for backend scripts. Frontend checks do not validate a server protocol or prove website behavior. Device status reports package acceptance/revisions, not source loading or backend availability. A timeout after install is an unknown outcome; inspect status before retrying. Rollback preserves current records.

For Genesis monorepo examples, maintainers can also run root workspace typechecks and selected-bundle checks. `genesis.packages.json` selects only HN by default. Native host work uses the platform's own maintenance instructions; external applet work does not require them. Frontend-only platform stages no longer need Cargo.

## Live acceptance checklist

| Area | Check and expected result |
| --- | --- |
| Source identity | Correct records on supported routes; incomplete/unrecognized markup skipped; recycled nodes never retain another record's controls. |
| Cleanup | Repeated navigation/reload creates no duplicate mounts or listeners. Leaving an element removes its owned effects. Late results cannot change replacement content. |
| Initial UI | Initial page shell/loading state appears without waiting on service data. Customized page reveal and recovery work on the actual host. |
| Navigation | Source → local page → source, detail Back, external reader Close, and section return reach the expected destination and selected section. |
| Source semantics | Links, selection, login, hidden form fields, and source actions retain their meaning. Inspect consequential actions without submitting them. |
| Records | Create/read/update/delete only disposable applet records as authorized; confirmed state persists across restart. A failed read is visibly different from no records. |
| Conflicts/failures | Competing updates preserve or explain conflicts. Timeout does not automatically repeat a write. Offline/invalid service states preserve navigation and existing rows. |
| Retention | Focus refresh rereads state; drafts survive intended switches/recreation. Do not promise all JavaScript state survives eviction. |
| Multiple sources | Each source uses only its declared origins and own record identity; combined pages distinguish source/freshness; one unavailable source does not invent data. |
| Accessibility/layout | Narrow/wide layouts, large text, long content, IME, light/dark mode, reduced motion, labels, focus, and TalkBack remain usable. |

Capture only authorized evidence, excluding passwords, account settings, private page contents, and service tokens. Screenshots show final layout; recordings with described sampling are needed for transition claims. Do not claim absence of every one-frame flash from a few screenshots.

## Diagnose by owner

| Symptom | First place to inspect |
| --- | --- |
| New applet missing from launcher | dev status, applet ID/revision, compatible debug host, and matching install receipt; do not assume an accepted package has loaded its source. |
| Controls missing/attached to wrong item | Source extraction, selector, content key, route coverage; applet. |
| Page never becomes ready | Default export, activation rejection or network wait, owned root, React initial commit; then host diagnostics. |
| Only local page loses styles | CSS placement inside its Shadow DOM; applet. |
| Service unavailable | Declaration, provisioned connection, reachable server, auth/TLS/health; separate environment failure from applet response parsing. |
| State stale after section return | `onFocus` refresh and storage/service authority; pending calls may not survive switching. |
| Origin/Back/recovery wrong across applets | Minimal host reproduction with source/page/reader sequence; platform. |

Give a platform maintainer the SDK/host versions, minimal manifest, entry, exact steps, expected/actual result, and sanitized errors. Do not include personal data or ask the user to reverse-engineer the host.

## Maintenance handoff

Update the applet README with supported source routes, behavior, data authority, backend setup if any, and known gaps. Preserve applet IDs and data on updates. Source websites can change independently; record the date and routes inspected, and isolate adapter changes from record-schema changes. Report checks as passed, failed, or not run with a reason. Existing historical device reports apply to those builds only.

Website file inputs use Android's system document picker for single or multiple selection, up to 16 selected content URIs. No blanket storage or camera permission is requested. File-selection cancellation and stale-view result rejection need device qualification; attachments stay in the requesting website workflow, never in applet records.
