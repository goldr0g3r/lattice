//! Markdown parser, serializer, and `NoteDoc` AST.
//!
//! This module implements the on-disk format contract that the v0.2 editor
//! reads and writes (v0.2 PR #1). It targets the grammar locked by
//! [ADR-0015](../../../docs/decisions/0015-markdown-flavor-and-serialization.md):
//! CommonMark + GFM + a small set of Lattice extensions (wiki-links, callouts,
//! math, fenced `mermaid` / `excalidraw` / `lattice:<kind>` info-strings).
//!
//! ## Round-trip contract
//!
//! For every fixture in [`tests/markdown-roundtrip/`](../../../tests/markdown-roundtrip/),
//! `serialize(parse(input))` must equal `input` byte-for-byte. The
//! `core/lattice-core/tests/markdown_roundtrip.rs` integration test enforces
//! this on every PR; the TS mirror in [`packages/editor/`](../../../packages/editor/)
//! enforces the same gate from the JS side.
//!
//! ## Design decisions locked here (see plan v0.2-pr1-markdown-roundtrip)
//!
//! - **D1** — Schema: own enum-based AST ([`NoteDoc`], [`Block`], [`Inline`]).
//! - **D2** — TS types: ts-rs codegen, same convention as the v0.1 IPC types.
//! - **D3** — Frontmatter ordering: explicit [`FrontmatterEntry`] `Vec` so insertion
//!   order is part of the type contract, not an implementation detail of a map.
//! - **D4** — Round-trip: canonical-form gate. The serializer always emits the
//!   canonical shape; fixtures use canonical input so `parse → serialize` is a
//!   fixpoint.
//! - **D5–D8** — Inline / block AST shapes documented on each enum variant.

pub mod doc;
pub mod frontmatter;
pub mod parser;
pub mod serializer;

pub use doc::{
    Alignment, Block, CalloutKind, Frontmatter, FrontmatterEntry, Inline, ListItem, NoteDoc, Row,
};

use crate::error::LatticeResult;

/// Parse a Markdown string into a [`NoteDoc`].
///
/// See module-level docs for the supported grammar.
pub fn parse(input: &str) -> LatticeResult<NoteDoc> {
    parser::parse(input)
}

/// Serialize a [`NoteDoc`] back to Markdown.
///
/// The output is canonical-form: `parse(serialize(parse(x))) == parse(x)` for
/// every input, and `serialize(parse(canonical)) == canonical` for every
/// fixture in the round-trip corpus.
#[must_use]
pub fn serialize(doc: &NoteDoc) -> String {
    serializer::serialize(doc)
}
