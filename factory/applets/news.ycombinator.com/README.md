# Hacker News applet

One `hn-bookmarks` applet with native Home, Search, Post, Saved, Me and top-right Genesis options. SDK 0.5.1/tools 0.5.0, runtime API 4/schema 3. Read [current specs](.specs/current.md) for scope, choices, routes/actions and verification limits, and [decisions](.specs/decisions.md) for attribution. Follow [factory instructions](../../AGENTS.md).

## Operator setup

Run `./start.sh` here, or `./factory/start-applet-servers.sh` from the Genesis root for all local applet backends. After reboot/reconnecting Android use `--device <adb-serial>` to restore tunnels/connections. `./start.sh --stop` preserves records. Agents maintain scripts and run static checks; start services only when explicitly asked.

Requires Node 24, installed workspace dependencies and OpenSSL; SQLite is built in. Port 8787 is reserved in factory/ports.json. Private state, token/TLS files, documents.sqlite3 and server.log live under `~/.local/share/genesis/services/hn-bookmarks/bookmarks/`. Reuse that state; never reset it to repair a connection. The backend is a personal single-token/single-database service, with independent applet saves/categories. See [services and startup](../../guides/services-and-data.md#local-startup-and-port-assignments).

## Limits and checks

Search remains a placeholder. Posting/voting/account changes remain original-site workflows; no routine submissions are authorized. Legacy draft records are preserved but not injected into forms. No production multi-user service or durable website POST/draft restoration is promised.

Use `node packages/applet-tools/src/cli.mjs check factory/applets/news.ycombinator.com --json` from the Genesis root, or installed standalone tools. Static checks do not qualify current source selectors, backend persistence or native Return. Current specs distinguish historical evidence from checks performed now.
