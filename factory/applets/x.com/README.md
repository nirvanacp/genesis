# X with private categories

This applet keeps the live X website and adds an independent private Categories library. X bookmarks stay in X. Saving or removing a category record never changes an upstream bookmark.

## Supported experience

Native Home, Explore, Alerts, Saved and Me sections use a neutral shell. Live feeds, search, profiles, conversations, photo/video routes, Lists and Communities retain source controls. A separate folder action captures the selected post into one or more categories. Saved switches between X History and the applet-owned Categories page with full-library search and category management. Login, settings, chat, calls, Grok and paid/creator routes retain ordinary source presentation. Source selectors can change independently.

Requires Genesis runtime API 2 and SDK/tools 0.3.0. The applet uses only public SDK APIs. Origin permission is limited to `https://x.com`. Website sessions remain in WebView and never authorize the category server.

## Backend

The separate Node 24 server uses built-in HTTP/HTTPS and SQLite. It is not bundled into Android. It requires `X_BACKEND_TOKEN`, `X_BACKEND_DB` and, on first database creation, `X_EXPECTED_HANDLE`. A service token authorizes one personal library; the handle check prevents accidental account mixing, not malicious impersonation. Multiple users/accounts are not supported.

For the development emulator, use the existing creator helper with the expected handle in the process environment:

```sh
X_EXPECTED_HANDLE=<your-handle> npx --no-install genesis-applet service start . --device <serial> --json
```

The helper stores its generated token, certificate, logs and database privately outside source. Keep X passwords, cookies and all service secrets out of source and frontend bundles. Production needs a reachable trusted HTTPS endpoint, durable data volume, backups and private token provisioning. A USB/emulator tunnel is development infrastructure.

## Data and recovery

Categories and selected bounded post snapshots are authoritative in the backend. Categories support multiple membership, up to 50 categories and 10 categories per post. A nonempty category cannot be deleted. The backend provides operation receipts and revision preconditions. After uncertain writes, check the same operation rather than resubmitting a new ID. No offline fallback or automatic import of X/HN bookmarks exists.

The packaged library verifies the visible X account through a one-use source round trip before showing records. It cannot inspect another WebView's DOM. Saved records are snapshots, may outlive source edits/deletion, and contain no downloaded media. Open the live post for current content and social actions.

## Verification

From this directory run `npx --no-install genesis-applet check . --json` and `npx --no-install genesis-applet build . --out /absolute/output --json`. Backend scripts support `node --check`. Static checks do not qualify source selectors, navigation, Android accessibility, service availability or source attachment handling. See the phase-4 qualification report for the actual device/provider coverage when available.

No background collection, full media archive, automatic folder sync, chat passcode creation, calls/microphone integration or production distribution is supplied. Source actions and account changes require the user's intent. Preserve ordinary-site recovery for unsupported layouts.
