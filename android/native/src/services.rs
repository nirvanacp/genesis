//! Service requests. Credentials stay in the shell's `ServiceClient`; the host only checks the
//! declaration and routes replies back to the requesting document.
use genesis_contracts::{ErrorBody, ErrorCode, Manifest, ShellCommand};
use serde_json::{Value, json};

const METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

pub struct ServiceCall {
    pub service_id: String,
    pub path: String,
    pub method: String,
    pub body: Option<Value>,
}

pub fn command(manifest: &Manifest, request_id: u64, call: ServiceCall) -> Result<ShellCommand, ErrorBody> {
    let declared = manifest.capabilities.services.as_ref().is_some_and(|s| s.iter().any(|s| s.id == call.service_id));
    if !declared {
        return Err(ErrorBody::new(ErrorCode::ConfigurationRequired, format!("Service {} is not declared", call.service_id)));
    }
    if !call.path.starts_with('/') || call.path.starts_with("//") {
        return Err(ErrorBody::new(ErrorCode::InvalidArgument, "Service path must start with one /"));
    }
    if !METHODS.contains(&call.method.as_str()) {
        return Err(ErrorBody::new(ErrorCode::InvalidArgument, format!("Unsupported method {}", call.method)));
    }
    Ok(ShellCommand::ServiceRequest {
        request_id,
        applet_id: manifest.id.clone(),
        service_id: call.service_id,
        path: call.path,
        method: call.method,
        body: call.body,
    })
}

pub fn result(status: u16, body: Value) -> Value {
    json!({ "status": status, "body": body })
}
