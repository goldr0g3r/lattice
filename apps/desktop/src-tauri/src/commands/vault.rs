//! Vault-related Tauri commands.
//!
//! PR #3 ships only the folder-picker (no parsing). The full vault
//! open / create / switch surface lands in PR #6.

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Open the OS folder-picker dialog. Returns the selected path or `null` if
/// the user cancelled.
#[tauri::command]
pub async fn open_vault_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |maybe_path| {
        let result = maybe_path.map(|p| p.to_string());
        // If the receiver was already dropped (window closed mid-pick) just discard.
        let _ = tx.send(result);
    });
    rx.await.map_err(|err| err.to_string())
}
