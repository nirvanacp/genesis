//! Generic durable documents. This module runs only on the single storage worker.
use genesis_contracts::*;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
const NAMESPACE_STATE: &str = "SELECT schema_version,revision
    FROM namespaces
    WHERE profile_id='local' AND applet_id=?1";
const GET_DOCUMENT: &str = "SELECT value_json,revision,updated_at_ms
    FROM documents
    WHERE profile_id='local' AND applet_id=?1 AND collection=?2 AND key=?3";
const LIST_DOCUMENTS: &str = "SELECT key,value_json,revision,updated_at_ms
    FROM documents
    WHERE profile_id='local' AND applet_id=?1 AND collection=?2 AND (?3 IS NULL OR key>?3)
    ORDER BY key COLLATE BINARY LIMIT ?4";
const DOCUMENT_REVISION: &str = "SELECT revision
    FROM documents
    WHERE profile_id='local' AND applet_id=?1 AND collection=?2 AND key=?3";
const PUT_DOCUMENT: &str = "INSERT INTO documents(profile_id,applet_id,collection,key,value_json,revision,updated_at_ms)
    VALUES ('local',?1,?2,?3,?4,?5,?6)
    ON CONFLICT (profile_id,applet_id,collection,key)
    DO UPDATE  SET value_json=excluded.value_json,revision=excluded.revision,updated_at_ms=excluded.updated_at_ms";

const MAX_SAFE: u64 = 9_007_199_254_740_991;

