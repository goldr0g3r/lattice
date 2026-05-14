//! Cross-platform user config — currently just the "last opened vault" pointer.
//!
//! Lives at the OS-appropriate config dir + `lattice/config.json`:
//!   * Windows: `%APPDATA%\lattice\config.json`
//!   * Linux:   `$XDG_CONFIG_HOME/lattice/config.json` (default `~/.config/lattice/config.json`)
//!
//! The file is purely a UX nicety (so the app reopens the last vault on
//! launch). If absent, malformed, or unreachable, callers fall through to
//! "no vault" and surface the "Open vault…" prompt.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{LatticeError, LatticeResult};
use crate::telemetry::TelemetrySettings;

const CONFIG_FILENAME: &str = "config.json";
const APP_DIR_NAME: &str = "lattice";

/// User-level config persisted across launches.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UserConfig {
    /// Most recently opened vault root, if any.
    pub last_vault: Option<PathBuf>,
    /// Telemetry settings (off by default, per ADR-0012).
    #[serde(default)]
    pub telemetry: TelemetrySettings,
}

/// Returns `<config_dir>/lattice/`. `None` only on truly weird targets where
/// `dirs::config_dir()` can't determine a home (e.g. unset HOME on Linux).
#[must_use]
pub fn config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|d| d.join(APP_DIR_NAME))
}

#[must_use]
fn config_path() -> Option<PathBuf> {
    config_dir().map(|d| d.join(CONFIG_FILENAME))
}

/// Read the persisted config from the supplied file path. Missing file is
/// **not** an error — returns `Ok(UserConfig::default())`. Malformed JSON
/// **is** surfaced.
pub async fn read_at(path: &Path) -> LatticeResult<UserConfig> {
    match tokio::fs::read_to_string(path).await {
        Ok(text) => serde_json::from_str(&text).map_err(|err| LatticeError::InvalidPath {
            path: path.to_string_lossy().to_string(),
            reason: format!("config json parse failed: {err}"),
        }),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(UserConfig::default()),
        Err(err) => Err(err.into()),
    }
}

/// Write the supplied config atomically (write to a temp sibling, then rename)
/// at the supplied file path.
pub async fn write_at(path: &Path, config: &UserConfig) -> LatticeResult<()> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let json = serde_json::to_vec_pretty(config).map_err(|err| LatticeError::Io {
        message: format!("serialize config: {err}"),
    })?;
    let tmp = path.with_extension("json.tmp");
    tokio::fs::write(&tmp, &json).await?;
    tokio::fs::rename(&tmp, path).await?;
    Ok(())
}

/// Read from the default user-level config location.
pub async fn read() -> LatticeResult<UserConfig> {
    let Some(path) = config_path() else {
        return Ok(UserConfig::default());
    };
    read_at(&path).await
}

/// Write to the default user-level config location.
pub async fn write(config: &UserConfig) -> LatticeResult<()> {
    let Some(path) = config_path() else {
        return Err(LatticeError::Io {
            message: "config_dir() unavailable on this platform".into(),
        });
    };
    write_at(&path, config).await
}

/// Convenience: set just the last-vault pointer.
pub async fn set_last_vault(vault_root: &Path) -> LatticeResult<()> {
    let mut current = read().await.unwrap_or_default();
    current.last_vault = Some(vault_root.to_path_buf());
    write(&current).await
}

/// Convenience: clear the last-vault pointer (used by "Close vault" UI).
pub async fn clear_last_vault() -> LatticeResult<()> {
    let mut current = read().await.unwrap_or_default();
    current.last_vault = None;
    write(&current).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn write_then_read_roundtrip_at_explicit_path() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("nested/config.json");
        let cfg = UserConfig {
            last_vault: Some(tmp.path().join("my-vault")),
            ..Default::default()
        };
        write_at(&path, &cfg).await.unwrap();
        let back = read_at(&path).await.unwrap();
        assert_eq!(back.last_vault, cfg.last_vault);
        assert!(!back.telemetry.enabled);
    }

    #[tokio::test]
    async fn read_at_missing_returns_default() {
        let tmp = tempfile::tempdir().unwrap();
        let cfg = read_at(&tmp.path().join("never-written.json"))
            .await
            .unwrap();
        assert!(cfg.last_vault.is_none());
    }
}
