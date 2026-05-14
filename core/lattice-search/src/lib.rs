//! Lattice full-text search.
//!
//! Tantivy-backed inverted index (see ADR-0004). Substantive work lands in v0.3.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

/// Crate version, exposed for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
