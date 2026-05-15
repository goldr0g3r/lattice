//! Lattice error type.
//!
//! `LatticeError` is the public error of the core. Each variant is serialisable
//! so the desktop shell can surface it to the user via Tauri IPC and the
//! frontend can render typed messages without parsing strings.
//!
//! The JSON shape is locked by a snapshot test (`tests/error_snapshot.rs`);
//! any change to a variant's representation must update that snapshot.

use std::io;

use serde::Serialize;
use thiserror::Error;
use ts_rs::TS;

/// Errors returned by the Lattice core.
///
/// The JSON shape (`{ kind: "...", details: { ... } }`) is locked by the
/// snapshot tests under `core/lattice-core/tests/error_snapshot.rs` and by the
/// ts-rs binding in `packages/core-bindings/src/generated/LatticeError.ts`.
#[derive(Debug, Error, Serialize, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(tag = "kind", content = "details", rename_all = "snake_case")]
pub enum LatticeError {
    /// Underlying I/O failure (file read/write, permission denied, etc.).
    #[error("io error: {message}")]
    Io {
        /// Human-readable description from the underlying [`io::Error`].
        message: String,
    },

    /// Database access failure (sqlx error wrapped to be serialisable).
    #[error("database error: {message}")]
    Database {
        /// Human-readable description from the underlying [`sqlx::Error`].
        message: String,
    },

    /// Schema migration failure.
    #[error("migration error: {message}")]
    Migration {
        /// Human-readable description from the underlying migration error.
        message: String,
    },

    /// The provided path is not usable as a vault.
    #[error("invalid path '{path}': {reason}")]
    InvalidPath {
        /// Path the user provided.
        path: String,
        /// Why it failed validation.
        reason: String,
    },

    /// No entity with the supplied id was found.
    #[error("not found: {id}")]
    NotFound {
        /// Identifier the caller looked up.
        id: String,
    },

    /// The telemetry pipeline failed (non-fatal; logged and dropped).
    #[error("telemetry error: {message}")]
    Telemetry {
        /// Human-readable description.
        message: String,
    },

    /// A search-index operation failed (Tantivy IO, schema mismatch, etc.).
    ///
    /// Surfaced by the v0.3 [`crate::Indexer`] when the on-disk Tantivy
    /// store rejects an add / delete / commit; the renderer logs the
    /// message and the indexer falls back to a full reseed.
    #[error("search error: {message}")]
    Search {
        /// Human-readable description from the underlying
        /// [`lattice_search::SearchError`].
        message: String,
    },

    /// The user's search query failed to parse.
    ///
    /// Distinct from [`Self::Search`] so the search modal (v0.3 PR E)
    /// can render the bad input verbatim and underline the offending
    /// region. `span_start` / `span_end` carry the byte range from the
    /// v0.3 [`lattice_search::query`] parser per
    /// [ADR-0018](../../docs/decisions/0018-search-query-grammar.md).
    #[error("invalid query `{query}`: {reason}")]
    InvalidQuery {
        /// Verbatim user input.
        query: String,
        /// Human-readable explanation, ready to render under the input.
        reason: String,
        /// Inclusive byte offset where the offending region begins.
        #[ts(type = "number")]
        span_start: u32,
        /// Exclusive byte offset where the offending region ends.
        #[ts(type = "number")]
        span_end: u32,
    },
}

impl From<io::Error> for LatticeError {
    fn from(value: io::Error) -> Self {
        LatticeError::Io {
            message: value.to_string(),
        }
    }
}

impl From<sqlx::Error> for LatticeError {
    fn from(value: sqlx::Error) -> Self {
        LatticeError::Database {
            message: value.to_string(),
        }
    }
}

impl From<sqlx::migrate::MigrateError> for LatticeError {
    fn from(value: sqlx::migrate::MigrateError) -> Self {
        LatticeError::Migration {
            message: value.to_string(),
        }
    }
}

impl From<lattice_search::SearchError> for LatticeError {
    fn from(value: lattice_search::SearchError) -> Self {
        match value {
            lattice_search::SearchError::InvalidQuery {
                query,
                span,
                reason,
            } => LatticeError::InvalidQuery {
                query,
                reason,
                span_start: u32::try_from(span.start).unwrap_or(u32::MAX),
                span_end: u32::try_from(span.end).unwrap_or(u32::MAX),
            },
            other => LatticeError::Search {
                message: other.to_string(),
            },
        }
    }
}

/// Convenience alias for `Result<T, LatticeError>`.
pub type LatticeResult<T> = Result<T, LatticeError>;
