# Applet services and data

Resolve product data behavior through [product scope and clarification](product-scope.md) before choosing authority. An applet-owned backend is an internal provider for that application, not a reason to create another app. Preserve explicit user decisions about website versus applet records. If synchronization, removal effects, account scope or migration is unresolved and materially changes behavior, ask before defining schemas or writes. Never import a sample applet's personal-account limitation without checking the intended scope.

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

The Node process must implement that environment contract, HTTPS when certificate/key are supplied, authenticated read-only health returning `{ "ready": true }`, and its own application API. The declaration does not implement a server. The helper defaults to `backend/service.json`; select additional declarations with `--service-file backend/service.<name>.json`. Each declaration needs a different manifest service ID and port. It does not deploy production infrastructure or run Node inside Android.

Validate input and returned JSON, enforce application authorization on the server, and make consistency rules explicit. For multi-user service deployment, do not reuse HN's personal single-token/single-database model as though it provided account isolation. Keep API keys, cookies, tokens, TLS keys, databases, and logs outside source and frontend bundles.

## Current development commands

From an applet directory with SDK/tools `0.3.0`, use the declared service and an authorized compatible debug host:

```sh
npx --no-install genesis-applet service start . --device emulator-5554 --json
npx --no-install genesis-applet service status . --device emulator-5554 --json
npx --no-install genesis-applet service stop . --device emulator-5554 --json
```

To start or stop a backend without any connected device, replace `--device emulator-5554` with `--local`. Local start checks authenticated HTTPS health but leaves Android connections untouched. `provision` always requires a device. The factory scripts below wrap this lifecycle for the monorepo.

The applet must first be installed in the host and declare that service. Genesis maintainers may still use `node tools/services.mjs <action> factory/applets/news.ycombinator.com <device>` as a compatibility wrapper. The standalone commands require no platform repository.

`start` can create/reuse private local state, start the declared process, check HTTPS health, establish adb reverse, and import the connection. Provisioning force-stops and relaunches Genesis, so save unsaved work first. `status` checks the recorded process, not end-to-end readiness. `stop` preserves data and credentials. Default adb location is the macOS Android SDK path; set `GENESIS_ADB` to the actual executable when needed. OpenSSL and an authorized adb device are prerequisites for local start.

Private state lives at `~/.local/share/genesis/services/<applet-id>/<service-id>/`. Do not print or copy its secrets into a report. A disconnected/restarted device may need `start` again to restore the tunnel. Changing applet source paths does not require renaming these data directories because they use manifest IDs.

## Local startup and port assignments

Every applet must have an executable `start.sh`, including applets that need no backend. It is an operator entrypoint for the entire local backend layer. Coding agents must maintain the script when creating or customizing an applet, but must not run it or start services unless the user explicitly asks them to run services. Validate with shell syntax checks, `node --check`, and the read-only registry checker instead. The creator scaffold includes a no-backend `start.sh`; replace it when adding backend requirements.

From the Genesis repository root:

```sh
# Start all local backends, leaving them running after the command exits.
./factory/start-applet-servers.sh

# Also restore Android tunnels/connections after reboot or reconnect.
./factory/start-applet-servers.sh --device emulator-5554

# Start just one applet, from any working directory.
/absolute/path/to/genesis/factory/applets/news.ycombinator.com/start.sh

# Stop all managed Node backends without deleting data.
./factory/start-applet-servers.sh --stop

# Read-only validation, safe for coding agents. Does not execute start.sh.
node factory/scripts/applet-servers.mjs all --check
```

The launcher discovers directories with `applet.json` under `factory/applets/`, validates all reservations before launching anything, then runs each `start.sh` sequentially in directory-name order. A failed applet does not prevent later applets from starting; the launcher exits nonzero and names failures. Successful servers remain running. Each current applet script starts its declared services sequentially and waits for authenticated health before returning. Repeated starts reuse a matching managed process and check health. An occupied port or a process from another checkout is an error; the tool never kills the port owner or silently chooses another port. After moving a checkout, stop the original managed process before restarting from the new path.

Use Node 24, installed workspace dependencies and OpenSSL. Device mode additionally needs an authorized adb device and the applets installed in a compatible Genesis debug host. It imports service settings and restarts Genesis for each service, so save unsaved app work first. Local-only startup can run before an emulator or phone is available; rerun with `--device <serial>` when it is connected. Without that step, restarted adb tunnels may still leave bookmarking unavailable even though the backend is healthy.

