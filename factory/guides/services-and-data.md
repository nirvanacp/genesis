# Services and data

An applet keeps its own data in Genesis document storage, in its own HTTPS service, or both. The website keeps its own data. Decide which store owns each record type and write it in `.specs/current.md`.

## Choosing the store

| Need | Store |
| --- | --- |
| Data on this device only: categories, notes, read state, preferences | Document storage (`capabilities.storage: true`) |
| Data shared across devices or with other tools, or computed on a server | A declared service |
| Data the website already keeps (its bookmarks, votes, follows) | The website, through intents and snapshots |

Do not copy website data into a store as a second source of truth. When a feature joins applet records with website data (categories over the website's bookmarks), store only what the applet owns, keyed by the website's stable ids, and read the rest from the page. Do not invent synchronization or migrations the user did not ask for.

## Document storage

Documents live in collections, are JSON values of at most 32 KiB, and carry a `revision`. Every write accepts revision checks.

```ts
const { records, put, commit } = useRecords<Category>("categories");

// Create only if absent.
await put(id, { name, createdAt: Date.now() }, null);

// Rename a category and move its items in one atomic batch.
await commit({
  checks: [{ collection: "categories", key: id, expectedRevision: category.revision }],
  puts: [{ collection: "categories", key: id, value: { ...category.value, name } }],
});
```

- Keys are stable ids: the website's id for records about website entities, a generated id for applet-only records. Never use a list position or a display name as a key.
- Normalize names that users type before comparing them: Unicode NFKC, trimmed and collapsed whitespace, case-folded. Keep the user's display form separately.
- Use revision checks for every update of an existing document. On `CONFLICT`, reread and show the current state; do not overwrite.
- Keep stored shapes versioned once they ship (`{ v: 1, ... }`), and read old shapes rather than rewriting the collection.
- Storage belongs to the applet id. Changing the id loses it.

## Declaring a service

```json
"capabilities": { "services": [{ "id": "bookmarks", "config": "backend/service.json" }] }
```

`backend/service.json` describes the backend for the tools:

```json
{
  "serviceId": "bookmarks",
  "entry": "backend/server.mjs",
  "healthPath": "/health",
  "port": 8787,
  "environment": {
    "token": "APP_BACKEND_TOKEN",
    "database": "APP_BACKEND_DB",
    "port": "APP_BACKEND_PORT",
    "certificate": "GENESIS_TLS_CERT",
    "key": "GENESIS_TLS_KEY"
  }
}
```

The backend is a Node HTTPS server. It requires `Authorization: Bearer <token>` on every request, answers `GET <healthPath>` with status 200 and `{ "ready": true }`, accepts and returns JSON bodies up to 256 KiB, and does not redirect. The `environment` map names the variables through which it receives its token, database path, port and TLS certificate and key.

The foreground calls it with `useService("bookmarks")` and a path. The shell adds the credential, which it keeps in the Android Keystore; the foreground and the bundle never see it. Tokens, certificates and server addresses never go into the applet's files, records or bundle.

## Handling service failures

- A 4xx or 5xx status is a response: read its body and show a specific message. The exceptions are 401 and 403, which the shell turns into `ServiceError` with `AUTHENTICATION_FAILED`.
- `ServiceError` means the shell could not complete the request. `CONFIGURATION_REQUIRED` means the user has not connected the service yet; tell them to use Service connections in the Genesis menu. Use `serviceMessage(error)` for the others.
- After `DEADLINE` or `SERVICE_UNREACHABLE` on a write, the write may have happened. Reread before offering to retry, or make the write idempotent with a client-generated id.
- A failed read is not an empty collection. Keep showing the last good data with a failure notice.
- Reread service data in `useAppResume`.

## Local startup and ports

Coding agents do not start, stop or provision backends unless the user asks. Maintain the commands so the user can:

```sh
npx genesis-applet service start . --local                      # local process and health check
npx genesis-applet service start . --device emulator-5554       # also forwards the port and connects the debug app
npx genesis-applet service status . --local
npx genesis-applet service stop . --local                       # data is preserved
```

The tools keep the token, a self-signed certificate, the database and the log in a private directory under `~/.local/share/genesis/services/<applet-id>/<service-id>/`. Never print, copy or commit its contents. `service provision . --device <serial>` with `GENESIS_SERVICE_ORIGIN` and `GENESIS_SERVICE_TOKEN_FILE` connects the device to a remote server instead. The user can also enter a server address and token under Service connections in the Genesis menu.

Give each service a fixed port that no other applet in the same workspace uses, and record it. A collection of applets may keep a port registry and a `start.sh` per applet that runs these commands; keep them current when you add or change a service.
