//! Vault-related Tauri commands.
//!
//! PR #3 shipped the folder-picker stub. PR #6 adds the full open / create /
//! switch / close surface, backed by `lattice_core::Vault` and persisted via
//! `lattice_core::config`.

use std::path::PathBuf;

use lattice_core::{config, LatticeError, Vault, VaultInfo, Watcher};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::state::VaultState;

/// IPC event channel: every coalesced file event for the open vault is
/// re-emitted to the renderer on this channel.
const INDEX_EVENT: &str = "vault://index";

/// Helper — open a vault and start a watcher on its root, re-emitting events
/// through the Tauri bridge.
async fn open_and_watch(
    app: &AppHandle,
    state: &State<'_, VaultState>,
    path: &str,
) -> Result<VaultInfo, LatticeError> {
    let vault = Vault::open(path).await?;
    let info = vault.info().await?;
    let path_buf = PathBuf::from(path);

    let watcher = {
        let app_for_callback = app.clone();
        Watcher::start(&path_buf, move |event| {
            if let Err(err) = app_for_callback.emit(INDEX_EVENT, &event) {
                tracing::warn!(error = %err, "failed to emit vault://index");
            }
        })?
    };

    if let Err(err) = config::set_last_vault(&path_buf).await {
        tracing::warn!(error = %err, "failed to persist last_vault");
    }

    // Swap the new vault + watcher in atomically; close any previous ones.
    let old_vault = state.vault.lock().await.replace(vault);
    let _old_watcher = state.watcher.lock().await.replace(watcher);
    if let Some(old) = old_vault {
        let _ = old.close().await;
    }
    // Dropping `_old_watcher` stops its background thread.

    Ok(info)
}

/// Open the OS folder-picker dialog. Returns the selected path or `null` if
/// the user cancelled. Pure UI helper — does **not** open a vault by itself.
#[tauri::command]
pub async fn open_vault_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Option<String>>();
    app.dialog().file().pick_folder(move |maybe_path| {
        let result = maybe_path.map(|p| p.to_string());
        let _ = tx.send(result);
    });
    rx.await
        .map_err(|err: tokio::sync::oneshot::error::RecvError| err.to_string())
}

/// Open an existing vault. Replaces any vault currently held in state and
/// updates the last-opened pointer in user config. Starts a file watcher on
/// the vault root; events are re-emitted to the renderer as `vault://index`.
#[tauri::command]
pub async fn vault_open(
    app: AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultInfo, LatticeError> {
    open_and_watch(&app, &state, &path).await
}

/// Create a new vault at `path`, initialising `.lattice/` if missing.
#[tauri::command]
pub async fn vault_create(
    app: AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultInfo, LatticeError> {
    // `Vault::create` is the only difference vs `open` here; do that first
    // so directory creation errors surface before we touch state.
    let created = Vault::create(&path).await?;
    drop(created.close().await);
    open_and_watch(&app, &state, &path).await
}

/// Close the current vault (if any) and open the supplied one.
/// Equivalent to `vault_open` semantically — surfaced as its own command so the
/// frontend can label the menu item "Switch vault…" without branching on state.
#[tauri::command]
pub async fn vault_switch(
    app: AppHandle,
    state: State<'_, VaultState>,
    path: String,
) -> Result<VaultInfo, LatticeError> {
    open_and_watch(&app, &state, &path).await
}

/// Close the currently-open vault, drop its watcher, and clear the
/// last-opened pointer.
#[tauri::command]
pub async fn vault_close(state: State<'_, VaultState>) -> Result<(), LatticeError> {
    // Drop the watcher first so we don't get a final flurry of events after
    // the vault is gone.
    let _ = state.watcher.lock().await.take();
    if let Some(vault) = state.vault.lock().await.take() {
        vault.close().await?;
    }
    if let Err(err) = config::clear_last_vault().await {
        tracing::warn!(error = %err, "failed to clear last_vault");
    }
    Ok(())
}

/// Return info for the vault currently held in state, or `null` if none.
#[tauri::command]
pub async fn vault_current(
    state: State<'_, VaultState>,
) -> Result<Option<VaultInfo>, LatticeError> {
    let guard = state.vault.lock().await;
    match guard.as_ref() {
        Some(v) => Ok(Some(v.info().await?)),
        None => Ok(None),
    }
}

/// Return the persisted "last opened vault" path, if any. Used at startup to
/// auto-reopen.
#[tauri::command]
pub async fn vault_last_opened() -> Result<Option<String>, LatticeError> {
    let cfg = config::read().await?;
    Ok(cfg.last_vault.map(|p| p.to_string_lossy().to_string()))
}