HN and X use built-in SQLite, so no separate database daemon, container, Redis or storage server is currently needed. The helper creates missing SQLite files/schema and reuses existing data at `~/.local/share/genesis/services/hn-bookmarks/bookmarks/documents.sqlite3` and `~/.local/share/genesis/services/x-bookmarks/bookmarks/documents.sqlite3`. The same directories contain `server.log`, `process.json`, token and TLS files. `GENESIS_SERVICE_STATE_ROOT` overrides the state root; preserve its previous value to keep using the same libraries. Nothing is written into applet source, and starts never import/reset existing records. On X's first database creation only, prefix the command with `X_EXPECTED_HANDLE=your_handle`. Existing X libraries retain their stored handle.

`factory/ports.json` is the shared local reservation registry. HN bookmarks reserve 8787, X bookmarks 8788, and YouTube has an empty reservation list because it has no backend. Reserve the lowest unused port in 8787–8999 for every new TCP listener, including databases and workers with HTTP endpoints. Check the committed registry rather than choosing a temporarily free port at runtime. Keep assignments stable across restarts and customization; never renumber another applet to resolve a conflict. Review concurrent changes for duplicate reservations.

For a new applet or service, the coding agent must:

1. Add the applet's directory name under `applets` in `factory/ports.json`, with `[]` for no servers. Reserve one unique port per listener. Example Node service entry: `{ "name": "search", "port": 8789, "serviceFile": "backend/service.search.json" }`.
2. Keep a Node declaration's `serviceId` and `port` equal to the registry's `name` and `port`. Declare its logical ID in `applet.json` and implement the helper's HTTPS/token/health/environment contract. Give each service its own ID so databases, credentials, logs and process metadata remain separate.
3. Create/update executable `start.sh`. For Node services in this repository, copy an existing applet wrapper pointing to `../../scripts/applet-servers.mjs`; it starts every registered declaration in registry order. For a non-Node service or a database daemon, reserve `{ "name": "database", "port": 8790 }` without `serviceFile` and implement its lifecycle in the applet script before dependent Node services. Read its assigned port from the registry. That script must prepare persistent storage without resetting it, preserve credentials, reuse its own healthy processes, check readiness, report failures with nonzero exit, and implement `--stop` to stop dependents before their databases. The shared runner only manages entries with `serviceFile`; entries without one are owned by the custom script. It does not start arbitrary database daemons for you.
4. List any configuration, initial account requirements, dependency order, state locations and stop/recovery commands in the applet README. Keep credentials in private state or the operator's environment, never the registry. The scripts must work from any working directory, return after readiness, keep servers running after terminal exit, and accept `--device`, `--check` and `--stop`. Check mode must have no startup or data effects.
5. Run `bash -n <applet>/start.sh`, `node --check` for changed modules, and `node factory/scripts/applet-servers.mjs all --check`. The checker rejects missing scripts, unknown applets, duplicate ports/names, out-of-range assignments and disagreement with service declarations. A static pass does not establish live readiness.

The shared launcher and registry are Genesis-monorepo conveniences, not exported creator-kit files. In an independent applet workspace, maintain the same `start.sh` operator contract, use installed `genesis-applet service ... --local` and `--service-file` commands, and keep a shared port registry at the root of whatever local applet workspace the operator uses. Do not require the Genesis source checkout or copy its occupied port assignments into a separate workspace. The guides and skills travel with the kit.

For an existing trusted HTTPS server, provide a private credential file outside the repository:

```sh
GENESIS_SERVICE_ORIGIN=https://service.example \
GENESIS_SERVICE_TOKEN_FILE=/absolute/private/token-file \
npx --no-install genesis-applet service provision . --device emulator-5554 --json
```

This is still debug provisioning, not a release installer. It imports settings and waits for device health; failed health does not currently guarantee rollback of imported settings. The HTTPS endpoint must be reachable from the phone. Android's creator Service connections UI remains a troubleshooting path. Changing the endpoint requires a credential for the new endpoint. Never disable certificate checks.

## Failure and trust boundaries

Handle missing configuration, authentication, TLS failure, unreachable service, timeout, invalid JSON, and application conflict distinctly in diagnostics. Give the reader a useful error and retry/read-back path without raw transport details. Initial load failure is not an empty database. A successful local page render is not proof of backend availability.

Requests and responses are bounded; see [SDK limits](sdk-reference.md). A retired view or aborted UI operation does not cancel a remote commit. Use applet-owned idempotency keys/status for workflows that require safe write retries. Do not switch to a different database when a service fails. An offline cache needs explicit authority, freshness, and conflict rules.

DOM-capable applets can observe and affect their authorized source pages. Shadow DOM and an isolated JavaScript world do not confine all outbound traffic. Service capability checks protect the host broker, not every possible web request. Review generated applet code and origins accordingly. Do not claim production publisher trust, applet signing, or malicious-code isolation from the current bundled prototype.
