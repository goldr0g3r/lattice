//! Full-text search Tauri commands (v0.3 PR E — `feat(ui): search modal`).
//!
//! Thin pass-through to [`lattice_search`]'s parser + executor over the
//! active vault's [`Indexer`](lattice_core::Indexer) (which owns the
//! `SearchIndex`). The shape is intentionally tiny — one IPC verb that
//! takes a user-typed string plus a `limit` and returns
//! [`lattice_search::SearchResults`].
//!
//! # Locked design decisions
//!
//! - **D1 — single verb.** One command (`search_query`) covers every
//!   query the v0.3 search modal can ask. The modal-side throttling +
//!   the `limit` parameter mean we never need a "load more" verb.
//! - **D2 — parse + execute server-side.** The renderer never sees the
//!   AST. The parser is in `lattice-search` (per ADR-0018); the
//!   renderer's surface stays "string in, ranked hits out".
//! - **D3 — typed errors.** Invalid syntax surfaces as
//!   `LatticeError::InvalidQuery { query, reason, span_start, span_end }`
//!   so the modal can underline the bad region. Other failures (index
//!   IO, schema mismatch) flow through `LatticeError::Search`.
//! - **D4 — limit clamp.** The executor clamps `limit` to
//!   [`lattice_search::SEARCH_LIMIT_MAX`] (200) so the renderer can't
//!   request an unbounded set even if the user types `limit=1_000_000`
//!   somewhere.

use lattice_core::LatticeError;
use lattice_search::SearchResults;
use tauri::State;

use crate::state::VaultState;

/// Execute a full-text search against the open vault's Tantivy index.
///
/// `query` follows the grammar from [ADR-0018]: bareword terms scored
/// against `title^3 / body / tags`, `tag:foo`, `path:Engineering/`,
/// `"phrase"`, `prefix*`, `fuzzy~`, `created:>2026-01-01`, boolean
/// `OR`, and `-negation`. An empty string returns the latest 50 notes.
///
/// `limit` is the requested cap on hits; the executor enforces an
/// absolute 200 ceiling.
///
/// [ADR-0018]: ../../../../../docs/decisions/0018-search-query-grammar.md
#[tauri::command]
pub async fn search_query(
    state: State<'_, VaultState>,
    query: String,
    limit: u32,
) -> Result<SearchResults, LatticeError> {
    let guard = state.indexer.lock().await;
    let indexer = guard.as_ref().ok_or_else(no_vault_error)?;

    let parsed = lattice_search::parse_query(&query)?;
    let limit = if limit == 0 { 50 } else { limit };
    let results = indexer
        .with_search(|idx| idx.search(&parsed, limit))
        .await?;
    Ok(results)
}

fn no_vault_error() -> LatticeError {
    LatticeError::InvalidPath {
        path: String::new(),
        reason: "no vault is currently open".into(),
    }
}
