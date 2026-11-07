//! Document registry: the current document per view, pending operations and pending intents.
use genesis_contracts::ViewRef;
use std::{
    collections::HashMap,
    sync::atomic::{AtomicU64, Ordering},
};

/// Op ids are storage job ids and service request ids. Storage jobs and service calls outlive an
/// Activity and a host reset, so ids stay unique for the process, not for one registry.
static NEXT_OP: AtomicU64 = AtomicU64::new(1);

pub struct Document {
    pub id: String,
    /// `location.href` the document reported in `hello`.
    pub url: String,
}

/// A request the host answers later: a storage job or a service request. The op id is the
/// storage `jobId` or the service `requestId`.
pub struct PendingOp {
    pub view: ViewRef,
    pub document_id: String,
    pub request_id: u64,
    pub deadline_ms: u64,
}

pub struct Intent {
    pub foreground_document: String,
    pub source_id: String,
    pub source_document: String,
    pub deadline_ms: u64,
}

#[derive(Default)]
pub struct Documents {
    counter: u64,
    current: HashMap<ViewRef, Document>,
    ops: HashMap<u64, PendingOp>,
    next_intent: u64,
    pub intents: HashMap<u64, Intent>,
}

impl Documents {
    pub fn current(&self, view: &ViewRef) -> Option<&Document> {
        self.current.get(view)
    }

    pub fn is_current(&self, view: &ViewRef, document_id: &str) -> bool {
        self.current(view).is_some_and(|d| d.id == document_id)
    }

    /// Binds a new document to `view`, retiring the previous one. Returns the new id and the retired id.
    pub fn bind(&mut self, view: &ViewRef, url: &str) -> (String, Option<String>) {
        let retired = self.retire(view);
        self.counter += 1;
        let id = format!("{}/{}/{}", view.applet_id, String::from(view.role.clone()), self.counter);
        self.current.insert(view.clone(), Document { id: id.clone(), url: url.into() });
        (id, retired)
    }

    /// Removes the view's document and drops its pending operations. Returns the retired id.
    pub fn retire(&mut self, view: &ViewRef) -> Option<String> {
        let document = self.current.remove(view)?;
        self.ops.retain(|_, op| op.document_id != document.id);
        Some(document.id)
    }

    /// Retires every document of the applet and forgets its intents.
    pub fn retire_applet(&mut self, applet_id: &str) -> Vec<(ViewRef, String)> {
        let views: Vec<ViewRef> = self.current.keys().filter(|v| v.applet_id == applet_id).cloned().collect();
        let retired = views.into_iter().filter_map(|v| self.retire(&v).map(|id| (v, id))).collect();
        self.intents.clear();
        retired
    }

    pub fn pending_count(&self, document_id: &str) -> usize {
        self.ops.values().filter(|op| op.document_id == document_id).count()
            + self.intents.values().filter(|i| i.foreground_document == document_id).count()
    }

    pub fn begin_op(&mut self, op: PendingOp) -> u64 {
        let op_id = NEXT_OP.fetch_add(1, Ordering::Relaxed);
        self.ops.insert(op_id, op);
        op_id
    }

    /// Removes the pending operation. None when it expired, its document was retired, or it
    /// belongs to another applet than `applet_id` (when given); a foreign completion leaves it pending.
    pub fn finish_op(&mut self, op_id: u64, applet_id: Option<&str>) -> Option<PendingOp> {
        let owned = self.ops.get(&op_id).is_some_and(|op| applet_id.is_none_or(|id| op.view.applet_id == id));
        owned.then(|| self.ops.remove(&op_id)).flatten()
    }

    pub fn expired_ops(&mut self, now_ms: u64) -> Vec<PendingOp> {
        let ids: Vec<u64> = self.ops.iter().filter(|(_, op)| op.deadline_ms <= now_ms).map(|(id, _)| *id).collect();
        ids.into_iter().filter_map(|id| self.ops.remove(&id)).collect()
    }

    pub fn begin_intent(&mut self, intent: Intent) -> u64 {
        self.next_intent += 1;
        self.intents.insert(self.next_intent, intent);
        self.next_intent
    }

    /// Removes and returns the intents matching `predicate`.
    pub fn take_intents(&mut self, predicate: impl Fn(&Intent) -> bool) -> Vec<(u64, Intent)> {
        let ids: Vec<u64> = self.intents.iter().filter(|(_, i)| predicate(i)).map(|(id, _)| *id).collect();
        ids.into_iter().filter_map(|id| self.intents.remove(&id).map(|i| (id, i))).collect()
    }
}
