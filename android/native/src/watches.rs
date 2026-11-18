//! Watch subscriptions. The foreground subscribes to a watch once (`watch.subscribe`), and the
//! host opens it with a page call of its own in every document of the context that binds while
//! the subscription lasts. Host-made calls are ordinary page calls, so they keep the context
//! awake and expire at their deadline, but their results go to no document: an open that failed
//! reaches the foreground as a `status` emit with `status: "error"`.
//!
//! The messages of a subscribed stream also go to the store thread (`store.rs`), which keeps the
//! stream's last value per URL. A new subscription asks it for the value of the context's URL and
//! shows it, marked `cached`, until the page's own snapshot arrives.
use crate::{
    contexts::{CallHandle, Subscription, WatchCall},
    debug_log,
    host::Host,
    store,
};
use genesis_contracts::*;
use serde_json::{Value, json};

/// The longest watch id the host keeps; the page agent checks its characters.
const WATCH_ID_MAX: usize = 128;

impl Host {
    /// Adds the subscription, or keeps an equal one, and opens it in the context's bound document.
    #[allow(clippy::too_many_arguments)]
    pub fn watch_subscribe(&mut self, applet_id: &str, context: String, id: String, spec: Value, when: Option<Value>, persist: bool, now: u64) -> Result<Value, ErrorBody> {
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
        match session.subscriptions.get_mut(&key) {
            Some(existing) if existing.spec != spec || existing.when != when => {
                return Err(ErrorBody::new(ErrorCode::Conflict, format!("The watch {id} is subscribed with another specification")));
            }
            Some(existing) => existing.persist = persist,
            None => {
                if session.subscriptions.keys().filter(|(c, _)| *c == context).count() >= watches_max {
                    return Err(ErrorBody::new(ErrorCode::QuotaExceeded, format!("At most {watches_max} watches can be open")));
                }
                session.next_subscription += 1;
                let serial = session.next_subscription;
                let fingerprint = store::fingerprint(&spec);
                session.subscriptions.insert(key, Subscription { spec, when, serial, open_in: None, fingerprint, live: false, persist });
            }
        }
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "watch.subscribe", json!({ "context": context, "watch": id }));
        }
        self.open_watch(applet_id, &context, &id, now);
        self.ask_store(applet_id, &context, &id);
        Ok(json!({}))
    }

    /// Asks the store for the value it keeps at the context's URL, unless the page already sent one.
    fn ask_store(&self, applet_id: &str, context: &str, id: &str) {
        if self.store_off {
            return;
        }
        let Some(session) = self.session(applet_id) else { return };
        let Some(subscription) = session.subscriptions.get(&(context.to_string(), id.to_string())) else { return };
        let Some(view) = session.contexts.get(context) else { return };
        if !subscription.live {
            store::get(store::Key::new(applet_id, context, id, &view.url), subscription.fingerprint, subscription.serial);
        }
    }

    /// A value the store kept: the foreground gets it as a snapshot marked `cached`, when the
    /// subscription that asked still waits for the page's first data at that URL.
    #[allow(clippy::too_many_arguments)]
    pub fn store_cached(&mut self, applet_id: &str, context: &str, stream: &str, serial: u64, url: &str, at: u64, snapshot: Value) {
        if self.store_off {
            return;
        }
        let Some(session) = self.session(applet_id) else { return };
        let Some(subscription) = session.subscriptions.get(&(context.to_string(), stream.to_string())) else { return };
        let Some(view) = session.contexts.get(context) else { return };
        if subscription.serial != serial || subscription.live || store::without_fragment(&view.url) != url {
            return;
        }
        let current_url = view.url.clone();
        let generation = self.context_view(applet_id, context).and_then(|t| self.documents.current(&t)).map_or(0, |d| d.generation);
        if debug_log::on(applet_id) {
            let bytes = serde_json::to_vec(&snapshot).map_or(0, |b| b.len());
            let age_ms = crate::host::now_ms().saturating_sub(at);
            debug_log::host(applet_id, "store.cached", json!({ "context": context, "watch": stream, "bytes": bytes, "ageMs": age_ms }));
        }
        let message = json!({
            "context": context, "generation": generation, "stream": stream, "kind": EmitKind::Snapshot,
            "seq": 0, "view": { "generation": generation, "n": 0, "url": current_url }, "url": current_url,
            "data": snapshot, "cached": true, "at": at,
        });
        self.foreground_event(applet_id, "page.emit", message);
    }

    /// A message of the page's watch stream: a snapshot with data, an error or a patch makes the
    /// subscription live, and every message goes to the store, as `bytes`, its data as JSON, which
    /// the store thread parses. A snapshot that read nothing does
    /// not: the page may not have rendered yet, so the store's answer still reaches the
    /// foreground, which holds it as it holds a kept value that came first. One the store's queue
    /// cannot take drops the stream's value there and asks the page for a fresh snapshot.
    #[allow(clippy::too_many_arguments)]
    pub fn watch_emitted(&mut self, applet_id: &str, context: &str, stream: &str, kind: EmitKind, seq: u64, view: &Value, url: &str, data: &Value, bytes: Vec<u8>) {
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else { return };
        let Some(subscription) = session.subscriptions.get_mut(&(context.to_string(), stream.to_string())) else { return };
        let read_nothing = data.get("status").and_then(Value::as_str) == Some("ready") && store::empty(data);
        if kind == EmitKind::Patch || (kind == EmitKind::Snapshot && !read_nothing) {
            subscription.live = true;
        }
        if self.store_off {
            return;
        }
        let (spec, persist) = (subscription.fingerprint, subscription.persist);
        let sent = store::emit(|| store::Emit {
            key: store::Key::new(applet_id, context, stream, url),
            spec,
            kind,
            generation: view["generation"].as_u64().unwrap_or(0),
            n: view["n"].as_u64().unwrap_or(0),
            seq,
            data: bytes,
            persist,
        });
        let stream_key = (applet_id.to_string(), context.to_string(), stream.to_string());
        match sent {
            store::Sent::Queued if kind == EmitKind::Snapshot => {
                self.store_dirty.remove(&stream_key);
            }
            store::Sent::Full if self.store_dirty.insert(stream_key) => {
                store::drop_stream(applet_id, context, stream);
                if debug_log::on(applet_id) {
                    debug_log::host(applet_id, "store.dirty", json!({ "context": context, "watch": stream }));
                }
                self.resync_watch(applet_id, context, stream, crate::host::mono_ms());
            }
            _ => {}
        }
    }

    /// Forgets that the store missed a message of one stream (`context`, `stream`), or of every
    /// stream of the applet: its subscription ended, so no snapshot will reach the store for it.
    pub fn forget_dirty(&mut self, applet_id: &str, stream: Option<(&str, &str)>) {
        self.store_dirty.retain(|(a, c, s)| a != applet_id || stream.is_some_and(|stream| stream != (c.as_str(), s.as_str())));
    }

    /// `store.forget`: the store forgets the applet's values of `context`, or of every context.
    /// A subscription waiting for its first snapshot takes no kept value after this.
    pub fn store_forget(&mut self, applet_id: &str, context: Option<String>) -> Result<Value, ErrorBody> {
        if let Some(context) = &context
            && self.context_view(applet_id, context).is_none()
        {
            return Err(ErrorBody::new(ErrorCode::NotFound, format!("No context {context}")));
        }
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "store.forget", json!({ "context": context }));
        }
        self.refuse_cached(applet_id, context.as_deref());
        store::forget(applet_id, context);
        Ok(json!({}))
    }

    /// The websites' data was removed: the store deletes the values it kept, of `applet_id` or
    /// of every applet, since they may show another account.
    pub fn website_data_removed(&mut self, applet_id: Option<&str>) {
        let applets: Vec<String> = self.contexts.sessions.keys().filter(|a| applet_id.is_none_or(|id| id == *a)).cloned().collect();
        for applet in applets {
            self.refuse_cached(&applet, None);
        }
        store::erase(applet_id);
    }

    /// Makes the subscriptions of `context`, or of every context, take no kept value already on its way.
    fn refuse_cached(&mut self, applet_id: &str, context: Option<&str>) {
        let Some(session) = self.contexts.sessions.get_mut(applet_id) else { return };
        for ((c, _), subscription) in session.subscriptions.iter_mut() {
            if context.is_none_or(|context| context == c) {
                subscription.live = true;
            }
        }
    }

    /// The store missed a message of the stream and dropped its value.
    pub fn store_resync(&mut self, applet_id: &str, context: &str, stream: &str, now: u64) {
        if debug_log::on(applet_id) {
            debug_log::host(applet_id, "store.resync", json!({ "context": context, "watch": stream }));
        }
        self.resync_watch(applet_id, context, stream, now);
    }

    /// Asks the document the watch is open in for a fresh snapshot.
    fn resync_watch(&mut self, applet_id: &str, context: &str, id: &str, now: u64) {
        let Some(target) = self.context_view(applet_id, context) else { return };
        let Some(document) = self.documents.current(&target).map(|d| d.id.clone()) else { return };
        let Some(subscription) = self.session(applet_id).and_then(|s| s.subscriptions.get(&(context.to_string(), id.to_string()))) else { return };
        if subscription.open_in.as_ref() != Some(&document) {
            return;
        }
        let watch = WatchCall { id: id.into(), serial: subscription.serial };
        self.watch_call(applet_id, context, document, "watch.resync", json!({ "id": id }), watch, now);
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
        self.forget_dirty(applet_id, Some((&context, &id)));
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
