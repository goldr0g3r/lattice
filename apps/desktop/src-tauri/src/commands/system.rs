//! System / diagnostics IPC commands.

use lattice_core::{config, LatticeError, TelemetrySettings};
use serde::Serialize;
use tauri::State;

use crate::state::VaultState;

/// Placeholder for "elapsed since process start" — the authoritative value
/// comes from the `cold-start` event emitted in `lib.rs::setup` when the
/// renderer signals `renderer://ready`. Kept as a command so the frontend can
/// fall back to a poll in browser/dev mode where the event never fires.
#[tauri::command]
pub fn cold_start_ms() -> u64 {
    0
}

#[derive(Serialize)]
pub struct CoreVersion {
    pub crate_name: &'static str,
    pub version: &'static str,
}

/// Returns `lattice-core`'s version string. Surfaced in Settings → About.
#[tauri::command]
pub fn core_version() -> CoreVersion {
    CoreVersion {
        crate_name: "lattice-core",
        version: lattice_core::VERSION,
    }
}

/// Return the persisted telemetry settings. Defaults to `{ enabled: false, endpoint: "" }`.
#[tauri::command]
pub async fn telemetry_settings_get() -> Result<TelemetrySettings, LatticeError> {
    let cfg = config::read().await?;
    Ok(cfg.telemetry)
}

/// Persist new telemetry settings and update the in-memory telemetry client.
/// Emits an `app.settings_changed` event via the telemetry pipe if it was
/// already enabled before the change, so the prior receiver sees the
/// transition. (After disable, no event is shipped, by design.)
#[tauri::command]
pub async fn telemetry_settings_set(
    state: State<'_, VaultState>,
    settings: TelemetrySettings,
) -> Result<(), LatticeError> {
    let mut cfg = config::read().await.unwrap_or_default();
    let was_enabled = cfg.telemetry.enabled;
    cfg.telemetry = settings.clone();
    config::write(&cfg).await?;

    let mut tele = state.telemetry.lock().await;
    if let Some(vault) = state.vault.lock().await.as_ref() {
        *tele = lattice_core::TelemetryClient::for_vault(vault.root(), &settings);
    } else {
        *tele = lattice_core::TelemetryClient::disabled();
    }
    if was_enabled && !settings.enabled {
        tracing::info!("telemetry disabled by user");
    }
    Ok(())
}
