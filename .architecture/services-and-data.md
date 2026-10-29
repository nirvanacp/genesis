# Genesis services and application data

## Implemented capability

A manifest may declare services as unique logical identifiers and the services capability. The TypeScript context exposes services.request(serviceId, {path, method, body}). The result is {status, body}; the applet interprets HTTP status and application JSON. The host does not interpret HN collections or server operations.

Rust validates declared service membership, allowed methods, relative path shape and message binding. It emits ServiceRequest containing host-assigned applet and document identity. Android ServiceClient resolves a connection scoped to applet ID and service ID. Requests run outside the UI thread. GET cannot carry a body. POST/PUT/PATCH/DELETE may carry JSON.

Native Menu > Service connections allows explicit endpoint and token configuration. The endpoint must be an HTTPS origin with no user info, path, query or fragment. A changed origin requires a new token. Tokens are encrypted with an Android Keystore AES-GCM key before private SharedPreferences storage. JavaScript receives neither the stored token nor the key. Website cookies are not forwarded. Backend credentials are separate from website account sessions.

Transport constructs a path relative to the configured origin and rechecks scheme and authority. Redirects are disabled. TLS uses the platform trust configuration. Responses and request bodies are capped at 256 KiB. Two network workers share a queue of 32 jobs per Activity. Connect and read timeouts are three seconds; response-body reading also checks a four-second elapsed deadline. These are bounded-operation safeguards, not a proven strict wall-clock deadline for every transport phase. Service workers stop accepting jobs on Activity destruction; an already submitted request can still reach its server.

Configuration edits affect future requests. Disconnecting removes saved configuration; it does not undo or guarantee cancellation of in-flight requests. Revocation-sensitive operations must also revoke the credential at the backend. Connection settings are currently scoped to bundled applet IDs; signed publisher/installation identity must be established before independent package installation.

## Trust and application semantics

A configured backend is trusted to receive the chosen applet data and return data to that applet. This broker does not sandbox all outbound effects of DOM-capable code. An isolated world and Shadow DOM do not establish complete network confinement or protect users from a malicious customization with broad DOM access.

Servers enforce authentication and application authorization. The current HN process uses a single bearer token and a single database. It is a personal single-tenant backend, not a multi-user account service. Production deployment requires an operator-managed trusted HTTPS endpoint, durable volume, backups and appropriate network/rate controls. Server secrets stay outside source and frontend bundles.

Do not retry uncertain writes automatically. A transport or RPC timeout may happen after commit. Read current state before a user retries. A future exactly-once user experience needs applet-owned idempotency keys and operation status. Dropping a late UI completion does not roll back a remote write.

## Local storage and migration

Generic host SQLite remains available through the optional storage capability for other applets and future caches. It stores namespace-scoped JSON documents with revision-checked transactions. The HN manifest no longer requests storage and its frontend no longer uses context.storage. Existing files/genesis.sqlite3 is preserved. It is not silently copied or merged into the remote backend.

HN's explicit import tool accepts a consistent legacy database copy and an empty server database. It imports only profile local, applet hn-bookmarks, supported schema and HN collections, preserving keys, JSON, revisions and timestamps. A populated destination is refused. Stop the backend before import. This operator tool is not yet a user-facing export/migration workflow.

Offline HN reads are not supplied in the new architecture. An offline cache would live in the applet with explicit authority, conflict and sync behavior. It should not become a universal Rust synchronization policy.
