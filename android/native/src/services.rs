//! Service requests. A remote service goes to the shell's `ServiceClient`, which keeps the
//! credentials; a local one goes to the applet's bundled servelet. The host checks the
//! declaration and routes replies back to the requesting document.
use crate::servelets::{LocalServelet, ServeletJob};
use genesis_contracts::{ErrorBody, ErrorCode, Manifest, ShellCommand};
use genesis_servelet_runtime::Request;
use serde_json::{Value, json};

const METHODS: [&str; 5] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

pub struct ServiceCall {
    pub service_id: String,
    pub path: String,
    pub method: String,
    pub body: Option<Value>,
}

pub enum Route {
    Remote(Box<ShellCommand>),
    Local(ServeletJob),
}

/// `local` is the revision's servelet for the service, None for a remote service.
pub fn route(
    manifest: &Manifest,
    local: Option<&Result<LocalServelet, String>>,
    request_id: u64,
    call: ServiceCall,
) -> Result<Route, ErrorBody> {
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
    match local {
        None => Ok(Route::Remote(Box::new(ShellCommand::ServiceRequest {
            request_id,
            applet_id: manifest.id.clone(),
            service_id: call.service_id,
            path: call.path,
            method: call.method,
            body: call.body,
        }))),
        Some(Ok(servelet)) => Ok(Route::Local(ServeletJob {
            request_id,
            applet_id: manifest.id.clone(),
            servelet: servelet.clone(),
            request: Request { method: call.method, path: call.path, body: call.body },
            service_id: call.service_id,
        })),
        Some(Err(reason)) => {
            Err(ErrorBody::new(ErrorCode::ServiceFailure, format!("Servelet {} is unavailable: {reason}", call.service_id)))
        }
    }
}

pub fn result(status: u16, body: Value) -> Value {
    json!({ "status": status, "body": body })
}
