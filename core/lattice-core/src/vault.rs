//! The `Vault` — Lattice's top-level user concept.
//!
//! A vault is a directory of Markdown files plus a `.lattice/` subdirectory
//! holding the rebuildable index database, the (future) Tantivy index,
//! per-note history, and attachments.
//!
//! The on-disk layout is locked by [ARCHITECTURE.md](../../ARCHITECTURE.md)
//! and [ADR-0006](../../docs/decisions/0006-local-first-plain-markdown.md).
//! v0.1 PR #6 ships open / create / switch / close. PR #7 wires the
//! file-watcher on top.

use std::path::{Path, PathBuf};

use sqlx::SqlitePool;

use crate::db;
use crate::error::{LatticeError, LatticeResult};

/// The relative path within a vault where Lattice keeps its private state.
pub const LATTICE_DIR: &str = ".lattice";
/// The index DB filename under `.lattice/`.
pub const INDEX_DB_FILE: &str = "index.db";
/// Subdirectories Lattice creates under `.lattice/` on `create`.
const SUBDIRS: &[&str] = &["attachments", "logs", "tantivy", "history"];

/// A live, owned handle to a vault — holds the SQLite pool and the root path.
#[derive(Debug)]
pub struct Vault {
    root: PathBuf,
    pool: SqlitePool,
}

impl Vault {
    /// Open an existing vault. Validates the path, initialises the SQLite pool,
    /// and runs all migrations. The `.lattice/` subdirectory is created on
    /// demand if it doesn't exist yet (so opening a plain "notes" folder for
    /// the first time turns it into a vault transparently).
    pub async fn open(root: impl AsRef<Path>) -> LatticeResult<Self> {
        let root = root.as_ref().to_path_buf();
        validate_path(&root).await?;
        ensure_lattice_dir(&root).await?;
        let pool = db::init_pool(&root.join(LATTICE_DIR).join(INDEX_DB_FILE)).await?;
        Ok(Self { root, pool })
    }

    /// Create a vault at `root`. Creates the directory if missing, then opens it.
    pub async fn create(root: impl AsRef<Path>) -> LatticeResult<Self> {
        let root = root.as_ref().to_path_buf();
        tokio::fs::create_dir_all(&root)
            .await
            .map_err(|err| LatticeError::InvalidPath {
                path: root.to_string_lossy().to_string(),
                reason: format!("failed to create directory: {err}"),
            })?;
        Self::open(&root).await
    }

    /// Close the underlying SQLite pool gracefully (flushes WAL, returns conns).
    pub async fn close(self) -> LatticeResult<()> {
        self.pool.close().await;
        Ok(())
    }

    /// Absolute path to the vault root.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Path to `<root>/.lattice/`.
    #[must_use]
    pub fn lattice_dir(&self) -> PathBuf {
        self.root.join(LATTICE_DIR)
    }

    /// Path to the index database file.
    #[must_use]
    pub fn db_path(&self) -> PathBuf {
        self.lattice_dir().join(INDEX_DB_FILE)
    }

    /// Borrow the SQLite pool for queries.
    #[must_use]
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Snapshot of vault stats suitable for the IPC layer.
    pub async fn info(&self) -> LatticeResult<crate::types::VaultInfo> {
        let (note_count,): (i64,) = sqlx::query_as("SELECT count(*) FROM notes")
            .fetch_one(&self.pool)
            .await?;
        Ok(crate::types::VaultInfo {
            root: self.root.to_string_lossy().to_string(),
            note_count,
        })
    }
}

async fn validate_path(path: &Path) -> LatticeResult<()> {
    let exists = tokio::fs::try_exists(path)
        .await
        .map_err(|err| LatticeError::InvalidPath {
            path: path.to_string_lossy().to_string(),
            reason: format!("could not check existence: {err}"),
        })?;
    if !exists {
        return Err(LatticeError::InvalidPath {
            path: path.to_string_lossy().to_string(),
            reason: "path does not exist".into(),
        });
    }

    let metadata = tokio::fs::metadata(path).await?;
    if !metadata.is_dir() {
        return Err(LatticeError::InvalidPath {
            path: path.to_string_lossy().to_string(),
            reason: "path is not a directory".into(),
        });
    }

    Ok(())
}

async fn ensure_lattice_dir(root: &Path) -> LatticeResult<()> {
    let lattice = root.join(LATTICE_DIR);
    tokio::fs::create_dir_all(&lattice).await?;
    for sub in SUBDIRS {
        tokio::fs::create_dir_all(lattice.join(sub)).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn open_creates_dotlattice_subdirs() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        for sub in SUBDIRS {
            let p = vault.lattice_dir().join(sub);
            assert!(p.exists(), "expected {p:?} to exist after Vault::open");
        }
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn create_then_open_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let nested = tmp.path().join("nested-new-vault");
        let v1 = Vault::create(&nested).await.unwrap();
        let info1 = v1.info().await.unwrap();
        v1.close().await.unwrap();

        let v2 = Vault::open(&nested).await.unwrap();
        let info2 = v2.info().await.unwrap();
        v2.close().await.unwrap();

        assert_eq!(info1.note_count, info2.note_count);
        assert_eq!(info1.root, info2.root);
    }

    #[tokio::test]
    async fn open_fails_when_path_does_not_exist() {
        let missing =
            std::env::temp_dir().join(format!("lattice-missing-{}", uuid::Uuid::new_v4()));
        let err = Vault::open(&missing).await.unwrap_err();
        assert!(matches!(err, LatticeError::InvalidPath { .. }));
    }

    #[tokio::test]
    async fn open_fails_when_path_is_a_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("not-a-dir.txt");
        tokio::fs::write(&file_path, b"hi").await.unwrap();
        let err = Vault::open(&file_path).await.unwrap_err();
        assert!(matches!(err, LatticeError::InvalidPath { .. }));
    }
}
