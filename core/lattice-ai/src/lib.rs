//! Lattice AI provider abstraction.
//!
//! OpenAI / Anthropic / Ollama adapters + embeddings + RAG. Lands in v0.4.

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

/// Crate version, exposed for diagnostics.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
