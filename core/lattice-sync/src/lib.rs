//! Lattice CRDT sync (yrs / Yjs) + libsodium E2EE wrap. Lands in v0.5.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

/// Crate version, exposed for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
