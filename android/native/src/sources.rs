use genesis_contracts::*;
use std::collections::HashMap;

#[derive(Clone, Debug)]
pub enum SourceStatus {
    Dormant,
    Loading,
    Active,
    Suspended,
    Failed,
}

pub struct SourceSession {
    pub definition: Source,
    pub last_url: String,
    pub status: SourceStatus,
}

pub struct AppletInstance {
    pub applet_id: AppletId,
    pub sources: HashMap<SourceId, SourceSession>,
}

pub struct DocumentBinding {
    pub id: DocumentId,
    pub channel: u64,
    pub nonce: DocumentNonce,
    pub runtime_reported: bool,
    pub route_revision: RouteRevision,
}

pub struct ChallengeBinding {
    pub channel: u64,
    pub nonce: DocumentNonce,
    pub challenge: String,
}

pub struct LiveView {
    pub context: ExecutionContext,
    pub package: Package,
    pub selection: Selection,
    pub url: String,
    pub origins: Vec<String>,
    pub customized: bool,
    pub supported: Option<bool>,
    pub epoch: u64,
    pub ready: bool,
    pub failed: bool,
    pub document: Option<DocumentBinding>,
    pub challenge: Option<ChallengeBinding>,
}
