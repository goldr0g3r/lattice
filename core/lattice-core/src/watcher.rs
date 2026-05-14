//! Vault file watcher (PR #7).
//!
//! Wraps `notify-debouncer-full` with the per-OS debounce defaults locked by
//! [ADR-0014](../../docs/decisions/0014-file-watcher-debounce.md). The Tauri
//! shell owns one `Watcher` per active vault and re-emits each `IndexEvent`
//! through the IPC bridge as `vault://index`.

use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{DateTime, Utc};
use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{LatticeError, LatticeResult};

/// What changed on disk, as the watcher saw it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(rename_all = "snake_case")]
pub enum IndexEventKind {
    /// A new file appeared.
    Created,
    /// An existing file was modified (content or metadata).
    Modified,
    /// A file was removed.
    Removed,
    /// A file was renamed; both source and destination are emitted as Modified.
    Renamed,
    /// Anything notify reports that we don't map cleanly.
    Other,
}

/// One coalesced filesystem event for a single path.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct IndexEvent {
    /// What happened.
    pub kind: IndexEventKind,
    /// Absolute path the event refers to.
    pub path: String,
    /// When the watcher emitted this event (RFC 3339).
    pub timestamp: DateTime<Utc>,
}

/// Per-OS debounce default in milliseconds (ADR-0014).
#[must_use]
pub const fn default_debounce_ms() -> u64 {
    #[cfg(target_os = "linux")]
    {
        250
    }
    #[cfg(target_os = "windows")]
    {
        100
    }
    #[cfg(target_os = "macos")]
    {
        200
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        200
    }
}

fn classify(kind: EventKind) -> IndexEventKind {
    match kind {
        EventKind::Create(_) => IndexEventKind::Created,
        EventKind::Modify(notify::event::ModifyKind::Name(_)) => IndexEventKind::Renamed,
        EventKind::Modify(_) => IndexEventKind::Modified,
        EventKind::Remove(_) => IndexEventKind::Removed,
        _ => IndexEventKind::Other,
    }
}

/// Owns the debouncer + background thread. Dropping the watcher stops it.
pub struct Watcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
    root: PathBuf,
    debounce_ms: u64,
}

impl Watcher {
    /// Start watching `root` recursively. `on_event` is called once per
    /// debounced event from the watcher's background thread.
    pub fn start<F>(root: impl AsRef<Path>, on_event: F) -> LatticeResult<Self>
    where
        F: Fn(IndexEvent) + Send + 'static,
    {
        Self::start_with_debounce(root, default_debounce_ms(), on_event)
    }

    /// Same as [`Watcher::start`] but with an explicit debounce window in ms.
    /// Used by tests (small debounce so they finish fast) and by the user's
    /// `watcher.debounce_ms` override (ADR-0014).
    pub fn start_with_debounce<F>(
        root: impl AsRef<Path>,
        debounce_ms: u64,
        on_event: F,
    ) -> LatticeResult<Self>
    where
        F: Fn(IndexEvent) + Send + 'static,
    {
        let root = root.as_ref().to_path_buf();
        let cb = move |result: DebounceEventResult| match result {
            Ok(events) => {
                for ev in events {
                    let kind = classify(ev.event.kind);
                    let timestamp = Utc::now();
                    for path in &ev.event.paths {
                        on_event(IndexEvent {
                            kind,
                            path: path.to_string_lossy().to_string(),
                            timestamp,
                        });
                    }
                }
            }
            Err(errors) => {
                for err in errors {
                    tracing::error!(error = %err, "watcher: notify reported an error");
                }
            }
        };

        let mut debouncer =
            new_debouncer(Duration::from_millis(debounce_ms), None, cb).map_err(|err| {
                LatticeError::Io {
                    message: format!("watcher: failed to create debouncer: {err}"),
                }
            })?;

        debouncer
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|err| LatticeError::Io {
                message: format!("watcher: failed to watch {}: {err}", root.display()),
            })?;

        Ok(Self {
            _debouncer: debouncer,
            root,
            debounce_ms,
        })
    }

    /// The root path this watcher was started on.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The debounce window the watcher is using, in milliseconds.
    #[must_use]
    pub fn debounce_ms(&self) -> u64 {
        self.debounce_ms
    }
}

impl std::fmt::Debug for Watcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Watcher")
            .field("root", &self.root)
            .field("debounce_ms", &self.debounce_ms)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_debounce_is_platform_appropriate() {
        let d = default_debounce_ms();
        // Tight floor (10 ms) catches accidental zeros; loose ceiling (1 s)
        // catches accidental seconds-vs-ms typos.
        assert!((10..=1000).contains(&d), "default_debounce_ms = {d}");
    }
}
