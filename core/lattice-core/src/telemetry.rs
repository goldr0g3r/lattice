//! Opt-in telemetry pipe per
//! [ADR-0012](../../docs/decisions/0012-telemetry-event-schema-versioning.md).
//!
//! v0.1 ships the on-disk write half of the contract: events are appended as
//! JSON lines to `<vault>/.lattice/logs/telemetry.jsonl`. A future PR adds a
//! background shipper that POSTs batches to the configured endpoint. The
//! receiver-side schema is documented in [`docs/telemetry.md`](../../docs/telemetry.md).
//!
//! Privacy stance:
//! - **Off by default.** No events are emitted unless the user has explicitly
//!   set `UserConfig::telemetry.enabled = true` in Settings.
//! - **No vault content.** Events carry small typed `props` only; we never
//!   ship note bodies, file paths, or anything resembling user content.
//! - **Local-first.** The default endpoint is empty; users wire their own
//!   self-hosted receiver, or the official Lattice endpoint when one exists.

use std::path::PathBuf;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::error::{LatticeError, LatticeResult};

/// Settings persisted in `UserConfig.telemetry`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct TelemetrySettings {
    /// Master toggle. Off by default.
    pub enabled: bool,
    /// HTTP(S) endpoint the (future) shipper POSTs to. May be empty.
    pub endpoint: String,
}

/// What every emitted event looks like on disk and on the wire.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent<'a> {
    /// Stable kebab-case identifier (e.g. `app.start`, `vault.opened`).
    pub event: &'a str,
    /// Monotonic per-event-type version (ADR-0012).
    pub schema_minor: u16,
    /// RFC 3339 timestamp.
    pub ts: String,
    /// Client tag (`{ app, version, platform }`).
    pub client: ClientTag<'a>,
    /// Free-form, schema-versioned bag of typed properties.
    pub props: serde_json::Value,
}

/// Client identification tag attached to every telemetry event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientTag<'a> {
    /// App identifier (currently always `"lattice-desktop"`).
    pub app: &'a str,
    /// App version string (`CARGO_PKG_VERSION` of the host crate).
    pub version: &'a str,
    /// Coarse OS bucket (`"linux"` / `"windows"` / `"macos"` / `"android"` / `"other"`).
    pub platform: &'a str,
}

/// Returns the current OS as a coarse, stable string.
#[must_use]
pub const fn platform() -> &'static str {
    #[cfg(target_os = "linux")]
    {
        "linux"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "android")]
    {
        "android"
    }
    #[cfg(not(any(
        target_os = "linux",
        target_os = "windows",
        target_os = "macos",
        target_os = "android"
    )))]
    {
        "other"
    }
}

/// Per-vault telemetry client. Cheap to clone (just a path + a bool).
#[derive(Debug, Clone)]
pub struct TelemetryClient {
    enabled: bool,
    log_path: PathBuf,
}

impl Default for TelemetryClient {
    fn default() -> Self {
        Self::disabled()
    }
}

impl TelemetryClient {
    /// Create a client tied to the given vault root.
    /// `<vault>/.lattice/logs/telemetry.jsonl` is created on demand.
    pub fn for_vault(vault_root: &std::path::Path, settings: &TelemetrySettings) -> Self {
        let log_path = vault_root
            .join(".lattice")
            .join("logs")
            .join("telemetry.jsonl");
        Self {
            enabled: settings.enabled,
            log_path,
        }
    }

    /// Disabled-by-default client used when no vault is open.
    #[must_use]
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            log_path: PathBuf::new(),
        }
    }

    /// Whether telemetry is enabled for this client.
    #[must_use]
    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Append one event to the on-disk JSONL log. No-op when disabled.
    pub async fn emit(
        &self,
        event: &str,
        schema_minor: u16,
        app_version: &str,
        props: serde_json::Value,
    ) -> LatticeResult<()> {
        if !self.enabled {
            return Ok(());
        }
        if let Some(parent) = self.log_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let payload = TelemetryEvent {
            event,
            schema_minor,
            ts: Utc::now().to_rfc3339(),
            client: ClientTag {
                app: "lattice-desktop",
                version: app_version,
                platform: platform(),
            },
            props,
        };

        let mut line = serde_json::to_vec(&payload).map_err(|err| LatticeError::Telemetry {
            message: format!("serialise: {err}"),
        })?;
        line.push(b'\n');

        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
            .await?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &line).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn disabled_client_is_noop() {
        let tmp = tempfile::tempdir().unwrap();
        let cli = TelemetryClient::for_vault(
            tmp.path(),
            &TelemetrySettings {
                enabled: false,
                endpoint: String::new(),
            },
        );
        cli.emit("app.start", 1, "0.1.0", serde_json::json!({}))
            .await
            .unwrap();
        let log = tmp.path().join(".lattice/logs/telemetry.jsonl");
        assert!(
            !log.exists(),
            "disabled client should not have created the log file"
        );
    }

    #[tokio::test]
    async fn enabled_client_appends_one_line_per_event() {
        let tmp = tempfile::tempdir().unwrap();
        let cli = TelemetryClient::for_vault(
            tmp.path(),
            &TelemetrySettings {
                enabled: true,
                endpoint: String::new(),
            },
        );
        cli.emit("app.start", 1, "0.1.0", serde_json::json!({}))
            .await
            .unwrap();
        cli.emit(
            "vault.opened",
            1,
            "0.1.0",
            serde_json::json!({ "note_count": 0 }),
        )
        .await
        .unwrap();
        let log = tmp.path().join(".lattice/logs/telemetry.jsonl");
        let body = tokio::fs::read_to_string(&log).await.unwrap();
        let line_count = body.lines().count();
        assert_eq!(line_count, 2, "expected two JSONL lines, got: {body}");
        for line in body.lines() {
            let parsed: serde_json::Value = serde_json::from_str(line).unwrap();
            assert!(parsed.get("event").is_some());
            assert!(parsed.get("schema_minor").is_some());
            assert!(parsed.get("ts").is_some());
        }
    }
}
