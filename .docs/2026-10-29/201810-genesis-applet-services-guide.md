# Genesis applet services and navigation

The Android host reads shell sections, brand artwork, optional native section icons, feed choices and exact customized paths from the package manifest. Customized source and packaged pages use app chrome. Unknown paths and external publishers use ordinary browsing controls. Ordinary publisher pages receive no HN bridge or styling. The first committed external frame reveals independently from SDK preparation.

## Local development

Use the pinned Node 24.15.0 and installed Android debug build. Select the device from `adb devices`, then run from the workspace root:

```sh
node tools/services.mjs start applets/news.ycombinator.com emulator-5554
node tools/services.mjs status applets/news.ycombinator.com emulator-5554
node tools/services.mjs stop applets/news.ycombinator.com emulator-5554
```

Start validates the applet service declaration, starts its backend, checks authenticated HTTPS health, creates adb reverse, imports credentials through a private debug-only file, and waits for Android to make its own HTTPS health request. It never prints the token. Repeating start reuses the running managed process and persistent database. Stop preserves data and refuses to kill a process whose command does not match the managed backend. A device restart may require running start again to restore the reverse tunnel.

Private developer files live under `~/.local/share/genesis/services/<applet>/<service>/`. The directory uses 0700 and private files use 0600. The server log also stays there. Credentials, TLS keys and databases are never packaged. The connection credential is encrypted with Android Keystore after import. Development certificate trust applies to this declared service connection only; hostname validation remains enabled. Release builds ignore debug provisioning imports.

## Self-hosted HTTPS

Run the applet backend on a server or separately on a phone with an appropriate Node runtime. Use a trusted HTTPS origin. The frontend and bookmark protocol are identical regardless of location. The app does not bundle Node, supervise phone background services, or install a phone server runtime.

For a debug build, write the service token to a private file outside the repository and use:

```sh
GENESIS_SERVICE_ORIGIN=https://your-service.example \
GENESIS_SERVICE_TOKEN_FILE=/absolute/private/token-file \
node tools/services.mjs provision applets/news.ycombinator.com emulator-5554
```

The server must implement its declaration’s read-only health endpoint returning `{ "ready": true }` after authentication. This command uses normal platform TLS trust and waits for the device health request. Creator troubleshooting also remains available by long-pressing the native app brand and opening Service connections. Production credential installation remains an operator responsibility; independent signed package installation is outside this prototype.

## Applet readiness and state

Activation/mount may return a Promise resolving to a disposer. React pages should return `mountReact(context, container, content)` from `@genesis/sdk/react`. It resolves after React’s first layout-effect commit and registers unmount on retirement. The SDK flushes initial managed watchers and waits for layout before runtime readiness. Local pages render a skeleton immediately instead of waiting for backend records.

The host then requires the current navigation’s main-frame commit and visual-state callback. An opaque cover prevents source, departing-page and accessibility exposure while preparation runs. Back remains native. Failure offers Retry, Back and explicit View original page. Progress reaching 100% is never readiness evidence.

Up to three customized section WebViews remain resident; a child external reader preserves its live opener. Hidden views detach and pause. Evicted views save history and scroll; arbitrary website JavaScript state is not serializable. `context.onFocus` lets applets refresh service data after a retained tab returns. HN preserves Saved filters and rows while refreshing, stores public account identity and drafts in applet-scoped host storage, and keeps bookmarks authoritative on the backend.

HN story backgrounds open discussion; titles retain the submitted article link. Buttons, votes, authors, selected text and modified clicks keep their own actions. Saved-origin discussion views preserve Saved as their owner. Me owns account entry. Post uses the real HN form and never stores hidden fields or passwords. Drafts survive errors/authentication; explicit Discard clears them. Real posting still requires the prelaunch check in TODOS.md.

On Android emulators with ranchu/goldfish/generic hardware, customized pages use software layers to avoid observed stale table raster tiles. Physical-device rendering and independent external readers remain accelerated.
