//! Lattice full-text search.
//!
//! Tantivy-backed inverted index per [ADR-0004]. v0.3 lands the writer side
//! (this crate's [`Index`] handle, the schema in [`schema`], the document
//! shape in [`doc`]) plus a criterion bench harness that gates the v0.3 perf
//! budget — `reindex_all` <3 s on 10 000 notes, `add_document` <5 ms p99.
//!
//! Live re-indexing from the file watcher ships in v0.3 PR C
//! (`feat(search): live re-indexing on save`) — it lives in `lattice-core`,
//! not here, because it owns the FS-watcher coupling. This crate stays
//! transport-agnostic: feed it [`IndexDoc`]s, get a committed index.
//!
//! Query parsing + execution ships in v0.3 PR D
//! (`feat(search): query DSL + parser`) per [ADR-0018]. Until then, this
//! crate exposes [`Index::reader_searcher`] so callers can construct a raw
//! Tantivy query when they need to.
//!
//! [ADR-0004]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0004-tantivy-full-text-search.md
//! [ADR-0018]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0018-search-query-grammar.md

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

mod doc;
mod error;
mod index;
mod schema;

pub use doc::IndexDoc;
pub use error::{SearchError, SearchResult};
pub use index::{drop_index_dir, Index, IndexStats};
pub use schema::{Fields, INDEX_DIR_NAME};

/// Crate version, exposed for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Format-version of the on-disk index directory. Bump when the schema
/// changes in a way that can't be opened by older readers; the indexer
/// then deletes the old `tantivy/` directory and reindexes from disk
/// (the index is a rebuildable cache per [ADR-0004]).
pub const INDEX_FORMAT_VERSION: u32 = 1;
