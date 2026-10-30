# Verify and maintain an applet

Start with the requested behavior and the selected applet, not the entire platform. Record SDK/package version, source routes, host build, and device/provider for live checks. Follow [factory instructions](../AGENTS.md); do not create or modify test files without a coverage request.

## Static checks available now

From the Genesis repository root:

```sh
npm run typecheck --workspace @genesis/applet-hacker-news
npm run check:packages
git diff --check
```

Use the target workspace name from its `package.json`. Root `npm run typecheck` checks the SDK and all registered applets when a shared change affects them. The package checker currently selects HN only; it does not prove a new unregistered applet is valid. For an unregistered directory, the existing compiler can check it with `node node_modules/typescript/lib/tsc.js -p applets/my-applet/tsconfig.json` if dependencies resolve, but host integration still needs separate verification.

Use `node --check <changed-file.mjs>` for a changed backend script. Frontend typechecks do not validate a backend protocol. Build only when the task needs a bundle/device update. The current asset command is `node tools/build.mjs --stage assets --variant debug`; despite producing only frontend assets it currently also checks Cargo availability. That coupling belongs to the platform separation plan.

Genesis maintainers build from `android/` with `./gradlew :app:assembleDebug :app:lintDebug` using configured toolchains. Install as an update to preserve data, never uninstall merely to resolve a build issue. Applet-only authors should receive a host/build from its maintainer; they should not need to maintain Android or Rust source.

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
| New applet missing from launcher | Current bundle selection, manifest validation, installed build revision; platform integration. |
| Controls missing/attached to wrong item | Source extraction, selector, content key, route coverage; applet. |
| Page never becomes ready | Default export, activation rejection or network wait, owned root, React initial commit; then host diagnostics. |
| Only local page loses styles | CSS placement inside its Shadow DOM; applet. |
| Service unavailable | Declaration, provisioned connection, reachable server, auth/TLS/health; separate environment failure from applet response parsing. |
| State stale after section return | `onFocus` refresh and storage/service authority; pending calls may not survive switching. |
| Origin/Back/recovery wrong across applets | Minimal host reproduction with source/page/reader sequence; platform. |

Give a platform maintainer the SDK/host versions, minimal manifest, entry, exact steps, expected/actual result, and sanitized errors. Do not include personal data or ask the user to reverse-engineer the host.

## Maintenance handoff

Update the applet README with supported source routes, behavior, data authority, backend setup if any, and known gaps. Preserve applet IDs and data on updates. Source websites can change independently; record the date and routes inspected, and isolate adapter changes from record-schema changes. Report checks as passed, failed, or not run with a reason. Existing historical device reports apply to those builds only.
