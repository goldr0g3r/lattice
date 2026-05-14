//! SQLite connection-pool and migration entry points.
//!
//! The on-disk database lives at `<vault>/.lattice/index.db` and is treated as
//! a rebuildable cache (ADR-0002). [`init_pool`] creates the file if missing
//! and applies all migrations under `./migrations/`.

use std::path::Path;

use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    SqlitePool,
};

use crate::error::LatticeResult;

/// Embedded migrator pointing at `core/lattice-core/migrations/`.
pub static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

/// Open (or create) the SQLite database at `db_path` and run all migrations.
///
/// The parent directory is created if missing. On a fresh vault this initialises
/// the four tables defined in `migrations/0001_init.sql`.
pub async fn init_pool(db_path: &Path) -> LatticeResult<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    MIGRATOR.run(&pool).await?;

    Ok(pool)
}

/// Open an in-memory database with all migrations applied — handy for tests
/// and for the criterion bench harness.
pub async fn init_in_memory() -> LatticeResult<SqlitePool> {
    let options = SqliteConnectOptions::new()
        .in_memory(true)
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;

    MIGRATOR.run(&pool).await?;

    Ok(pool)
}

/// Drop the database file at `db_path`. Used by the "rebuild index" command.
pub async fn drop_database(db_path: &Path) -> LatticeResult<()> {
    if tokio::fs::try_exists(db_path).await? {
        tokio::fs::remove_file(db_path).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn in_memory_pool_runs_migrations() {
        let pool = init_in_memory().await.expect("init_in_memory");
        // All four tables must exist.
        for table in ["notes", "tags", "note_tags", "links", "attachments"] {
            let exists: (i64,) = sqlx::query_as(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name = ?1",
            )
            .bind(table)
            .fetch_one(&pool)
            .await
            .expect("query");
            assert_eq!(exists.0, 1, "table `{table}` should exist after migration");
        }
    }

    #[tokio::test]
    async fn pool_creates_parent_directory() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let db_path = tmp.path().join("nested/sub/dir/index.db");
        let pool = init_pool(&db_path).await.expect("init_pool");
        assert!(db_path.exists(), "db file should be created");
        drop(pool);
    }
}
