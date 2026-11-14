//! User actions from the applet UI and the files they pick. The shell carries out each action
//! after a fresh tap and keeps every picked file; the host only knows the ids the applet holds,
//! and asks the shell to post files to a page for `attachFiles`. File bytes never pass the host.
use crate::{documents::PendingOp, host::Host};
use genesis_contracts::*;
use serde_json::{Value, json};
use std::collections::HashMap;

/// The applet's picked files, and the shell round trips that will report on them.
#[derive(Default)]
pub struct FileHandles {
    /// Picked files the applet holds, by id.
    pub files: HashMap<String, FileRef>,
    /// `files.pick` actions waiting for the shell.
    pub picks: Vec<u64>,
    /// `page.files` transfers waiting for the shell, with their file count.
    pub sends: HashMap<u64, usize>,
}

/// A file id from the shell: 32 lowercase hex characters.
fn file_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// An `accept` entry: a MIME type such as `image/png` or `image/*`, or a `.ext` suffix.
fn accept_entry(entry: &str) -> bool {
    let token = |s: &str| !s.is_empty() && s.len() <= 64 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"+-._".contains(&b));
    if let Some(ext) = entry.strip_prefix('.') {
        return token(ext);
    }
    match entry.split_once('/') {
        Some((kind, sub)) => token(kind) && (sub == "*" || token(sub)),
        None => false,
    }
}

/// An `https` URL with a host and no credentials.
fn https_url(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|u| u.scheme() == "https" && u.host_str().is_some() && u.username().is_empty() && u.password().is_none())
}

fn web_url(value: &str) -> bool {
    url::Url::parse(value).is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some() && u.username().is_empty() && u.password().is_none())
}

const EXTERNAL_SCHEMES: [&str; 7] = ["mailto", "tel", "sms", "smsto", "geo", "intent", "https"];

fn invalid(message: impl Into<String>) -> ErrorBody {
    ErrorBody::new(ErrorCode::InvalidArgument, message)
}

/// Why a user action's parameters are refused, before the shell sees it.
pub fn action_problem(action: &UserAction) -> Result<(), ErrorBody> {
    match action {
        UserAction::PickFiles { accept, .. } => {
            if accept.len() > ACCEPT_MAX || !accept.iter().all(|a| accept_entry(a)) {
                return Err(invalid(format!("files.pick takes up to {ACCEPT_MAX} MIME types or .ext suffixes in accept")));
            }
        }
        UserAction::Save { url, filename } => {
            let data = url.len() >= 5 && url[..5].eq_ignore_ascii_case("data:");
            if data && url.len() > SAVE_DATA_URL_MAX {
                return Err(invalid("downloads.save takes a data: URL of at most 2 MiB"));
            }
            if !data && !https_url(url) {
                return Err(invalid("downloads.save takes an https or data: URL without credentials"));
            }
            if let Some(name) = filename {
                let length = name.chars().count();
                let usable = (1..=FILENAME_MAX).contains(&length) && name.trim() == name && name != "." && name != "..";
                if !usable || name.chars().any(|c| c == '/' || c == '\\' || c.is_control()) {
                    return Err(invalid(format!("downloads.save takes a filename of 1 to {FILENAME_MAX} characters without /")));
                }
            }
        }
        UserAction::Share { title, text, url } => {
            if title.is_none() && text.is_none() && url.is_none() {
                return Err(invalid("share.open needs a title, text or url"));
            }
            if title.as_ref().is_some_and(|t| t.chars().count() > SHARE_TITLE_MAX) {
                return Err(invalid(format!("share.open takes a title of at most {SHARE_TITLE_MAX} characters")));
            }
            if text.as_ref().is_some_and(|t| t.chars().count() > SHARE_TEXT_MAX) {
                return Err(invalid(format!("share.open takes text of at most {SHARE_TEXT_MAX} characters")));
            }
            if url.as_ref().is_some_and(|u| !web_url(u)) {
                return Err(invalid("share.open takes an http or https url"));
            }
        }
        UserAction::OpenExternal { url } => {
            let scheme = url.split_once(':').map(|(s, _)| s.to_ascii_lowercase());
            let allowed = scheme.as_deref().is_some_and(|s| EXTERNAL_SCHEMES.contains(&s));
            if !allowed || (scheme.as_deref() == Some("https") && !https_url(url)) {
                return Err(invalid("links.openExternal takes a mailto, tel, sms, smsto, geo, intent or https URL"));
            }
        }
        UserAction::Grant { .. } | UserAction::EnableNotifications => {}
    }
    Ok(())
}

