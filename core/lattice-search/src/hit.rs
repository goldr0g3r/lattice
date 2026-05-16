//! Wire shape for search results — v0.3 PR E (`feat(ui): search modal`).
//!
//! [`SearchHit`] is what [`crate::Index::search`] returns and what the
//! `search_query` Tauri command surfaces to the renderer. The shape is
//! `ts-rs`-exported to
//! [`packages/core-bindings/src/generated/SearchHit.ts`](../../../packages/core-bindings/src/generated/SearchHit.ts)
//! so the React modal's `SearchHit[]` prop is statically typed end to end.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// One hit from a `lattice-search` query.
///
/// `snippet` is the highlighted excerpt produced by Tantivy's
/// `SnippetGenerator`, formatted with `<mark>...</mark>` wrappers so the
/// React modal can render it via `dangerouslySetInnerHTML`. The wrappers
/// are the only HTML the renderer trusts from this field — the snippet
/// generator escapes everything else (per Tantivy's internals).
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct SearchHit {
    /// Stable note id — the vault-relative POSIX path until v0.5 introduces
    /// UUID frontmatter. The modal hands this back to `note_read`.
    pub id: String,
    /// Vault-relative POSIX path of the source `.md` file.
    pub path: String,
    /// First-non-empty-line / frontmatter title (whatever the indexer wrote).
    pub title: String,
    /// HTML-safe snippet with `<mark>` highlights around matched terms.
    /// Empty string when no body match (e.g., title-only or tag-only hits).
    pub snippet: String,
    /// BM25 score — opaque to the renderer; only used for relative ordering.
    /// `f32` exposed as `number` in TypeScript.
    pub score: f32,
}

/// Paged result envelope. Carries `truncated` so the modal can show
/// "showing 50 of N" instead of silently dropping hits past the cap.
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct SearchResults {
    /// Hits in BM25-descending order, capped at the query `limit`.
    pub hits: Vec<SearchHit>,
    /// Total matching documents — useful for the "showing X of Y" hint.
    /// `u64` exposed as `number` in TypeScript; realistic vault sizes are
    /// well inside `Number.MAX_SAFE_INTEGER`.
    #[ts(type = "number")]
    pub total: u64,
    /// `true` when `total > hits.len()` and the modal should advise the
    /// user to refine their query.
    pub truncated: bool,
    /// Wall-clock duration spent inside the Rust executor, in milliseconds.
    /// Exposed so the modal can render the v0.3 perf budget readout
    /// ("12 ms · 47 hits") and so telemetry can flag slow queries.
    #[ts(type = "number")]
    pub elapsed_ms: u32,
}
