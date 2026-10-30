// Explicit operator migration. Run against a consistent copy, never the live device database.
import { DatabaseSync } from 'node:sqlite';
import { Store } from './store.mjs';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!source || !destination || resolve(source) === resolve(destination)) throw new Error('Usage: node import-legacy.mjs legacy-copy.sqlite3 new-backend.sqlite3');
if (existsSync(destination)) {
  const a = statSync(source), b = statSync(destination);
  if (a.dev === b.dev && a.ino === b.ino) throw new Error('Source and destination identify the same file');
}
const legacy = new DatabaseSync(source, { readOnly: true });
const target = new Store(destination);
try {
  const namespace = legacy.prepare("SELECT revision,schema_version FROM namespaces WHERE profile_id='local' AND applet_id='hn-bookmarks'").get();
  if (!namespace || namespace.schema_version !== 1 || !Number.isSafeInteger(namespace.revision) || namespace.revision < 0) throw new Error('Missing or unsupported HN namespace');
  const rows = legacy.prepare("SELECT collection,key,value_json,revision,updated_at_ms FROM documents WHERE profile_id='local' AND applet_id='hn-bookmarks'").all();
  const allowed = new Set(['bookmarks','bookmark-order','categories','category-meta','category-names']);
  target.db.exec('BEGIN IMMEDIATE');
  try {
    if (target.db.prepare('SELECT COUNT(*) AS count FROM documents').get().count !== 0 || target.db.prepare('SELECT revision FROM state WHERE id=1').get().revision !== 0) throw new Error('Destination must be empty; refusing to overwrite server data');
    for (const row of rows) {
      if (!allowed.has(row.collection) || !row.key || Buffer.byteLength(row.key)>512 || !Number.isSafeInteger(row.revision) || row.revision<1 || row.revision>namespace.revision || !Number.isSafeInteger(row.updated_at_ms) || row.updated_at_ms<0 || Buffer.byteLength(row.value_json)>32768) throw new Error('Unsupported legacy record; import rolled back');
      JSON.parse(row.value_json);
      target.db.prepare('INSERT INTO documents VALUES(?,?,?,?,?)').run(row.collection,row.key,row.value_json,row.revision,row.updated_at_ms);
    }
    target.db.prepare('UPDATE state SET revision=? WHERE id=1').run(namespace.revision);
    target.db.exec('COMMIT'); console.log(`Imported ${rows.length} HN documents. The source copy was not modified.`);
  } catch (error) { target.db.exec('ROLLBACK'); throw error; }
} finally { legacy.close(); target.close(); }
