//! Lattice core.
//!
//! Top-level crate that owns the vault filesystem, SQLite metadata index,
//! Markdown parser, file watcher, and error model.
//!
//! v0.1 staging:
//!   * PR #2  — sqlx + SQLite schema migrations + `LatticeError` + ts-rs (THIS PR).
//!   * PR #6  — vault open / create / switch.
//!   * PR #7  — file watcher + reactive index.
//!   * PR #8  — structured logging + telemetry opt-in.
//!   * PR #10 — criterion bench harness.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

pub mod config;
pub mod db;
pub mod error;
pub mod indexer;
pub mod logging;
pub mod markdown;
pub mod notes;
pub mod telemetry;
pub mod types;
pub mod vault;
pub mod watcher;

pub use error::{LatticeError, LatticeResult};
pub use indexer::Indexer;
pub use notes::{NoteContent, NoteSummary};
pub use telemetry::{TelemetryClient, TelemetrySettings};
pub use types::{Attachment, Link, LinkKind, Note, Tag, VaultInfo};
pub use vault::Vault;
pub use watcher::{default_debounce_ms, IndexEvent, IndexEventKind, Watcher};

/// Current crate version, exposed for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Returns the crate's semantic version string.
#[must_use]
pub fn version() -> &'static str {
    VERSION
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_non_empty() {
        assert!(!version().is_empty());
    }
}
