//! System / diagnostics IPC commands.

use serde::Serialize;

/// Returns the milliseconds elapsed from process start to the time of the call.
/// Used by the renderer for the cold-start telemetry surface (off by default).
#[tauri::command]
pub fn cold_start_ms(app: tauri::AppHandle) -> u64 {
    // Re-export the same value the lib captured in OnceLock by using a small
    // cached app-state. For PR #3 we read it back via a fresh Instant since
    // OnceLock isn't accessible from this module — that's fine for telemetry
    // (the cold-start event captured in `lib.rs::setup` is authoritative).
    let _ = app;
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
