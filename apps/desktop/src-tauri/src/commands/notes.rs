//! Note IO Tauri commands (v0.2 PR #3.5).
//!
//! Thin pass-through to [`lattice_core::notes`] over the active
//! [`crate::state::VaultState`]; every command surfaces `LatticeError` to the
//! renderer using the same JSON shape the existing `vault_*` commands do.

use lattice_core::markdown::NoteDoc;
use lattice_core::{notes, LatticeError, NoteContent, NoteSummary};
use tauri::State;

use crate::state::VaultState;

/// List every Markdown note in the open vault, newest first.
#[tauri::command]
pub async fn note_list(state: State<'_, VaultState>) -> Result<Vec<NoteSummary>, LatticeError> {
    let guard = state.vault.lock().await;
    let vault = guard.as_ref().ok_or_else(no_vault_error)?;
    notes::list(vault).await
}

/// Read a single note by its vault-relative POSIX path.
#[tauri::command]
pub async fn note_read(
    state: State<'_, VaultState>,
    path: String,
) -> Result<NoteContent, LatticeError> {
    let guard = state.vault.lock().await;
    let vault = guard.as_ref().ok_or_else(no_vault_error)?;
    notes::read(vault, &path).await
}

/// Persist a `NoteDoc` to disk at `path`. Returns the post-write summary so
/// the renderer can keep the picker in sync with mtime / size changes.
#[tauri::command]
pub async fn note_write(
    state: State<'_, VaultState>,
    path: String,
    doc: NoteDoc,
) -> Result<NoteSummary, LatticeError> {
    let guard = state.vault.lock().await;
    let vault = guard.as_ref().ok_or_else(no_vault_error)?;
    notes::write(vault, &path, &doc).await
}

/// Create a new blank note at the vault root with `title` as the seed
/// heading. Picks the first non-colliding `<slug>.md` filename.
#[tauri::command]
pub async fn note_create(
    state: State<'_, VaultState>,
    title: String,
) -> Result<NoteSummary, LatticeError> {
    let guard = state.vault.lock().await;
    let vault = guard.as_ref().ok_or_else(no_vault_error)?;
    notes::create_blank(vault, &title).await
}

fn no_vault_error() -> LatticeError {
    LatticeError::InvalidPath {
        path: String::new(),
        reason: "no vault is currently open".into(),
    }
}