impl Host {
    /// Hands a user action to the shell. The request stays open until the shell answers
    /// `UserActionDone`, for up to `USER_ACTION_DEADLINE_MS`, since the user may be in a picker.
    pub fn begin_user_action(&mut self, view: &ViewRef, document_id: &str, request_id: u64, context: Option<ViewRef>, action: UserAction, now: u64) -> Result<(), ErrorBody> {
        if !self.limits.user_actions {
            return Err(ErrorBody::new(ErrorCode::UnknownMethod, "User actions are not available in this Genesis"));
        }
        action_problem(&action)?;
        if self.documents.pending_count(document_id) >= self.limits.pending_requests_max {
            return Err(ErrorBody::new(ErrorCode::QuotaExceeded, "Too many pending requests"));
        }
        let op = PendingOp { view: view.clone(), document_id: document_id.into(), request_id, deadline_ms: now + USER_ACTION_DEADLINE_MS };
        let token = self.documents.begin_op(op);
        if matches!(action, UserAction::PickFiles { .. })
            && let Some(session) = self.session_mut(&view.applet_id)
        {
            session.files.picks.push(token);
        }
        self.out.push(ShellCommand::UserAction { applet_id: view.applet_id.clone(), token, view: context, action });
        Ok(())
    }

    /// The shell's answer to `UserAction`. A pick's files become the applet's handles.
    pub fn user_action_done(&mut self, token: u64, succeeded: bool, code: Option<ErrorCode>, message: Option<String>, result: Option<Value>) {
        let mut result = result.unwrap_or_else(|| json!({}));
        let waiting = self.documents.has_op(token);
        let picker = self.contexts.sessions.values_mut().find(|s| s.files.picks.contains(&token));
        let applet_id = picker.as_ref().map(|s| s.applet_id.clone());
        if let Some(session) = picker {
            session.files.picks.retain(|t| *t != token);
            let picked = if succeeded { picked_files(&result) } else { Vec::new() };
            if waiting {
                for file in &picked {
                    session.files.files.insert(file.id.clone(), file.clone());
                }
                let files: Vec<Value> = picked.iter().map(|f| json!({ "id": f.id, "name": f.name, "type": f.mime, "size": f.size })).collect();
                result = json!({ "files": files });
            } else if !picked.is_empty() {
                // Nobody waits for these files any more: the request ran out of time.
                let ids = picked.into_iter().map(|f| f.id).collect();
                self.out.push(ShellCommand::ReleaseFiles { applet_id: session.applet_id.clone(), ids });
            }
        }
        let outcome = match succeeded {
            true => Ok(result),
            false => Err(ErrorBody::new(code.unwrap_or(ErrorCode::InvalidArgument), message.unwrap_or_else(|| "The action did not run".into()))),
        };
        self.finish_op(token, applet_id.as_deref(), outcome);
    }

    /// The applet lets go of picked files; the shell forgets them too.
    pub fn release_files(&mut self, applet_id: &str, ids: Vec<String>) {
        let Some(session) = self.session_mut(applet_id) else { return };
        let ids: Vec<String> = ids.into_iter().filter(|id| session.files.files.remove(id).is_some()).collect();
        if !ids.is_empty() {
            self.out.push(ShellCommand::ReleaseFiles { applet_id: applet_id.into(), ids });
        }
    }