#[derive(Debug)]
pub struct StorageError {
    pub code: &'static str,
    pub message: String,
}
impl From<rusqlite::Error> for StorageError {
    fn from(error: rusqlite::Error) -> Self {
        Self {
            code: "STORAGE_FAILURE",
            message: error.to_string(),
        }
    }
}
type Result<T> = std::result::Result<T, StorageError>;
fn invalid(message: &str) -> StorageError {
    StorageError {
        code: "INVALID_ARGUMENT",
        message: message.into(),
    }
}
fn quota(message: &str) -> StorageError {
    StorageError {
        code: "QUOTA_EXCEEDED",
        message: message.into(),
    }
}
fn key(collection: &str, key: &str) -> Result<()> {
    let bytes = collection.as_bytes();
    if bytes.is_empty()
        || bytes.len() > 64
        || !bytes[0].is_ascii_lowercase()
        || !bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
        || key.is_empty()
    {
        return Err(invalid("Invalid collection or empty key"));
    }
    if key.len() > 512 {
        return Err(quota("Key exceeds 512 UTF-8 bytes"));
    }
    Ok(())
}
pub fn validate(operation: &StorageOperation) -> Result<()> {
    if serde_json::to_vec(operation)
        .map_err(|_| invalid("Cannot encode storage operation"))?
        .len()
        > 262144
    {
        return Err(quota("Storage operation exceeds 256 KiB"));
    }
    match operation {
        StorageOperation::Get(k) => key(&k.collection, &k.key)?,
        StorageOperation::List(list) => {
            key(&list.collection, "validation")?;
            if list.limit == 0 || list.limit > 100 {
                return Err(invalid("List limit must be 1 to 100"));
            }
            if let Some(after) = &list.after_key {
                key(&list.collection, after)?;
            }
        }
        StorageOperation::Commit(batch) => {
            if batch.puts.len() + batch.deletes.len() > 64 || batch.checks.len() > 128 {
                return Err(quota("Batch exceeds check/modification limits"));
            }
            if batch.puts.is_empty() && batch.deletes.is_empty() {
                return Err(invalid("Commit needs a modification"));
            }
            let mut checked = HashSet::new();
            let mut modified = HashSet::new();
            for check in &batch.checks {
                key(&check.collection, &check.key)?;
                if check
                    .expected_revision
                    .is_some_and(|r| r == 0 || r > MAX_SAFE)
                    || !checked.insert((&check.collection, &check.key))
                {
                    return Err(invalid("Invalid or duplicate revision check"));
                }
            }
            for put in &batch.puts {
                key(&put.collection, &put.key)?;
                if serde_json::to_vec(&put.value)
                    .map_err(|_| invalid("Invalid JSON"))?
                    .len()
                    > 32768
                {
                    return Err(quota("Document exceeds 32 KiB"));
                }
                if !modified.insert((&put.collection, &put.key)) {
                    return Err(invalid("Duplicate modification"));
                }
            }
            for delete in &batch.deletes {
                key(&delete.collection, &delete.key)?;
                if !modified.insert((&delete.collection, &delete.key)) {
                    return Err(invalid("Duplicate modification"));
                }
            }
            if !modified.iter().all(|pair| checked.contains(pair)) {
                return Err(invalid("Every modification requires a revision check"));
            }
        }
    }
    Ok(())
}
pub struct Database {
    connection: Connection,
}
impl Database {
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(2))?;
        connection.execute_batch("PRAGMA foreign_keys=ON;")?;
        let version: u32 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 1 {
            return Err(invalid(
                "Database schema is newer than this build; data preserved",
            ));
        }
        if version == 0 {
            connection.execute_batch("BEGIN IMMEDIATE;
                CREATE TABLE IF NOT EXISTS namespaces (
                  profile_id TEXT NOT NULL, applet_id TEXT NOT NULL, schema_version INTEGER NOT NULL,
                  revision INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(profile_id,applet_id));
                CREATE TABLE IF NOT EXISTS documents (
                  profile_id TEXT NOT NULL, applet_id TEXT NOT NULL, collection TEXT NOT NULL, key TEXT NOT NULL,
                  value_json TEXT NOT NULL, revision INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL,
                  PRIMARY KEY(profile_id,applet_id,collection,key),
                  FOREIGN KEY(profile_id,applet_id) REFERENCES namespaces(profile_id,applet_id));
                PRAGMA user_version=1; COMMIT;")?;
        }
        Ok(Self { connection })
    }
    pub fn execute(
        &mut self,
        applet: &str,
        schema: u32,
        operation: &StorageOperation,
    ) -> Result<(Value, Vec<StorageKey>)> {
        validate(operation)?;
        if schema != 1 {
            return Err(invalid("Unsupported applet schema; data preserved"));
        }
        let transaction = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute("INSERT INTO namespaces(profile_id,applet_id,schema_version) VALUES('local',?1,?2) ON CONFLICT DO NOTHING",params![applet,schema])?;
        let (stored_schema, revision): (u32, i64) =
            transaction.query_row(NAMESPACE_STATE, [applet], |r| Ok((r.get(0)?, r.get(1)?)))?;
        if !(0..=MAX_SAFE as i64).contains(&revision) {
            return Err(invalid("Invalid stored revision; data preserved"));
        }
        if stored_schema != schema {
            return Err(invalid("Incompatible applet data schema; data preserved"));
        }
        let mut changed = Vec::new();
        let result = match operation {
            StorageOperation::Get(k) => {
                let document: Option<(String, i64, i64)> = transaction
                    .query_row(GET_DOCUMENT, params![applet, k.collection, k.key], |r| {
                        Ok((r.get(0)?, r.get(1)?, r.get(2)?))
                    })
                    .optional()?;
                let document = document
                    .map(|(value, revision, time)| stored_document(&k.key, &value, revision, time))
                    .transpose()?;
                json!({"document":document,"namespaceRevision":revision})
            }
            StorageOperation::List(list) => {
                let mut statement = transaction.prepare(LIST_DOCUMENTS)?;
                let mut rows = statement.query(params![
                    applet,
                    list.collection,
                    list.after_key,
                    (list.limit + 1) as i64
                ])?;
                let mut entries = Vec::new();
                let mut bytes = 512;
                let mut more = false;
                while let Some(row) = rows.next()? {
                    let key: String = row.get(0)?;
                    let value: String = row.get(1)?;
                    let document = stored_document(&key, &value, row.get(2)?, row.get(3)?)?;
                    let size = serde_json::to_vec(&document)
                        .map_err(|_| invalid("Cannot encode stored document"))?
                        .len()
                        + 1;
                    if entries.len() >= list.limit || bytes + size > 254000 {
                        more = true;
                        break;
                    }
                    bytes += size;
                    entries.push(document);
                }
                let next = if more {
                    entries.last().map(|v| v["key"].clone())
                } else {
                    None
                };
                json!({"entries":entries,"nextAfterKey":next,"namespaceRevision":revision})
            }
            StorageOperation::Commit(batch) => {
                for check in &batch.checks {
                    let actual: Option<i64> = transaction
                        .query_row(
                            DOCUMENT_REVISION,
                            params![applet, check.collection, check.key],
                            |r| r.get(0),
                        )
                        .optional()?;
                    if actual != check.expected_revision.map(|r| r as i64) {
                        return Err(StorageError {
                            code: "CONFLICT",
                            message: "Data changed. Reload the record before retrying.".into(),
                        });
                    }
                }
                let next = revision
                    .checked_add(1)
                    .filter(|v| *v <= MAX_SAFE as i64)
                    .ok_or_else(|| quota("Namespace revision exhausted"))?;
                let time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|_| invalid("System clock is before epoch"))?
                    .as_millis();
                let time = i64::try_from(time)
                    .ok()
                    .filter(|v| *v <= MAX_SAFE as i64)
                    .ok_or_else(|| quota("Timestamp exhausted"))?;
                transaction.execute(
                    "UPDATE namespaces SET revision=?2 WHERE profile_id='local' AND applet_id=?1",
                    params![applet, next],
                )?;
                for put in &batch.puts {
                    transaction.execute(
                        PUT_DOCUMENT,
                        params![
                            applet,
                            put.collection,
                            put.key,
                            put.value.to_string(),
                            next,
                            time
                        ],
                    )?;
                    changed.push(StorageKey {
                        collection: put.collection.clone(),
                        key: put.key.clone(),
                    });
                }
                for delete in &batch.deletes {
                    transaction.execute("DELETE FROM documents WHERE profile_id='local' AND applet_id=?1 AND collection=?2 AND key=?3",params![applet,delete.collection,delete.key])?;
                    changed.push(delete.clone());
                }
                json!({"namespaceRevision":next})
            }
        };
        transaction.commit()?; // A successful response exists only after the durable commit.
        Ok((result, changed))
    }
}
fn stored_document(key: &str, value: &str, revision: i64, time: i64) -> Result<Value> {
    if !(1..=MAX_SAFE as i64).contains(&revision) || !(0..=MAX_SAFE as i64).contains(&time) {
        return Err(invalid("Invalid stored counters; data preserved"));
    }
    let value: Value = serde_json::from_str(value).map_err(|_| StorageError {
        code: "STORAGE_FAILURE",
        message: "Stored JSON is invalid; data preserved".into(),
    })?;
    Ok(json!({"key":key,"value":value,"revision":revision,"updatedAtMs":time}))
}
pub fn response(job: &StorageJob, result: Result<(Value, Vec<StorageKey>)>) -> StorageCompletion {
    let (response, changed) = match result {
        Ok((value, changed)) => (
            json!({"v":1,"documentId":job.document_id,"requestId":job.request_id,"ok":true,"result":value}),
            changed,
        ),
        Err(error) => (
            json!({"v":1,"documentId":job.document_id,"requestId":job.request_id,"ok":false,
            "error":{"code":error.code,"message":error.message,"retryable":error.code=="BUSY"||error.code=="CONFLICT"}}),
            vec![],
        ),
    };
    StorageCompletion {
        generation: job.generation,
        document_id: job.document_id.clone(),
        channel: job.channel,
        request_id: job.request_id.clone(),
        applet_id: job.applet_id.clone(),
        response,
        changed,
    }
}
