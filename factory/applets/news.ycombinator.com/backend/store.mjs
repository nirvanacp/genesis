import { DatabaseSync } from 'node:sqlite';
const collections = new Set(['bookmarks', 'bookmark-order', 'categories', 'category-meta', 'category-names']);
export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const invalid = message => { throw new ApiError('INVALID_ARGUMENT', message); };
const key = value => {
  if (!value || !collections.has(value.collection) || typeof value.key !== 'string' || !value.key || Buffer.byteLength(value.key) > 512) invalid('Invalid HN document key');
};
export class Store {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Backend database is newer than this server; data preserved');
    this.db.exec(`CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO state VALUES(1,0);
      CREATE TABLE IF NOT EXISTS documents(collection TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      revision INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, PRIMARY KEY(collection,key)); PRAGMA user_version=1;`);
  }
  close() { this.db.close(); }
  execute({ operation, params }) {
    if (!params || typeof params !== 'object') invalid('Missing parameters');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const revision = this.db.prepare('SELECT revision FROM state WHERE id=1').get().revision;
      const get = k => this.db.prepare('SELECT key,value,revision,updated_at_ms FROM documents WHERE collection=? AND key=?').get(k.collection, k.key);
      const document = row => row ? { key: row.key, value: JSON.parse(row.value), revision: row.revision, updatedAtMs: row.updated_at_ms } : null;
      let result, changes = [];
      if (operation === 'get') {
        key(params); result = { document: document(get(params)), namespaceRevision: revision };
      } else if (operation === 'list') {
        key({ collection: params.collection, key: params.afterKey ?? 'validation' });
        if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100) invalid('List limit must be 1 to 100');
        const rows = this.db.prepare('SELECT key,value,revision,updated_at_ms FROM documents WHERE collection=? AND (? IS NULL OR key>?) ORDER BY key COLLATE BINARY LIMIT ?')
          .all(params.collection, params.afterKey ?? null, params.afterKey ?? null, params.limit + 1);
        const entries = []; let bytes = 512;
        for (const row of rows) { const entry = document(row), size = Buffer.byteLength(JSON.stringify(entry)) + 1;
          if (entries.length === params.limit || bytes + size > 240000) break;
          entries.push(entry); bytes += size;
        }
        result = { entries, nextAfterKey: rows.length > entries.length ? entries.at(-1).key : null, namespaceRevision: revision };
      } else if (operation === 'commit') {
        const { checks, puts, deletes } = params;
        if (![checks, puts, deletes].every(Array.isArray) || checks.length > 128 || puts.length + deletes.length > 64 || !puts.length && !deletes.length) invalid('Invalid transaction size');
        const checked = new Set(), modified = new Set(), identity = k => JSON.stringify([k.collection, k.key]);
        for (const check of checks) {
          key(check); const id = identity(check);
          if (checked.has(id) || !(check.expectedRevision === null || Number.isSafeInteger(check.expectedRevision) && check.expectedRevision > 0)) invalid('Invalid revision check');
          checked.add(id);
          if ((get(check)?.revision ?? null) !== check.expectedRevision) throw new ApiError('CONFLICT', 'Data changed. Reload before retrying.');
        }
        for (const change of [...puts, ...deletes]) {
          key(change); const id = identity(change);
          if (modified.has(id) || !checked.has(id)) invalid('Every modification needs a unique revision check');
          modified.add(id);
        }
        for (const put of puts) if (put.value === undefined || Buffer.byteLength(JSON.stringify(put.value)) > 32768) invalid('Document exceeds 32 KiB or is missing');
        const next = revision + 1, now = Date.now();
        if (!Number.isSafeInteger(next)) invalid('Revision exhausted');
        this.db.prepare('UPDATE state SET revision=? WHERE id=1').run(next);
        const put = this.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?) ON CONFLICT(collection,key) DO UPDATE SET value=excluded.value,revision=excluded.revision,updated_at_ms=excluded.updated_at_ms');
        for (const value of puts) put.run(value.collection, value.key, JSON.stringify(value.value), next, now);
        for (const value of deletes) this.db.prepare('DELETE FROM documents WHERE collection=? AND key=?').run(value.collection, value.key);
        changes = [...puts, ...deletes].map(({ collection, key }) => ({ collection, key }));
        result = { namespaceRevision: next };
      } else invalid('Unknown HN operation');
      this.db.exec('COMMIT');
      return { result, changes };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
