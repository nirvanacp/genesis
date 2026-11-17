//! `servelet-run <wasm> <database> <checks.json>`: sends the health request and the requests in
//! `checks.json` (`[{method, path, body?, expectStatus}]`) to a servelet module and prints each
//! status and body, for comparing with `let-servelet check`. Exits with 1 when a status differs.

use std::path::Path;
use std::process::ExitCode;
use std::time::Instant;

use genesis_servelet_runtime::{Limits, Request, Servelet};
use serde_json::Value;

fn run(wasm: &str, database: &str, checks: &str) -> Result<bool, String> {
    let bytes = std::fs::read(wasm).map_err(|e| format!("{wasm}: {e}"))?;
    let checks: Vec<Value> = serde_json::from_str(
        &std::fs::read_to_string(checks).map_err(|e| format!("{checks}: {e}"))?,
    )
    .map_err(|e| format!("{checks}: {e}"))?;
    let started = Instant::now();
    let mut servelet = Servelet::open(&bytes, Path::new(database), Limits::default())
        .map_err(|e| e.to_string())?;
    println!("open {:?}", started.elapsed());
    let mut passed = true;
    let health = std::iter::once(
        serde_json::json!({ "method": "GET", "path": "/health", "expectStatus": 200 }),
    );
    for (index, check) in health.chain(checks).enumerate() {
        let request = Request {
            method: check["method"].as_str().unwrap_or("GET").into(),
            path: check["path"].as_str().unwrap_or("/").into(),
            body: check.get("body").cloned(),
        };
        let started = Instant::now();
        match servelet.handle(&request) {
            Ok(reply) => {
                let expected = check["expectStatus"].as_u64();
                let mark = if expected == Some(u64::from(reply.status)) {
                    "ok"
                } else {
                    passed = false;
                    "MISMATCH"
                };
                println!(
                    "{index}. {} {} -> {} {} [{mark}, {:?}]",
                    request.method,
                    request.path,
                    reply.status,
                    reply.body,
                    started.elapsed()
                );
            }
            Err(failure) => {
                passed = false;
                println!(
                    "{index}. {} {} -> {failure} [{:?}]",
                    request.method,
                    request.path,
                    started.elapsed()
                );
                servelet = Servelet::open(&bytes, Path::new(database), Limits::default())
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(passed)
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let [wasm, database, checks] = args.as_slice() else {
        eprintln!("usage: servelet-run <wasm> <database> <checks.json>");
        return ExitCode::from(2);
    };
    match run(wasm, database, checks) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::FAILURE,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}
