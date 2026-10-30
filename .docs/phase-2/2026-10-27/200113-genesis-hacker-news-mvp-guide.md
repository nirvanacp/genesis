# Genesis HN backend operations

Updated 29 October 2026. The HN customization now uses a separately run backend. Read [architecture](../../../.architecture/README.md) before extending it. Earlier offline/local SQLite reports describe the previous data path.

## Start the backend

Use pinned Node 24.15.0. From the repository root, set HN_BACKEND_TOKEN through your shell or secret manager to at least 32 printable ASCII characters, and set HN_BACKEND_DB to an absolute persistent database filename. Never commit the token or database. Then run:

```sh
npm run backend --workspace @genesis/applet-hacker-news
```

The server defaults to 127.0.0.1:8787. HN_BACKEND_HOST and HN_BACKEND_PORT override the bind address and port. Use a trusted HTTPS reverse proxy with a stable origin that forwards /v1/documents to this process, with request-size limits and an appropriate timeout. The phone must reach that origin and trust its certificate. The server's loopback HTTP listener alone is not a phone connection and is not an Internet deployment. Protect the private listener and database file. Each process/token/database is one user's backend.

Configure Android only after the HTTPS endpoint is running. Open HN or its library, then native Menu > Service connections > bookmarks. Enter the HTTPS origin and matching backend token, save, and reload. Endpoint paths/queries and redirects are unsupported. Blank tokens preserve an existing token only for the same origin. Disconnect removes saved configuration; revoke the server token to prevent existing requests from using it.

## Use the app

Browse public HN and use Save, categories and the packaged library. HN itself needs no login. Backend authentication is independent. The library's assets are local but its records require server access. Unavailable or unconfigured servers show errors rather than falling back to another database. Use Reload library after edits from another client. Search applies to loaded stories only.

Keep application ID/signing and install APK updates without clearing data. Existing device bookmarks remain in files/genesis.sqlite3. The new server starts separately and receives none of that data automatically.

## Import existing device data

Obtain a consistent, operator-controlled copy of the legacy database while database access is stopped or through SQLite backup. Do not copy an actively changing database incompletely or discard its WAL. Do not clear/uninstall the Android app. Stop the backend before importing. From the repository root:

```sh
node applets/news.ycombinator.com/backend/import-legacy.mjs /absolute/legacy-copy.sqlite3 /absolute/new-backend.sqlite3
```

The destination must be empty, and should then be selected through HN_BACKEND_DB. The tool reads the source copy without modifying it, imports only HN documents and preserves revisions/timestamps. A populated destination is refused. Keep the original data until real-device reads are confirmed. Automatic on-phone export and remote merging are not implemented.

## Verify and operate

Run npm run typecheck, npm run check:packages, node --check for backend scripts, cargo fmt --all -- --check, and cargo clippy -p genesis-android --locked -- -D warnings. From android/, run ./gradlew :app:assembleDebug :app:lintDebug with the pinned JDK and SDK. Build success does not establish phone-to-server acceptance.

Use a temporary database and token for backend checks. Exercise missing/incorrect token, bounded requests, get/list/commit, stale revision rollback, persistence after restart and import refusal on populated data. On Android, exercise connection setup, real saves, pagination, errors, native recovery and late completion after navigation. Never print production tokens to logs or use the user's real server for destructive fixtures.

Operator responsibilities include HTTPS termination, token rotation, database backups and restore checks, process supervision and disk monitoring. This personal-server prototype has no user registration, per-user tenancy, automatic sync, OAuth flow or offline cache. Those require applet/backend work and their own verification.
