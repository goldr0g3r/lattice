//! Tauri-managed state shared across IPC commands.
//!
//! `VaultState` holds the currently-open `Vault`, the file `Watcher` tied
//! to that vault, the v0.3 live `Indexer` (Tantivy + SQLite writer for
//! note saves), and the telemetry client. All live behind a
//! `tokio::sync::Mutex` so async commands can replace them atomically on
//! `vault_switch`. Dropping the `Watcher` cleanly stops its background
//! thread; dropping the `Indexer`'s `Arc` releases the Tantivy writer.

use lattice_core::{Indexer, TelemetryClient, Vault, Watcher};
use tokio::sync::Mutex;

/// Tauri-managed wrapper around the optional active vault.
#[derive(Default)]
pub struct VaultState {
    pub vault: Mutex<Option<Vault>>,
    pub watcher: Mutex<Option<Watcher>>,
    pub indexer: Mutex<Option<Indexer>>,
    pub telemetry: Mutex<TelemetryClient>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            vault: Mutex::new(None),
            watcher: Mutex::new(None),
            indexer: Mutex::new(None),
            telemetry: Mutex::new(TelemetryClient::disabled()),
        }
    }
}
