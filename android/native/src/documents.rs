//! Document registry: the current document per view, its generation, and pending operations.
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
    /// Increments each time a document binds in the view; 0 for the foreground.
    pub generation: u64,
    /// The view's `DocumentStarted` for this document has arrived. A hello can come first.
    pub started: bool,
}

/// A request the host answers later: a storage job or a service request. The op id is the
/// storage `jobId` or the service `requestId`.
pub struct PendingOp {
    pub view: ViewRef,
    pub document_id: String,
    pub request_id: u64,
    pub deadline_ms: u64,
}

#[derive(Default)]
pub struct Documents {
    counter: u64,
    current: HashMap<ViewRef, Document>,
    /// The last generation bound in each context view; it survives the document's retirement.
    generations: HashMap<ViewRef, u64>,
    ops: HashMap<u64, PendingOp>,
}

impl Documents {
    pub fn current(&self, view: &ViewRef) -> Option<&Document> {
        self.current.get(view)
    }

    pub fn current_mut(&mut self, view: &ViewRef) -> Option<&mut Document> {
        self.current.get_mut(view)
    }

    pub fn is_current(&self, view: &ViewRef, document_id: &str) -> bool {
        self.current(view).is_some_and(|d| d.id == document_id)
    }

    /// The generation the next document bound in `view` receives.
    pub fn next_generation(&self, view: &ViewRef) -> u64 {
        self.generations.get(view).copied().unwrap_or(0) + 1
    }

    /// Binds a new document to `view`. Context documents take the next generation; the
    /// foreground's is always 0. The caller retires the previous document first.
    pub fn bind(&mut self, view: &ViewRef, url: &str, context: bool, started: bool) -> &Document {
        self.counter += 1;
        let id = format!("{}/{}/{}", view.applet_id, String::from(view.role.clone()), self.counter);
        let generation = match context {
            true => {
                let next = self.next_generation(view);
                self.generations.insert(view.clone(), next);
                next
            }
            false => 0,
        };
        let document = Document { id, url: url.into(), generation, started };
        self.current.insert(view.clone(), document);
        &self.current[view]
    }

    /// Removes the view's document and drops its pending operations. Returns the retired id.
    pub fn retire(&mut self, view: &ViewRef) -> Option<String> {
        let document = self.current.remove(view)?;
        self.ops.retain(|_, op| op.document_id != document.id);
        Some(document.id)
    }

    /// Retires every document of the applet and forgets its generations.
    pub fn retire_applet(&mut self, applet_id: &str) -> Vec<(ViewRef, String)> {
        self.generations.retain(|view, _| view.applet_id != applet_id);
        let views: Vec<ViewRef> = self.current.keys().filter(|v| v.applet_id == applet_id).cloned().collect();
        views.into_iter().filter_map(|v| self.retire(&v).map(|id| (v, id))).collect()
    }

    pub fn pending_count(&self, document_id: &str) -> usize {
        self.ops.values().filter(|op| op.document_id == document_id).count()
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
}
