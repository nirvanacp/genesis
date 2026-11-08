# Hacker News applet

The `hn-bookmarks` applet: a native Hacker News app with Home, Search, Post, Saved and Me tabs, and a personal Saved library with categories. The current state is in [.specs/current.md](.specs/current.md), and the history of choices is in [.specs/decisions.md](.specs/decisions.md). Follow the [factory instructions](../../factory/AGENTS.md) when changing it.

## Build

From the Genesis root:

```sh
node packages/applet-tools/src/cli.mjs check examples/news.ycombinator.com
node packages/applet-tools/src/cli.mjs build examples/news.ycombinator.com
node packages/applet-tools/src/cli.mjs dev install examples/news.ycombinator.com --device <serial>
```

`dev install` sends the last build; run `build` first. `npm test -w examples/news.ycombinator.com` runs the adapter tests.

## Operator setup

Saved stories live in the `bookmarks` service. Run `./start.sh` here, or `./examples/start-applet-servers.sh` from the Genesis root to start every local applet backend. After a reboot or reconnecting the phone, pass `--device <adb-serial>` to restore the tunnel and connection. `./start.sh --stop` keeps the records. Coding agents maintain these scripts but start services only when asked.

The backend needs Node 24, the workspace dependencies and OpenSSL. It uses port 8787, reserved in `examples/ports.json`. Its private state, token and TLS files, database and log live under `~/.local/share/genesis/services/hn-bookmarks/bookmarks/`. Reuse that state; never reset it to repair a connection. It is a personal single-token service. See [local startup and ports](../../factory/guides/services-and-data.md#local-startup-and-ports).

## Limits

Home, Post and Me each keep their own Hacker News session history; Search and Saved are app screens. Search is a placeholder. Replies, sign-in and HN pages without a screen open as the website in the same context. The service is not a multi-user backend.
