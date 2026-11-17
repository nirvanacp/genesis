//! The `let.sql` request over one SQLite connection.
//!
//! A request is `{op: "exec" | "query", sql, args}`. Arguments are JSON null, booleans, numbers,
//! strings, or `{"$b64": "..."}` for bytes. An exec without arguments may hold several statements.
//! Replies are `{rowsAffected, lastInsertId}`, `{columns, rows}` or `{error: {code, message}}`
//! with code `CONSTRAINT`, `BUSY`, `SQL` or `LIMIT`.

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{Connection, ErrorCode, params_from_iter};
use serde::Deserialize;
use serde_json::Value;

use crate::Limits;

#[derive(Deserialize)]
struct Request {
    op: String,
    sql: String,
    #[serde(default)]
    args: Vec<Value>,
}

fn failure(code: &str, message: &str) -> String {
    serde_json::json!({ "error": { "code": code, "message": message } }).to_string()
}

fn sqlite_failure(error: &rusqlite::Error) -> String {
    let code = match error.sqlite_error_code() {
        Some(ErrorCode::ConstraintViolation) => "CONSTRAINT",
        Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => "BUSY",
        _ => "SQL",
    };
    let message = match error {
        rusqlite::Error::SqliteFailure(failure, Some(message)) => format!("{message} ({failure})"),
        other => other.to_string(),
    };
    failure(code, &message)
}

fn argument(value: Value) -> Result<SqlValue, String> {
    Ok(match value {
        Value::Null => SqlValue::Null,
        Value::Bool(flag) => SqlValue::Integer(flag.into()),
        Value::Number(number) => match (number.as_i64(), number.as_f64()) {
            (Some(integer), _) => SqlValue::Integer(integer),
            (None, Some(real)) => SqlValue::Real(real),
            _ => return Err(format!("argument {number} is out of range")),
        },
        Value::String(text) => SqlValue::Text(text),
        Value::Object(object) => match object.get("$b64") {
            Some(Value::String(text)) if object.len() == 1 => SqlValue::Blob(
                BASE64
                    .decode(text)
                    .map_err(|_| "argument $b64 is not base64".to_string())?,
            ),
            _ => return Err("an object argument is {\"$b64\": \"...\"}".into()),
        },
        Value::Array(_) => return Err("an argument cannot be a list".into()),
    })
}

/// One SQL value as JSON text: integers stay integers, REAL keeps a fraction, blobs become `$b64`.
fn value_json(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Null => "null".into(),
        ValueRef::Integer(integer) => integer.to_string(),
        ValueRef::Real(real) if real.is_finite() && real.fract() == 0.0 && real.abs() < 1e16 => {
            format!("{real:.1}")
        }
        ValueRef::Real(real) => {
            serde_json::Number::from_f64(real).map_or("null".into(), |n| n.to_string())
        }
        ValueRef::Text(text) => {
            Value::String(String::from_utf8_lossy(text).into_owned()).to_string()
        }
        ValueRef::Blob(bytes) => serde_json::json!({ "$b64": BASE64.encode(bytes) }).to_string(),
    }
}

enum Stop {
    Sql(rusqlite::Error),
    Limit(String),
}

impl From<rusqlite::Error> for Stop {
    fn from(error: rusqlite::Error) -> Self {
        Stop::Sql(error)
    }
}

fn exec(db: &Connection, sql: &str, args: Vec<SqlValue>) -> Result<String, Stop> {
    if args.is_empty() {
        db.execute_batch(sql)?;
    } else {
        let mut statement = db.prepare(sql)?;
        let mut rows = statement.query(params_from_iter(args))?;
        while rows.next()?.is_some() {}
    }
    Ok(format!(
        r#"{{"rowsAffected":{},"lastInsertId":{}}}"#,
        db.changes(),
        db.last_insert_rowid()
    ))
}

fn query(db: &Connection, sql: &str, args: Vec<SqlValue>, limits: &Limits) -> Result<String, Stop> {
    let mut statement = db.prepare(sql)?;
    let columns: Vec<String> = statement.column_names().map(String::from).collect();
    let width = columns.len();
    let mut reply = format!(r#"{{"columns":{},"rows":["#, Value::from(columns));
    let mut rows = statement.query(params_from_iter(args))?;
    let mut count = 0;
    while let Some(row) = rows.next()? {
        if count == limits.sql_rows {
            return Err(Stop::Limit(format!(
                "a query returns at most {} rows",
                limits.sql_rows
            )));
        }
        if count > 0 {
            reply.push(',');
        }
        reply.push('[');
        for index in 0..width {
            if index > 0 {
                reply.push(',');
            }
            reply.push_str(&value_json(row.get_ref(index)?));
        }
        reply.push(']');
        if reply.len() > limits.sql_reply_bytes {
            return Err(Stop::Limit(format!(
                "a query reply holds at most {} bytes",
                limits.sql_reply_bytes
            )));
        }
        count += 1;
    }
    reply.push_str("]}");
    Ok(reply)
}

/// Answers one `let.sql` request with its JSON reply.
pub fn run(db: &Connection, request: &[u8], limits: &Limits) -> String {
    let Ok(request) = serde_json::from_slice::<Request>(request) else {
        return failure("SQL", "invalid request");
    };
    let args = match request
        .args
        .into_iter()
        .map(argument)
        .collect::<Result<Vec<_>, _>>()
    {
        Ok(args) => args,
        Err(message) => return failure("SQL", &message),
    };
    let result = match request.op.as_str() {
        "exec" => exec(db, &request.sql, args),
        "query" => query(db, &request.sql, args, limits),
        other => return failure("SQL", &format!("unknown op {other}")),
    };
    match result {
        Ok(reply) => reply,
        Err(Stop::Sql(error)) => sqlite_failure(&error),
        Err(Stop::Limit(message)) => failure("LIMIT", &message),
    }
}
