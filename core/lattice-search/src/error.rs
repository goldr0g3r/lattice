//! Error type for the search crate.
//!
//! Wraps Tantivy's internal errors at the API boundary so callers don't
//! depend on a particular Tantivy major version. The Tauri command layer
//! lifts these into [`lattice_core::LatticeError`] (the
//! `LatticeError::Search { message }` variant ships in v0.3 PR C).

use std::path::PathBuf;

use thiserror::Error;

/// Anything that can go wrong inside the search index.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum SearchError {
    /// The on-disk index directory could not be read, written, or created.
    #[error("search: io error at {path}: {source}")]
    Io {
        /// Filesystem path that failed.
        path: PathBuf,
        /// Underlying IO error.
        #[source]
        source: std::io::Error,
    },

    /// Tantivy reported an error inside the index machinery.
    #[error("search: tantivy: {source}")]
    Tantivy {
        /// Underlying Tantivy error.
        #[source]
        source: tantivy::TantivyError,
    },

    /// Tantivy directory open error (separate enum from `TantivyError`).
    #[error("search: tantivy directory: {source}")]
    Directory {
        /// Underlying directory error.
        #[source]
        source: tantivy::directory::error::OpenDirectoryError,
    },

    /// A schema mismatch between the on-disk index and the current crate
    /// version. The caller's recovery is to `drop_index_dir(path)` and
    /// rebuild via [`crate::Index::create`] + `reindex_all`.
    #[error("search: schema mismatch: {reason} — drop the index and rebuild")]
    SchemaMismatch {
        /// Human-readable reason the mismatch was detected.
        reason: String,
    },

    /// The user-typed query couldn't be parsed by [`crate::query::parse`].
    /// Carries a byte-range span pointing at the offending region in the
    /// original input so the search modal (v0.3 PR E) can underline it.
    ///
    /// `lattice-core`'s `From<SearchError> for LatticeError` impl lifts
    /// this variant to `LatticeError::InvalidQuery { query, reason }`.
    #[error("search: invalid query `{query}` at {span:?}: {reason}")]
    InvalidQuery {
        /// The full input string the user typed, verbatim.
        query: String,
        /// Byte range in `query` covering the offending region.
        span: std::ops::Range<usize>,
        /// Human-readable explanation for the modal to render.
        reason: String,
    },
}

/// Crate-wide `Result` alias.
pub type SearchResult<T> = Result<T, SearchError>;

impl From<tantivy::TantivyError> for SearchError {
    fn from(source: tantivy::TantivyError) -> Self {
        Self::Tantivy { source }
    }
}

impl From<tantivy::directory::error::OpenDirectoryError> for SearchError {
    fn from(source: tantivy::directory::error::OpenDirectoryError) -> Self {
        Self::Directory { source }
    }
}
