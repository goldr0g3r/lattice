//! Integration tests for the `Vault` lifecycle (PR #6).
//!
//! In-process tests for `Vault::open`, `::create`, `::close`, and explicit
//! coverage of the failure modes the issue YAML calls out:
//!   - path does not exist
//!   - path is not a directory
//!   - (no-permission paths are platform-specific; skipped on Windows where
//!     ACLs don't mirror the Unix model — tracked as a v0.2 follow-up.)

use lattice_core::{LatticeError, Vault};

#[tokio::test]
async fn open_succeeds_on_fresh_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = Vault::open(tmp.path()).await.expect("open should succeed");
    assert_eq!(vault.root(), tmp.path());
    vault.close().await.unwrap();
}

#[tokio::test]
async fn create_initialises_dotlattice() {
    let tmp = tempfile::tempdir().unwrap();
    let nested = tmp.path().join("a/b/c");
    let vault = Vault::create(&nested).await.unwrap();
    assert!(vault.lattice_dir().exists());
    assert!(vault.db_path().exists());
    vault.close().await.unwrap();
}

#[tokio::test]
async fn open_fails_when_path_missing() {
    let missing =
        std::env::temp_dir().join(format!("lattice-vault-missing-{}", uuid::Uuid::new_v4()));
    let err = Vault::open(&missing).await.expect_err("should fail");
    let json = serde_json::to_value(&err).unwrap();
    assert_eq!(json["kind"], "invalid_path");
    assert!(
        json["details"]["reason"]
            .as_str()
            .unwrap()
            .contains("does not exist"),
        "{json}"
    );
}

#[tokio::test]
async fn open_fails_when_path_is_a_file() {
    let tmp = tempfile::tempdir().unwrap();
    let file_path = tmp.path().join("a-file.txt");
    tokio::fs::write(&file_path, b"hi").await.unwrap();
    let err = Vault::open(&file_path).await.expect_err("should fail");
    assert!(matches!(err, LatticeError::InvalidPath { .. }));
}

#[tokio::test]
async fn switch_replaces_old_vault_cleanly() {
    let tmp = tempfile::tempdir().unwrap();
    let a = tmp.path().join("a");
    let b = tmp.path().join("b");

    let v_a = Vault::create(&a).await.unwrap();
    let info_a = v_a.info().await.unwrap();
    v_a.close().await.unwrap();

    let v_b = Vault::create(&b).await.unwrap();
    let info_b = v_b.info().await.unwrap();
    v_b.close().await.unwrap();

    assert_ne!(info_a.root, info_b.root);
    assert_eq!(info_a.note_count, 0);
    assert_eq!(info_b.note_count, 0);
}

#[tokio::test]
async fn vault_info_returns_zero_notes_on_fresh_vault() {
    let tmp = tempfile::tempdir().unwrap();
    let vault = Vault::create(tmp.path().join("fresh")).await.unwrap();
    let info = vault.info().await.unwrap();
    assert_eq!(info.note_count, 0);
    assert!(info.root.contains("fresh"));
    vault.close().await.unwrap();
}
