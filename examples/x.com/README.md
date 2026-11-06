# X applet

One `x-bookmarks` applet with native Home, Explore, Notifications, Saved, Profile and top-right Genesis options. SDK 0.5.1/tools 0.5.0, runtime API 4/schema 3. Read [current specs](.specs/current.md) for scope, choices, routes/actions and verification limits, and [decisions](.specs/decisions.md) for attribution. Follow [factory instructions](../../factory/AGENTS.md).

## Operator setup

Run `./start.sh` here, or `./examples/start-applet-servers.sh` from the Genesis root for all local applet backends. After reboot/reconnecting Android use `--device <adb-serial>` to restore tunnels/connections. `./start.sh --stop` preserves records. Agents maintain scripts and run static checks; start services only when explicitly asked.

Requires Node 24, installed workspace dependencies and OpenSSL; SQLite is built in. Port 8788 is reserved in examples/ports.json. Private state, token/TLS files, documents.sqlite3 and server.log live under `~/.local/share/genesis/services/x-bookmarks/bookmarks/`. Reuse that state; never reset it to repair a connection. For first database creation only, provide X_EXPECTED_HANDLE=your_handle. The helper supplies X_BACKEND_TOKEN, X_BACKEND_DB and TLS configuration; confirmed source handle must match the personal library. See [services and startup](../../factory/guides/services-and-data.md#local-startup-and-port-assignments).

## Limits and checks

Supported live source actions have observed-state safeguards; durable mutation persistence and several account/confirmation variants remain unqualified. Protected editors/uploads/playback stay website-owned. Categories and upstream bookmarks remain independent. No production multi-user service or durable website POST/draft restoration is promised.

Use `node packages/applet-tools/src/cli.mjs check examples/x.com --json` from the Genesis root, or installed standalone tools. Static checks do not qualify current source selectors, backend persistence or native Return. Current specs distinguish historical evidence from checks performed now.
