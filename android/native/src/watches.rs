//! Watch subscriptions. The foreground subscribes to a watch once (`watch.subscribe`), and the
//! host opens it with a page call of its own in every document of the context that binds while
//! the subscription lasts. Host-made calls are ordinary page calls, so they keep the context
//! awake and expire at their deadline, but their results go to no document: an open that failed
//! reaches the foreground as a `status` emit with `status: "error"`.
use crate::{
    contexts::{CallHandle, Subscription, WatchCall},
    debug_log,
    host::Host,
};
use genesis_contracts::*;
use serde_json::{Value, json};

/// The longest watch id the host keeps; the page agent checks its characters.
const WATCH_ID_MAX: usize = 128;

impl Host {
    /// Adds the subscription, or keeps an equal one, and opens it in the context's bound document.
    pub fn watch_subscribe(&mut self, applet_id: &str, context: String, id: String, spec: Value, when: Option<Value>, now: u64) -> Result<Value, ErrorBody> {
        if self.context_view(applet_id, &context).is_none() {
            return Err(ErrorBody::new(ErrorCode::NotFound, format!("No context {context}")));
        }
        if id.is_empty() || id.len() > WATCH_ID_MAX {
            return Err(ErrorBody::new(ErrorCode::InvalidArgument, format!("A watch id has 1 to {WATCH_ID_MAX} characters")));
        }
        let watches_max = self.limits.watches_max;
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else {
            return Err(ErrorBody::new(ErrorCode::Retired, "The applet is not active"));
        };
        let key = (context.clone(), id.clone());
        match session.subscriptions.get(&key) {
            Some(existing) if existing.spec != spec || existing.when != when => {
                return Err(ErrorBody::new(ErrorCode::Conflict, format!("The watch {id} is subscribed with another specification")));
            }
            Some(_) => {}
            None => {
                if session.subscriptions.keys().filter(|(c, _)| *c == context).count() >= watches_max {
                    return Err(ErrorBody::new(ErrorCode::QuotaExceeded, format!("At most {watches_max} watches can be open")));
                }
                session.next_subscription += 1;
                let serial = session.next_subscription;
                session.subscriptions.insert(key, Subscription { spec, when, serial, open_in: None });
            }
        }
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "watch.subscribe", json!({ "context": context, "watch": id }));
        }
        self.open_watch(applet_id, &context, &id, now);
        Ok(json!({}))
    }

    /// Ends the subscription and closes the watch in the document it was opened in, if still bound.
    pub fn watch_unsubscribe(&mut self, applet_id: &str, context: String, id: String, now: u64) -> Result<Value, ErrorBody> {
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else {
            return Err(ErrorBody::new(ErrorCode::Retired, "The applet is not active"));
        };
        let Some(subscription) = session.subscriptions.remove(&(context.clone(), id.clone())) else { return Ok(json!({})) };
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "watch.unsubscribe", json!({ "context": context, "watch": id }));
        }
        let Some(target) = self.context_view(applet_id, &context) else { return Ok(json!({})) };
        let current = self.documents.current(&target).map(|d| d.id.clone());
        if let Some(document) = current.filter(|d| subscription.open_in.as_ref() == Some(d)) {
            let watch = WatchCall { id: id.clone(), serial: subscription.serial };
            self.watch_call(applet_id, &context, document, "watch.close", json!({ "id": id }), watch, now);
        }
        Ok(json!({}))
    }

    /// Opens every subscription of the context in its newly bound document.
    pub fn open_watches(&mut self, applet_id: &str, context: &str, now: u64) {
        let Some(session) = self.session(applet_id) else { return };
        let ids: Vec<String> = session.subscriptions.keys().filter(|(c, _)| c == context).map(|(_, id)| id.clone()).collect();
        for id in ids {
            self.open_watch(applet_id, context, &id, now);
        }
    }

    /// Sends `watch.open` to the context's bound document, unless it was already sent there.
    fn open_watch(&mut self, applet_id: &str, context: &str, id: &str, now: u64) {
        let Some(target) = self.context_view(applet_id, context) else { return };
        let Some(document) = self.documents.current(&target).map(|d| d.id.clone()) else { return };
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else { return };
        let Some(subscription) = session.subscriptions.get_mut(&(context.to_string(), id.to_string())) else { return };
        if subscription.open_in.as_ref() == Some(&document) {
            return;
        }
        subscription.open_in = Some(document.clone());
        let mut args = json!({ "id": id, "spec": subscription.spec });
        if let Some(when) = &subscription.when {
            args["when"] = when.clone();
        }
        let watch = WatchCall { id: id.into(), serial: subscription.serial };
        self.watch_call(applet_id, context, document, "watch.open", args, watch, now);
    }

    /// Sends a page call of the host's own to the context's bound document.
    #[allow(clippy::too_many_arguments)]
    fn watch_call(&mut self, applet_id: &str, context: &str, context_document: String, op: &str, args: Value, watch: WatchCall, now: u64) {
        let Some(target) = self.context_view(applet_id, context) else { return };
        self.start_context(applet_id, context, now);
        let budget_ms = self.limits.rpc_deadline_ms.min(self.limits.action_timeout_ms);
        let handle = CallHandle {
            foreground_document: String::new(),
            request_id: 0,
            context_id: context.into(),
            context_document,
            dispatched: false,
            navigating: false,
            completed_steps: None,
            deadline_ms: now + budget_ms,
            paced: false,
            inputs: 0,
            op: op.into(),
            started_ms: now,
            watch: Some(watch),
        };
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else { return };
        let call_id = session.begin_call(handle);
        self.event(&target, "call", json!({ "callId": call_id, "op": op, "args": args, "deadlineMs": budget_ms }));
    }

    /// The end of a host-made call. Only a failed open matters: the subscription is open nowhere
    /// until the next document binds or the foreground subscribes again. A replaced or unbound
    /// document stays silent, since the next document opens the watch; any other failure reaches
    /// the foreground. An open that ran out of time may still open later, so it is closed first.
    pub fn watch_call_done(&mut self, applet_id: &str, handle: &CallHandle, watch: &WatchCall, outcome: Result<Value, ErrorBody>) {
        let Err(error) = outcome else { return };
        if handle.op != "watch.open" {
            return;
        }
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else { return };
        let key = (handle.context_id.clone(), watch.id.clone());
        let Some(subscription) = session.subscriptions.get_mut(&key) else { return };
        if subscription.serial != watch.serial || subscription.open_in.as_ref() != Some(&handle.context_document) {
            return;
        }
        subscription.open_in = None;
        if matches!(error.code, ErrorCode::ContextReplaced | ErrorCode::NotReady | ErrorCode::Retired) {
            return;
        }
        let Some(target) = self.context_view(applet_id, &handle.context_id) else { return };
        if !self.documents.is_current(&target, &handle.context_document) {
            return;
        }
        if error.code == ErrorCode::Deadline {
            let close = WatchCall { id: watch.id.clone(), serial: watch.serial };
            self.watch_call(applet_id, &handle.context_id, handle.context_document.clone(), "watch.close", json!({ "id": watch.id }), close, crate::host::mono_ms());
        }
        let data = json!({ "status": "error", "error": ErrorBody { details: None, ..error } });
        self.host_emit(applet_id, &handle.context_id, &watch.id, EmitKind::Status, data, Value::Null);
    }

    /// Sends the foreground a watch message in the page's name, for the context's bound document,
    /// with seq 0 so the page's own messages always come after it. `extra` fields are added.
    pub fn host_emit(&mut self, applet_id: &str, context: &str, stream: &str, kind: EmitKind, data: Value, extra: Value) {
        let Some(target) = self.context_view(applet_id, context) else { return };
        let Some((generation, url)) = self.documents.current(&target).map(|d| (d.generation, d.url.clone())) else { return };
        let last = self.session(applet_id).and_then(|s| s.contexts.get(context)).and_then(|c| c.last_view.clone());
        let view = last.filter(|v| v["generation"] == generation).unwrap_or_else(|| json!({ "generation": generation, "n": 0, "url": url }));
        let url = view["url"].clone();
        let mut message = json!({
            "context": context, "generation": generation, "stream": stream, "kind": kind,
            "seq": 0, "view": view, "url": url, "data": data,
        });
        if let (Value::Object(message), Value::Object(extra)) = (&mut message, extra) {
            message.extend(extra);
        }
        self.foreground_event(applet_id, "page.emit", message);
    }
}
