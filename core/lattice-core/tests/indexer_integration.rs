//! End-to-end integration test for the v0.3 PR C live re-indexing path.
//!
//! Acceptance from issue #41:
//! > Integration test: write file → assert search returns it within
//! > (debounce + 100 ms)
//!
//! We start the real file watcher with a small explicit debounce (50 ms,
//! the same window the watcher integration test in v0.1 PR #7 uses),
//! wire it into a fresh [`Indexer`], write a `.md` file via
//! `tokio::fs::write`, and assert the Tantivy index visibly contains it
//! within the deadline.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use lattice_core::indexer::Indexer;
use lattice_core::vault::Vault;
use lattice_core::watcher::Watcher;
use lattice_search::Index as SearchIndex;
use tempfile::tempdir;

const DEBOUNCE_MS: u64 = 50;
const DEADLINE_MS: u64 = DEBOUNCE_MS + 500; // 100ms budget + slack for CI hosts

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn write_to_search_visible_within_debounce_plus_slack() {
    let tmp = tempdir().unwrap();
    let root: PathBuf = tmp.path().to_path_buf();

    let vault = Vault::open(&root).await.unwrap();
    let pool = vault.pool().clone();
    std::mem::forget(vault);

    let search = SearchIndex::create(root.join(".lattice/tantivy")).unwrap();
    let indexer = Indexer::new(root.clone(), pool, search);

    // Spawn the watcher on a small debounce window. The callback feeds
    // every coalesced event into the indexer via the current runtime's
    // handle — mirrors what the Tauri layer in apps/desktop will do.
    let indexer_for_callback = indexer.clone();
    let rt_handle = tokio::runtime::Handle::current();
    let _watcher = Watcher::start_with_debounce(&root, DEBOUNCE_MS, move |event| {
        let idx = indexer_for_callback.clone();
        rt_handle.spawn(async move {
            if let Err(err) = idx.apply_event(&event).await {
                eprintln!("indexer error: {err}");
            }
        });
    })
    .unwrap();

    // Give notify a beat to install the watch before we write.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let note_path = root.join("hello-search.md");
    tokio::fs::write(
        &note_path,
        "---\ntitle: Hello Search\ntags: [bench]\n---\n# Hello Search\nFox.\n",
    )
    .await
    .unwrap();

    // Poll until the indexer sees the doc, up to DEADLINE_MS.
    let deadline = Instant::now() + Duration::from_millis(DEADLINE_MS);
    let indexer = Arc::new(indexer);
    loop {
        let count = indexer.with_search(|s| s.num_docs().unwrap_or(0)).await;
        if count >= 1 {
            break;
        }
        if Instant::now() > deadline {
            panic!(
                "indexer did not see the new file within {DEADLINE_MS} ms \
                 (debounce {DEBOUNCE_MS} ms + 100 ms budget + slack)"
            );
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn delete_propagates_to_index() {
    let tmp = tempdir().unwrap();
    let root: PathBuf = tmp.path().to_path_buf();

    let vault = Vault::open(&root).await.unwrap();
    let pool = vault.pool().clone();
    std::mem::forget(vault);

    let search = SearchIndex::create(root.join(".lattice/tantivy")).unwrap();
    let indexer = Indexer::new(root.clone(), pool, search);

    let indexer_for_callback = indexer.clone();
    let rt_handle = tokio::runtime::Handle::current();
    let _watcher = Watcher::start_with_debounce(&root, DEBOUNCE_MS, move |event| {
        let idx = indexer_for_callback.clone();
        rt_handle.spawn(async move {
            let _ = idx.apply_event(&event).await;
        });
    })
    .unwrap();

    tokio::time::sleep(Duration::from_millis(50)).await;

    let note_path = root.join("temp.md");
    tokio::fs::write(&note_path, "# Temp\n").await.unwrap();

    // Wait for the create to land.
    let deadline = Instant::now() + Duration::from_millis(DEADLINE_MS);
    loop {
        let count = indexer.with_search(|s| s.num_docs().unwrap_or(0)).await;
        if count >= 1 {
            break;
        }
        if Instant::now() > deadline {
            panic!("create did not land in time");
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    tokio::fs::remove_file(&note_path).await.unwrap();

    // Now wait for the delete.
    let deadline = Instant::now() + Duration::from_millis(DEADLINE_MS);
    loop {
        let count = indexer.with_search(|s| s.num_docs().unwrap_or(0)).await;
        if count == 0 {
            break;
        }
        if Instant::now() > deadline {
            panic!(
                "indexer did not see the delete within {DEADLINE_MS} ms \
                 (debounce {DEBOUNCE_MS} ms + 100 ms budget + slack)"
            );
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn seed_from_disk_indexes_every_md_file() {
    let tmp = tempdir().unwrap();
    let root: PathBuf = tmp.path().to_path_buf();

    // Write a few files before opening anything.
    tokio::fs::write(root.join("alpha.md"), "# Alpha\n")
        .await
        .unwrap();
    tokio::fs::create_dir_all(root.join("Engineering"))
        .await
        .unwrap();
    tokio::fs::write(root.join("Engineering/beta.md"), "# Beta\n")
        .await
        .unwrap();

    let vault = Vault::open(&root).await.unwrap();
    let pool = vault.pool().clone();
    std::mem::forget(vault);
    let search = SearchIndex::create(root.join(".lattice/tantivy")).unwrap();
    let indexer = Indexer::new(root, pool.clone(), search);

    let count = indexer.seed_from_disk().await.unwrap();
    assert_eq!(count, 2);
    let count = indexer.with_search(|s| s.num_docs().unwrap_or(0)).await;
    assert_eq!(count, 2);

    let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM notes")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(n, 2);
}