    /// Has the shell post picked files to the asking context document, for one of its open calls.
    /// The request stays open until the shell reports `FilesSent`, the call's deadline passes or
    /// the document is retired.
    pub fn page_files(&mut self, view: &ViewRef, document_id: &str, request_id: u64, call_id: String, ids: Vec<String>) -> Result<(), ErrorBody> {
        if !self.limits.user_actions {
            return Err(ErrorBody::new(ErrorCode::UnknownMethod, "Attaching files is not available in this Genesis"));
        }
        if ids.is_empty() || ids.len() > FILES_MAX {
            return Err(invalid(format!("page.files takes 1 to {FILES_MAX} file ids")));
        }
        let Role::Context(id) = &view.role else { unreachable!() };
        let Some(session) = self.session(&view.applet_id) else {
            return Err(ErrorBody::new(ErrorCode::Retired, "The applet is not active"));
        };
        if session.contexts.get(id).is_some_and(|c| c.navigating_since.is_some()) {
            return Err(ErrorBody::new(ErrorCode::ContextReplaced, "The page changed before the files were sent"));
        }
        let Some(handle) = session.calls.get(&call_id).filter(|c| c.context_document == document_id) else {
            return Err(ErrorBody::new(ErrorCode::NotFound, "page.files needs an open call of this page"));
        };
        let mut files = Vec::with_capacity(ids.len());
        for file_id in &ids {
            match session.files.files.get(file_id) {
                Some(file) => files.push(file.clone()),
                None => return Err(ErrorBody::new(ErrorCode::FileUnavailable, format!("File {file_id} is unknown, expired or released"))),
            }
        }
        if files.iter().map(|f| f.size).sum::<u64>() > FILES_BYTES_MAX {
            return Err(invalid("page.files sends at most 128 MiB"));
        }
        let op = PendingOp { view: view.clone(), document_id: document_id.into(), request_id, deadline_ms: handle.deadline_ms };
        let token = self.documents.begin_op(op);
        if let Some(session) = self.session_mut(&view.applet_id) {
            session.files.sends.insert(token, files.len());
        }
        self.out.push(ShellCommand::SendFiles { view: view.clone(), token, files });
        Ok(())
    }

    /// The shell ended a context's one-time grant; the foreground learns whether the page used it.
    pub fn grant_ended(&mut self, view: &ViewRef, grant: GrantKind, used: bool) {
        let Role::Context(id) = &view.role else { return };
        if self.context_view(&view.applet_id, id).is_none() {
            return;
        }
        self.foreground_event(&view.applet_id, "context.grantEnded", json!({ "id": id, "grant": grant, "used": used }));
    }

    /// The shell's answer to `SendFiles`: ends the `page.files` request with the file count.
    pub fn files_sent(&mut self, token: u64, succeeded: bool, code: Option<ErrorCode>, message: Option<String>) {
        let sender = self.contexts.sessions.values_mut().find(|s| s.files.sends.contains_key(&token));
        let Some(session) = sender else { return };
        let count = session.files.sends.remove(&token).unwrap_or(0);
        let applet_id = session.applet_id.clone();
        let outcome = match succeeded {
            true => Ok(json!({ "count": count })),
            false => Err(ErrorBody::new(code.unwrap_or(ErrorCode::FileUnavailable), message.unwrap_or_else(|| "The files could not be sent".into()))),
        };
        self.finish_op(token, Some(&applet_id), outcome);
    }
}

/// The files of a pick result, `{files: [{id, name, type, size}]}`, keeping well-formed ones up
/// to the limits.
fn picked_files(result: &Value) -> Vec<FileRef> {
    let Some(files) = result.get("files").and_then(Value::as_array) else { return Vec::new() };
    files
        .iter()
        .filter_map(|f| {
            let id = f.get("id")?.as_str().filter(|id| file_id(id))?;
            let size = f.get("size")?.as_u64().filter(|size| *size <= FILE_BYTES_MAX)?;
            let name = f.get("name").and_then(Value::as_str).unwrap_or("file").to_string();
            let mime = f.get("type").and_then(Value::as_str).unwrap_or("application/octet-stream").to_string();
            Some(FileRef { id: id.into(), name, mime, size })
        })
        .take(FILES_MAX)
        .collect()
}
