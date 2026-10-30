# Applet services and data

Choose one authority for each record type. The website owns its account and upstream data. The applet owns extracted records, settings, drafts, and optional server data. Genesis transports/stores generic JSON without knowing what a bookmark, category, or order means.

## Local documents

Declare `storage` and use `context.storage` for applet-local state. Do not use the source website's localStorage as the applet database. Namespace identity comes from the host, not a caller-supplied applet ID.

```ts
import type { AppletContext } from "@genesis/sdk";

async function saveDraft(context: AppletContext, text: string) {
  const { document } = await context.storage.get<{ text: string }>("drafts", "current");
  if (context.signal.aborted) return;
  await context.storage.commit({
    checks: [{ collection: "drafts", key: "current", expectedRevision: document?.revision ?? null }],
    puts: [{ collection: "drafts", key: "current", value: { text } }],
    deletes: [],
  });
}
```

The caller must handle conflict by rereading and deciding how to merge, preserve, or ask the user about their edit. Serialize draft writes so a slow older save cannot overwrite newer input. A timeout is an unknown result; reread before retrying. Do not delete data just because a view closes or an authentication redirect occurs.

The current host accepts `dataSchemaVersion: 1` only. For compatible record evolution, store an applet-owned version inside record values and handle older values explicitly. A destructive migration needs an export/backup, defined conversion, and rollback policy. Changing `manifest.id` creates a different data/service identity and is not an update strategy.

## Optional services

Declare `services` capability and logical service IDs, such as `"services": ["catalog"]`. Use `context.services.request` with a relative path. The host attaches the configured backend credential, does not forward website cookies, and keeps credentials out of JavaScript. Backend operations, validation, authorization, database schema, and migrations belong to the applet.

A server may use any suitable implementation. The existing local development helper starts a Node entrypoint with this optional `backend/service.json` shape:

```json
{
  "serviceId": "catalog",
  "entry": "backend/server.mjs",
  "healthPath": "/health",
  "port": 8787,
  "environment": {
    "token": "CATALOG_TOKEN",
    "database": "CATALOG_DATABASE",
    "port": "CATALOG_PORT",
    "certificate": "CATALOG_TLS_CERT",
    "key": "CATALOG_TLS_KEY"
  }
}
```

The Node process must implement that environment contract, HTTPS when certificate/key are supplied, authenticated read-only health returning `{ "ready": true }`, and its own application API. The declaration does not implement a server. The current helper supports one local service declaration per applet, though the runtime manifest allows several service IDs. It does not deploy production infrastructure or run Node inside Android.

Validate input and returned JSON, enforce application authorization on the server, and make consistency rules explicit. For multi-user service deployment, do not reuse HN's personal single-token/single-database model as though it provided account isolation. Keep API keys, cookies, tokens, TLS keys, databases, and logs outside source and frontend bundles.

## Current development commands

Run from the Genesis repository root with Node `24.15.0` and an already installed debug host. Replace `emulator-5554` with the authorized device ID. These commands are for the bundled HN example; use another applet path only after it is integrated into the host.

```sh
node tools/services.mjs start factory/applets/news.ycombinator.com emulator-5554
node tools/services.mjs status factory/applets/news.ycombinator.com emulator-5554
node tools/services.mjs stop factory/applets/news.ycombinator.com emulator-5554
```

`start` can create/reuse private local state, start the declared process, check HTTPS health, establish adb reverse, and import the connection. Provisioning force-stops and relaunches Genesis, so save unsaved work first. `status` checks the recorded process, not end-to-end readiness. `stop` preserves data and credentials. Default adb location is the macOS Android SDK path; set `GENESIS_ADB` to the actual executable when needed. OpenSSL and an authorized adb device are prerequisites for local start.

Private state lives at `~/.local/share/genesis/services/<applet-id>/<service-id>/`. Do not print or copy its secrets into a report. A disconnected/restarted device may need `start` again to restore the tunnel. Changing applet source paths does not require renaming these data directories because they use manifest IDs.

For an existing trusted HTTPS server, provide a private credential file outside the repository:

```sh
GENESIS_SERVICE_ORIGIN=https://service.example \
GENESIS_SERVICE_TOKEN_FILE=/absolute/private/token-file \
node tools/services.mjs provision factory/applets/news.ycombinator.com emulator-5554
```

This is still debug provisioning, not a release installer. It imports settings and waits for device health; failed health does not currently guarantee rollback of imported settings. The HTTPS endpoint must be reachable from the phone. Android's creator Service connections UI remains a troubleshooting path. Changing the endpoint requires a credential for the new endpoint. Never disable certificate checks.

## Failure and trust boundaries

Handle missing configuration, authentication, TLS failure, unreachable service, timeout, invalid JSON, and application conflict distinctly in diagnostics. Give the reader a useful error and retry/read-back path without raw transport details. Initial load failure is not an empty database. A successful local page render is not proof of backend availability.

Requests and responses are bounded; see [SDK limits](sdk-reference.md). A retired view or aborted UI operation does not cancel a remote commit. Use applet-owned idempotency keys/status for workflows that require safe write retries. Do not switch to a different database when a service fails. An offline cache needs explicit authority, freshness, and conflict rules.

DOM-capable applets can observe and affect their authorized source pages. Shadow DOM and an isolated JavaScript world do not confine all outbound traffic. Service capability checks protect the host broker, not every possible web request. Review generated applet code and origins accordingly. Do not claim production publisher trust, applet signing, or malicious-code isolation from the current bundled prototype.
