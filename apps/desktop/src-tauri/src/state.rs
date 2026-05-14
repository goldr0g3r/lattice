//! Tauri-managed state shared across IPC commands.
//!
//! `VaultState` holds the currently-open `Vault` and the file `Watcher`
//! tied to that vault. Both live behind a `tokio::sync::Mutex` so async
//! commands can replace them atomically on `vault_switch`. Dropping the
//! `Watcher` cleanly stops its background thread.

use lattice_core::{TelemetryClient, Vault, Watcher};
use tokio::sync::Mutex;

/// Tauri-managed wrapper around the optional active vault.
#[derive(Default)]
pub struct VaultState {
    pub vault: Mutex<Option<Vault>>,
    pub watcher: Mutex<Option<Watcher>>,
    pub telemetry: Mutex<TelemetryClient>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            vault: Mutex::new(None),
            watcher: Mutex::new(None),
            telemetry: Mutex::new(TelemetryClient::disabled()),
        }
    }
}
