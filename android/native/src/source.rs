//! Where an installed applet came from, and the rules that decide whether a new build of it is
//! an install, an update, a downgrade, a replacement or refused.
use crate::semver;
use genesis_contracts::{Channel, ReleaseHome, ReviewOutcome};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;

/// `IndexEntry.source`. An entry without one was installed before sources existed (legacy) and is
/// adopted by the first source that installs over it.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Source {
    Github {
        repository_id: u64,
        full_name: String,
        /// `.` for a single-applet repository.
        path: String,
        channel: Channel,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        branch: Option<String>,
        version: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        tag: Option<String>,
        commit: String,
        bundle_sha256: String,
        prerelease: bool,
    },
    File {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        version: Option<String>,
        bundle_sha256: String,
    },
    /// Bundled into the APK. `version` and `home` come from the release record beside the bundle;
    /// a bundle without one has neither.
    Bundled {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        version: Option<String>,
        bundle_sha256: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        home: Option<ReleaseHome>,
    },
    Dev {
        bundle_sha256: String,
    },
}

impl Source {
    pub fn version(&self) -> Option<&str> {
        match self {
            Source::Github { version, .. } => Some(version),
            Source::File { version, .. } | Source::Bundled { version, .. } => version.as_deref(),
            Source::Dev { .. } => None,
        }
    }

    pub fn bundle_sha256(&self) -> &str {
        match self {
            Source::Github { bundle_sha256, .. }
            | Source::File { bundle_sha256, .. }
            | Source::Bundled { bundle_sha256, .. }
            | Source::Dev { bundle_sha256 } => bundle_sha256,
        }
    }

    /// For the launcher and the review screen.
    pub fn label(&self) -> String {
        match self {
            Source::Github { full_name, path, channel, branch, .. } => {
                let place = if path == "." { full_name.clone() } else { format!("{full_name}/{path}") };
                match (channel, branch) {
                    (Channel::Branch, Some(branch)) => format!("GitHub {place}, branch {branch}"),
                    _ => format!("GitHub {place}"),
                }
            }
            Source::File { .. } => "File".into(),
            Source::Bundled { .. } => "Bundled with Genesis".into(),
            Source::Dev { .. } => "Development build".into(),
        }
    }
}

/// Same repository id and path; a bundled build matches a GitHub source through its `home`.
/// Bundled, file and development builds each match their own kind.
pub fn same_source(installed: &Source, candidate: &Source) -> bool {
    match (installed, candidate) {
        (Source::Github { repository_id: a, path: p, .. }, Source::Github { repository_id: b, path: q, .. }) => a == b && p == q,
        (Source::Bundled { home: Some(home), .. }, Source::Github { full_name, path, .. })
        | (Source::Github { full_name, path, .. }, Source::Bundled { home: Some(home), .. }) => {
            home.full_name.eq_ignore_ascii_case(full_name) && &home.path == path
        }
        // Files carry no publisher, so one file install is followed by the next.
        (Source::Bundled { .. }, Source::Bundled { .. })
        | (Source::File { .. }, Source::File { .. })
        | (Source::Dev { .. }, Source::Dev { .. }) => true,
        _ => false,
    }
}

pub struct Review {
    pub outcome: ReviewOutcome,
    pub warnings: Vec<String>,
}

/// Classifies a candidate build against the installed applet. `installed` is None when the applet
/// is not installed and `Some(None)` for a legacy entry. `older_allowed` is set by "Install
/// another version"; otherwise a lower version is refused.
pub fn review(installed: Option<Option<&Source>>, candidate: &Source, older_allowed: bool) -> Review {
    let outcome = |outcome| Review { outcome, warnings: Vec::new() };
    let Some(installed) = installed else { return outcome(ReviewOutcome::Install) };
    let Some(installed) = installed else { return outcome(ReviewOutcome::Install) };
    if !same_source(installed, candidate) {
        let from_source = installed.label();
        return Review {
            warnings: vec![
                format!("Replace and keep data: the new publisher's code can read everything the applet from {from_source} stored."),
                "Replace and erase data: the applet's stored data and service connections are deleted.".into(),
            ],
            outcome: ReviewOutcome::Replace { from_source },
        };
    }
    let from = installed.version().map(String::from);
    let same_build = installed.bundle_sha256() == candidate.bundle_sha256();
    let order = match (installed.version(), candidate.version()) {
        (Some(a), Some(b)) => semver::compare(b, a),
        _ => None,
    };
    match order {
        Some(Ordering::Greater) => outcome(ReviewOutcome::Update { from }),
        Some(Ordering::Less) if older_allowed => Review {
            outcome: ReviewOutcome::Downgrade { from: from.unwrap_or_default() },
            warnings: vec!["An older version may not understand data the newer one stored.".into()],
        },
        Some(Ordering::Less) => outcome(ReviewOutcome::Blocked {
            reason: format!("A newer version ({}) is installed.", from.unwrap_or_default()),
        }),
        _ if same_build => outcome(ReviewOutcome::Reinstall),
        Some(Ordering::Equal) if matches!(candidate, Source::Github { channel: Channel::Release, .. }) => {
            outcome(ReviewOutcome::Blocked { reason: "This release changed after you installed it.".into() })
        }
        _ => Review {
            outcome: ReviewOutcome::Update { from },
            warnings: vec!["This build changed without a version change.".into()],
        },
    }
}
