//! Structured logging entry point.
//!
//! Hosts (the Tauri shell, benches, CLI tools) call [`init`] exactly once at
//! process start. Logs go to stderr by default; when a vault is open, a
//! daily-rotating file appender writes to `<vault>/.lattice/logs/lattice.log`.

use std::path::Path;
use std::sync::OnceLock;

use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{filter::EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

/// Holds the non-blocking file-writer guard so the appender drops cleanly at
/// process exit. Stored in a `OnceLock` because `tracing-appender` requires
/// the guard to outlive the subscriber.
static FILE_GUARD: OnceLock<WorkerGuard> = OnceLock::new();

/// Configure the global tracing subscriber.
///
/// * `vault_root` — if `Some`, daily-rotating logs are written to
///   `<vault>/.lattice/logs/lattice.log`. If `None`, only stderr.
/// * Reads `LATTICE_LOG` (preferred) or `RUST_LOG` for the level filter.
///   Defaults to `info,lattice_core=info,sqlx=warn`.
///
/// Returns `Ok(())` even if the file appender fails — logging always
/// degrades to stderr.
pub fn init(vault_root: Option<&Path>) -> std::io::Result<()> {
    let filter = EnvFilter::try_from_env("LATTICE_LOG")
        .or_else(|_| EnvFilter::try_from_default_env())
        .unwrap_or_else(|_| EnvFilter::new("info,lattice_core=info,sqlx=warn"));

    let stderr_layer = fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_level(true)
        .with_writer(std::io::stderr);

    let registry = tracing_subscriber::registry()
        .with(filter)
        .with(stderr_layer);

    if let Some(root) = vault_root {
        let logs_dir = root.join(".lattice").join("logs");
        if let Err(err) = std::fs::create_dir_all(&logs_dir) {
            eprintln!(
                "lattice: could not create log dir {} ({err}); using stderr only",
                logs_dir.display()
            );
            return registry.try_init().map_err(io_other);
        }
        let appender = tracing_appender::rolling::daily(&logs_dir, "lattice.log");
        let (non_blocking, guard) = tracing_appender::non_blocking(appender);
        let _ = FILE_GUARD.set(guard);
        let file_layer = fmt::layer()
            .with_ansi(false)
            .with_target(true)
            .with_writer(non_blocking);
        return registry.with(file_layer).try_init().map_err(io_other);
    }

    registry.try_init().map_err(io_other)
}

fn io_other<E: std::fmt::Display>(err: E) -> std::io::Error {
    std::io::Error::other(err.to_string())
}
