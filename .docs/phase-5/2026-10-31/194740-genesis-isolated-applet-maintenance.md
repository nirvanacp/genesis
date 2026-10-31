# Genesis phase-5 isolated applet maintenance

This is the current operating guide for SDK/tools 0.4.0, runtime API 3 and manifest schema 2. Use [the architecture](../../../.architecture/README.md), [factory instructions](../../../factory/AGENTS.md) and [the applet contract](../../../factory/guides/isolated-applets.md). Earlier phase-3/4 guides are historical background where this guide supersedes rendering, SDK versions and entrypoints.

## Development boundaries

Android/Rust/SDK/tools own general capabilities. HN and X own selectors, validated models, owned screens, account rules and their existing separate backends. Every new applet declares exact origins, a full known route inventory, an explicit unsupported outcome, registered source adapters and a separate foreground. Source CSS is not a foreground. Protected forms and external websites use explicit provider presentation.

Both existing applets retain their stable identities and records. `genesis.packages.json` still selects HN for APK bundling. X remains a development-installed applet in the existing debug host, as required by the migration plan. A clean release APK does not implicitly include X. Do not reset data or change signing/application ID to update either applet.

## Checks and builds

From the Genesis root, using the pinned Node/npm/Rust and configured Android SDK/JDK:

```sh
npm run typecheck
npm run check:packages
node packages/applet-tools/src/cli.mjs check factory/applets/news.ycombinator.com --json
node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json
node packages/applet-tools/src/cli.mjs build factory/applets/news.ycombinator.com --out /absolute/output/hn --json
node packages/applet-tools/src/cli.mjs build factory/applets/x.com --out /absolute/output/x --json
cargo clippy -p genesis-android --offline -- -D warnings
cargo test -p genesis-android --offline
./android/gradlew -p android :app:assembleDebug :app:lintDebug --offline
```

The selected-package check alone does not qualify X. The existing native suite currently contains no tests; successful Cargo execution is a compilation check, not evidence of lifecycle coverage. Repository rules prohibit adding test files without a coverage request. Use existing checks plus explicit real-device verification.

For a separate disposable QA host, Gradle accepts `-Pgenesis.applicationId=app.nirvana.genesis.isolationqa`. Check the resulting APK application ID before installation. That property changes the output artifact. Rebuild without it before updating the everyday `app.nirvana.genesis` installation. Install existing-host updates with `adb -s <serial> install -r <apk>`; never uninstall the everyday host to fix a code issue.

## Development delivery and backend connection

Launch the updated debug host once so its development status advertises API 3, then use an explicit authorized serial:

```sh
node packages/applet-tools/src/cli.mjs dev status --device <serial> --json
node packages/applet-tools/src/cli.mjs dev install /absolute/output/hn --device <serial> --replace --json
node packages/applet-tools/src/cli.mjs dev install /absolute/output/x --device <serial> --replace --json
node packages/applet-tools/src/cli.mjs service provision factory/applets/news.ycombinator.com --device <serial> --json
node packages/applet-tools/src/cli.mjs service provision factory/applets/x.com --device <serial> --json
```

Only add `--allow-permission-change` after reviewing an intentional origin/capability/service diff. `--replace` updates code while retaining records. Provisioning reconnects already-running services and adb reverse, imports existing private credentials, checks device-side health and restarts Genesis. It does not start a stopped server. Operator startup commands and reserved ports remain in the [services guide](../../../factory/guides/services-and-data.md). Agents must not start services unless the user asks. Recreate tunnels after an emulator/device restart. Do not print private tokens, certificates, cookies, form values or account settings.

## Acceptance and diagnosis

For isolated applets, native primary-section buttons explicitly open the declared source start URL and section page, including clearing an internal page for a source-only section. They recreate the owned foreground so cached child content and viewport offsets do not survive a root selection. A remembered post, profile or category manager is not a primary tab's entry. Internal source/page navigation, Back and website return retain their ordinary behavior. Verify switching away from a detail and reselecting its primary section, as well as tapping the already-selected section after scrolling.

Start at the actual launcher. Exercise HN feeds/comments/parent/context/profile, discussion/Back, Saved/category writes/read-back/cleanup, Me/Post forms, and article/Close. Exercise X Home tabs, discovery/search, actual notification destinations, profiles/people, post/Back, media/provider return, Bookmarks/Likes/Categories and category writes/read-back/cleanup. Confirm original records remain.

Test loading and failed source requests separately from successful empty results. HN keeps bounded public content with a stale notice after failed refresh. X restores cached private content only after an accepted current-account observation. Backend failures must remain visible and must not invent empty collections or silently retry uncertain writes. Verify hidden source content is absent from applet accessibility, focus and foreground pixels; original website content is visible only after explicit provider entry.

Website Close/Back/Forward/Reload checks visible edited fields using a boolean result. Stay keeps the live website; Leave proceeds. Field text, passwords and file paths are not exported by that check. This is a conservative guard, not arbitrary durable form serialization. Do not promise POST replay, process-death draft restoration, all authentication popups, camera/microphone, or every website media variant. Real posting/messages/votes/account/subscription changes require separate user intent, not routine QA.

In a debuggable host, Applet options / Developer tools offers bounded inspection, simulated creator failure and renderer termination. Inspect current document explicitly enables local WebView inspection for that applet visit; leaving it disables inspection. Keep adb forwarding local and remove diagnostic forwards afterward. The legacy 20-reload control is not shown for isolated applets. Retry after a foreground failure recreates the owned interface under the native barrier.

Activity recreation restores only an eligible custom GET selection. In-memory Back/section/scroll state and arbitrary website JavaScript are not a durable browser session. A crashed emulator graphics process is distinct from an app renderer crash. Preserve AVD userdata during recovery and record the renderer/provider used. Physical-device, TalkBack, large-text, theme and protected-account checks qualify only the environments actually exercised.

## Creator artifacts

After updating factory guidance and SDK code, build the SDK and pack both packages into a separate output directory:

```sh
node packages/sdk/build.mjs
npm pack ./packages/sdk --pack-destination /absolute/artifacts
npm pack ./packages/applet-tools --pack-destination /absolute/artifacts
```

Tools prepack refreshes its portable factory kit. Verify both React and vanilla create/check/build from the packed CLI, and compare the exported kit with current factory guidance. These packages remain maintainer-supplied archives, not public registry releases. No ordinary applet build needs Cargo or Android source.

## Current qualified revision

The [31 October acceptance report](../../../.reports/phase-5/2026-10-31/231100-genesis-isolated-applets-verification.md) records both installed revisions, real and synthetic journeys, creator archive checks and explicit gaps. Source watcher batches must progress without animation frames because their WebViews are deliberately occluded. Provider sessions are unique; an expired close ID cannot close another reader, and owned navigation cannot replace a currently open website. Wait until the applet returns before opening another destination.
