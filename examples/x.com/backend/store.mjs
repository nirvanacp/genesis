import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { fail, object, text, normalize, categoryName, uuid, postId, handle, revision, canonicalUrl, snapshot, digest } from './model.mjs';

/** Personal library. Authorization comes from the service token, never a caller's handle. */
export class Store {
  constructor(filename, {expectedHandle} = {}) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Database is newer than this server; data preserved');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS libraries(id TEXT PRIMARY KEY, expected_handle TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS categories(library_id TEXT NOT NULL REFERENCES libraries(id), id TEXT NOT NULL,
        name TEXT NOT NULL, name_key TEXT NOT NULL, revision INTEGER NOT NULL, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(library_id,id), UNIQUE(library_id,name_key));
      CREATE TABLE IF NOT EXISTS saved_posts(library_id TEXT NOT NULL REFERENCES libraries(id), post_id TEXT NOT NULL,
        url TEXT NOT NULL, snapshot TEXT NOT NULL, search_text TEXT NOT NULL, revision INTEGER NOT NULL,
        saved_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL, PRIMARY KEY(library_id,post_id));
      CREATE TABLE IF NOT EXISTS memberships(library_id TEXT NOT NULL, post_id TEXT NOT NULL, category_id TEXT NOT NULL,
        PRIMARY KEY(library_id,post_id,category_id),
        FOREIGN KEY(library_id,post_id) REFERENCES saved_posts(library_id,post_id) ON DELETE CASCADE,
        FOREIGN KEY(library_id,category_id) REFERENCES categories(library_id,id));
      CREATE INDEX IF NOT EXISTS saved_order ON saved_posts(library_id,saved_at_ms DESC,post_id DESC);
      CREATE INDEX IF NOT EXISTS category_members ON memberships(library_id,category_id,post_id);
      CREATE TABLE IF NOT EXISTS operations(library_id TEXT NOT NULL REFERENCES libraries(id), id TEXT NOT NULL,
        request_hash TEXT NOT NULL, receipt TEXT NOT NULL, created_at_ms INTEGER NOT NULL, PRIMARY KEY(library_id,id));
      PRAGMA user_version=1;
    `);
    let library = this.db.prepare('SELECT * FROM libraries').get();
    if (!library) {
      const expected = handle(expectedHandle);
      this.db.prepare('INSERT INTO libraries VALUES(?,?,0)').run(randomUUID(), expected);
      library = this.db.prepare('SELECT * FROM libraries').get();
    }
    if (expectedHandle && handle(expectedHandle) !== library.expected_handle) throw new Error('Configured account differs from the existing library; data preserved');
    this.libraryId = library.id;
  }
  close() { this.db.close(); }
  library() {
    const row = this.db.prepare('SELECT * FROM libraries WHERE id=?').get(this.libraryId);
    return {version:1,libraryId:row.id,expectedHandle:row.expected_handle,revision:row.revision};
  }
  read(callback) {
    this.db.exec('BEGIN');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  category(id) { return this.db.prepare('SELECT * FROM categories WHERE library_id=? AND id=?').get(this.libraryId,id); }
  saved(id) { return this.db.prepare('SELECT * FROM saved_posts WHERE library_id=? AND post_id=?').get(this.libraryId,id); }
  categoryRecord(row) {
    return {version:1,id:row.id,name:row.name,nameKey:row.name_key,revision:row.revision,createdAtMs:row.created_at_ms,updatedAtMs:row.updated_at_ms,count:row.count ?? 0};
  }
  memberships(id) { return this.db.prepare('SELECT category_id FROM memberships WHERE library_id=? AND post_id=? ORDER BY category_id').all(this.libraryId,id).map(r => r.category_id); }
  savedRecord(row) {
    return {version:1,postId:row.post_id,url:row.url,snapshot:JSON.parse(row.snapshot),revision:row.revision,savedAtMs:row.saved_at_ms,updatedAtMs:row.updated_at_ms,categoryIds:this.memberships(row.post_id)};
  }
  categories() {
    return this.read(() => ({libraryRevision:this.library().revision,categories:this.db.prepare(`SELECT c.*,COUNT(m.post_id) AS count FROM categories c
      LEFT JOIN memberships m ON c.library_id=m.library_id AND c.id=m.category_id WHERE c.library_id=? GROUP BY c.id ORDER BY c.name_key,c.id`).all(this.libraryId).map(r=>this.categoryRecord(r))}));
  }
  lookup(input) {
    object(input); const ids = input.postIds;
    if (!Array.isArray(ids) || ids.length > 50 || new Set(ids).size !== ids.length) fail('INVALID_ARGUMENT','Lookup requires up to 50 unique post IDs');
    ids.forEach(postId);
    return this.read(() => {
      const records = [], missingIds = [];
      for (const id of ids) { const row = this.saved(id); if (row) records.push({postId:id,revision:row.revision,categoryIds:this.memberships(id)}); else missingIds.push(id); }
      return {records,missingIds,libraryRevision:this.library().revision};
    });
  }
  query(input) {
    object(input);
    const categoryId = input.categoryId == null ? null : uuid(input.categoryId);
    const query = normalize(text(input.query ?? '',200,800,true));
    if (input.limit !== 20) fail('INVALID_ARGUMENT','Page limit must be 20');
    const filterHash = digest({categoryId,query});
    return this.read(() => {
      const libraryRevision = this.library().revision;
      if (categoryId && !this.category(categoryId)) fail('CATEGORY_MISSING','This category no longer exists',409);
      let cursor = null;
      if (input.cursor != null) {
        try { cursor = JSON.parse(Buffer.from(text(input.cursor,2048),'base64url').toString('utf8')); } catch { fail('INVALID_ARGUMENT','Invalid cursor'); }
        object(cursor);
        if (cursor.libraryId !== this.libraryId || cursor.filterHash !== filterHash || cursor.libraryRevision !== libraryRevision) fail('CURSOR_STALE','Saved posts changed. Refresh the list.',409);
        postId(cursor.postId);
        if (!Number.isSafeInteger(cursor.savedAtMs) || cursor.savedAtMs < 0) fail('INVALID_ARGUMENT','Invalid cursor position');
      }
      const rows = this.db.prepare(`SELECT p.* FROM saved_posts p WHERE p.library_id=?
        AND (? IS NULL OR EXISTS(SELECT 1 FROM memberships m WHERE m.library_id=p.library_id AND m.post_id=p.post_id AND m.category_id=?))
        AND instr(p.search_text,?)>0 AND (? IS NULL OR p.saved_at_ms<? OR (p.saved_at_ms=? AND p.post_id<?))
        ORDER BY p.saved_at_ms DESC,p.post_id DESC LIMIT 21`).all(this.libraryId,categoryId,categoryId,query,cursor?.savedAtMs??null,cursor?.savedAtMs??0,cursor?.savedAtMs??0,cursor?.postId??'');
      const entries=[]; let bytes=1024;
      for (const row of rows) {
        const entry=this.savedRecord(row), size=Buffer.byteLength(JSON.stringify(entry));
        if (entries.length===20 || bytes+size>192*1024) break;
        entries.push(entry); bytes+=size;
      }
      const last=entries.at(-1), more=entries.length<rows.length;
      const nextCursor=more && last ? Buffer.from(JSON.stringify({libraryId:this.libraryId,filterHash,libraryRevision,savedAtMs:last.savedAtMs,postId:last.postId})).toString('base64url'):null;
      return {entries,nextCursor,libraryRevision,filter:{categoryId,query}};
    });
  }
  operation(id) {
    const row=this.db.prepare('SELECT receipt FROM operations WHERE library_id=? AND id=?').get(this.libraryId,uuid(id));
    if (!row) fail('OPERATION_NOT_FOUND','No committed operation found',404);
    return JSON.parse(row.receipt);
  }
  operate(input) {
    object(input); const operationId=uuid(input.operationId), payload=object(input.payload), kind=input.kind;
    if (!['category.create','category.rename','category.delete','bookmark.setCategories','bookmark.remove'].includes(kind)) fail('INVALID_ARGUMENT','Unknown operation');
    const requestHash=digest({kind,payload});
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing=this.db.prepare('SELECT * FROM operations WHERE library_id=? AND id=?').get(this.libraryId,operationId);
      if (existing) {
        if (existing.request_hash!==requestHash) fail('OPERATION_REUSED','Operation ID was used for a different change',409);
        this.db.exec('COMMIT'); return JSON.parse(existing.receipt);
      }
      const next=this.library().revision+1, now=Date.now();
      if (!Number.isSafeInteger(next)) fail('LIMIT_REACHED','Library revision exhausted',503);
      let result;
      if (kind.startsWith('category.')) result=this.changeCategory(kind,payload,next,now);
      else result=this.changeBookmark(kind,payload,next,now);
      this.db.prepare('UPDATE libraries SET revision=? WHERE id=?').run(next,this.libraryId);
      const receipt={operationId,kind,status:'committed',result,libraryRevision:next,createdAtMs:now};
      this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(this.libraryId,operationId,requestHash,JSON.stringify(receipt),now);
      this.db.exec('COMMIT'); return receipt;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  changeCategory(kind,payload,next,now) {
    const id=uuid(payload.id), row=this.category(id);
    if (kind==='category.create') {
      if (row) fail('CONFLICT','Category already exists. Refresh before changing it.',409);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM categories WHERE library_id=?').get(this.libraryId).n>=50) fail('LIMIT_REACHED','You can create up to 50 categories',409);
    } else if (!row || row.revision!==revision(payload.expectedRevision)) fail('CONFLICT','Category changed. Refresh before changing it.',409);
    if (kind==='category.delete') {
      if (this.db.prepare('SELECT 1 FROM memberships WHERE library_id=? AND category_id=? LIMIT 1').get(this.libraryId,id)) fail('CATEGORY_NOT_EMPTY','Move or remove saved posts before deleting this category',409);
      this.db.prepare('DELETE FROM categories WHERE library_id=? AND id=?').run(this.libraryId,id);
      return {id,removed:true};
    }
    const {name,nameKey}=categoryName(payload.name);
    const duplicate=this.db.prepare('SELECT id FROM categories WHERE library_id=? AND name_key=? AND id<>?').get(this.libraryId,nameKey,id);
    if (duplicate) fail('CATEGORY_NAME_EXISTS','A category with this name already exists',409,{existingCategoryId:duplicate.id});
    if (kind==='category.create') this.db.prepare('INSERT INTO categories VALUES(?,?,?,?,?,?,?)').run(this.libraryId,id,name,nameKey,next,now,now);
    else this.db.prepare('UPDATE categories SET name=?,name_key=?,revision=?,updated_at_ms=? WHERE library_id=? AND id=?').run(name,nameKey,next,now,this.libraryId,id);
    return this.categoryRecord(this.category(id));
  }
  changeBookmark(kind,payload,next,now) {
    const id=postId(payload.postId), row=this.saved(id), expected=revision(payload.expectedRevision,true);
    if ((row?.revision??null)!==expected) fail('CONFLICT','Saved post changed. Refresh before changing it.',409);
    if (kind==='bookmark.remove') {
      if (!row) fail('CONFLICT','Saved post no longer exists',409);
      this.db.prepare('DELETE FROM saved_posts WHERE library_id=? AND post_id=?').run(this.libraryId,id);
      return {postId:id,removed:true};
    }
    let ids=payload.categoryIds;
    if (!Array.isArray(ids) || ids.length<1 || ids.length>10 || new Set(ids).size!==ids.length) fail('INVALID_ARGUMENT','Choose between 1 and 10 categories');
    ids=ids.map(uuid);
    if (new Set(ids).size!==ids.length) fail('INVALID_ARGUMENT','Duplicate category membership');
    for (const category of ids) if (!this.category(category)) fail('CATEGORY_MISSING','A selected category no longer exists',409);
    if (!row) {
      const canonical=canonicalUrl(payload.url,id), captured=snapshot(payload.snapshot,canonical.handle);
      this.db.prepare('INSERT INTO saved_posts VALUES(?,?,?,?,?,?,?,?)').run(this.libraryId,id,canonical.url,JSON.stringify(captured),normalize(`${captured.authorHandle} ${captured.authorName} ${captured.text}`),next,now,now);
    } else this.db.prepare('UPDATE saved_posts SET revision=?,updated_at_ms=? WHERE library_id=? AND post_id=?').run(next,now,this.libraryId,id);
    this.db.prepare('DELETE FROM memberships WHERE library_id=? AND post_id=?').run(this.libraryId,id);
    const insert=this.db.prepare('INSERT INTO memberships VALUES(?,?,?)');
    for (const category of ids) insert.run(this.libraryId,id,uuid(category));
    return this.savedRecord(this.saved(id));
  }
}
