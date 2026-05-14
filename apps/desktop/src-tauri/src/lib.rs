//! Lattice desktop shell (Tauri 2).
//!
//! Wires the React renderer (`apps/desktop`) to the Rust core
//! (`core/lattice-core`) via Tauri IPC. v0.1 PR #3 ships the shell + a
//! "pick a folder" command; the full vault open/create/switch surface
//! lands in PR #6.

#![warn(rust_2018_idioms)]

mod commands;

use std::time::Instant;

use tauri::Manager;

/// Cold-start timer — captured at process start, logged when the main window emits `ready`.
static STARTUP_INSTANT: std::sync::OnceLock<Instant> = std::sync::OnceLock::new();

/// Entry point invoked from `main.rs`.
pub fn run() {
    let _ = STARTUP_INSTANT.set(Instant::now());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::vault::open_vault_dialog,
            commands::system::cold_start_ms,
            commands::system::core_version,
        ])
        .setup(|app| {
            // The `ready` event fires from the renderer once React has mounted.
            // It tells us cold-start is "user-visible done" and is what CI
            // measures against the 1.5 s budget for v0.1.
            let app_handle = app.handle().clone();
            app.listen_any("renderer://ready", move |_| {
                if let Some(start) = STARTUP_INSTANT.get() {
                    let elapsed = start.elapsed().as_millis();
                    tracing::info!(elapsed_ms = elapsed as u64, "cold-start: renderer ready");
                    let _ = app_handle.emit("cold-start", elapsed as u64);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Lattice");
}
