//! End-to-end search test — index a few notes via the v0.3 PR C
//! `Indexer`, then run a v0.3 PR E `Index::search` over the parsed
//! query AST and assert the right hits come back.
//!
//! Mirrors the acceptance row on issue #43 ("Free-text terms, `tag:`,
//! `path:`, quoted phrase") and the v0.3 perf budget (search returns
//! inside the 30 ms p99 / 10 k-note ceiling — exercised by
//! `core/lattice-search/benches/`; this file checks correctness, not
//! latency).

use chrono::Utc;
use lattice_core::indexer::Indexer;
use lattice_core::vault::Vault;
use lattice_core::watcher::{IndexEvent, IndexEventKind};
use lattice_search::{parse_query, Index as SearchIndex};
use tempfile::tempdir;

async fn setup_and_index(notes: &[(&str, &str)]) -> (tempfile::TempDir, Indexer) {
    let tmp = tempdir().unwrap();
    let vault = Vault::open(tmp.path()).await.unwrap();
    let pool = vault.pool().clone();
    std::mem::forget(vault);
    let search = SearchIndex::create(tmp.path().join(".lattice/tantivy")).unwrap();
    let indexer = Indexer::new(tmp.path().to_path_buf(), pool, search);

    for (name, body) in notes {
        let path = tmp.path().join(name);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await.unwrap();
        }
        tokio::fs::write(&path, body).await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
    }

    (tmp, indexer)
}

#[tokio::test]
async fn free_text_query_finds_body_match() {
    let (_tmp, indexer) = setup_and_index(&[
        ("alpha.md", "# Alpha\nRaft is a consensus algorithm.\n"),
        ("beta.md", "# Beta\nPaxos is another consensus protocol.\n"),
        ("gamma.md", "# Gamma\nUnrelated topic.\n"),
    ])
    .await;

    let q = parse_query("raft").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    let titles: Vec<_> = results.hits.iter().map(|h| h.title.as_str()).collect();
    assert!(
        titles.contains(&"Alpha"),
        "expected Alpha in hits, got {titles:?}"
    );
    assert!(
        !titles.contains(&"Gamma"),
        "Gamma should not match raft, got {titles:?}"
    );
}

#[tokio::test]
async fn title_matches_outrank_body_matches() {
    let (_tmp, indexer) = setup_and_index(&[
        (
            "raft-note.md",
            "# Raft Consensus\nA short note about consensus.\n",
        ),
        (
            "mention.md",
            "# Other Topic\nIncidentally mentions raft in passing somewhere.\n",
        ),
    ])
    .await;

    let q = parse_query("raft").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    assert!(results.hits.len() >= 2);
    // Title boost = 3.0 (ADR-0018) should put "Raft Consensus" on top.
    assert_eq!(
        results.hits[0].title, "Raft Consensus",
        "title-boost should rank the title-matching note first; got {:?}",
        results.hits.iter().map(|h| &h.title).collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn phrase_query_matches_adjacent_terms() {
    let (_tmp, indexer) = setup_and_index(&[
        (
            "one.md",
            "# One\nDistributed systems are interesting.\n",
        ),
        (
            "two.md",
            "# Two\nDistributed but not systems, then later systems.\n",
        ),
    ])
    .await;

    let q = parse_query("\"distributed systems\"").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    let titles: Vec<_> = results.hits.iter().map(|h| h.title.as_str()).collect();
    assert!(
        titles.contains(&"One"),
        "phrase query should match One; got {titles:?}"
    );
}

#[tokio::test]
async fn tag_scoped_query() {
    let (_tmp, indexer) = setup_and_index(&[
        (
            "tagged.md",
            "---\ntags: [distributed, consensus]\n---\n# Tagged\nBody.\n",
        ),
        ("untagged.md", "# Untagged\nNo tags here.\n"),
    ])
    .await;

    let q = parse_query("tag:distributed").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    let titles: Vec<_> = results.hits.iter().map(|h| h.title.as_str()).collect();
    assert_eq!(titles, vec!["Tagged"], "tag:distributed should match only Tagged");
}

#[tokio::test]
async fn path_prefix_query() {
    let (_tmp, indexer) = setup_and_index(&[
        ("Engineering/a.md", "# A\nbody.\n"),
        ("Engineering/b.md", "# B\nbody.\n"),
        ("Personal/c.md", "# C\nbody.\n"),
    ])
    .await;

    let q = parse_query("path:Engineering/").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    let titles: Vec<_> = {
        let mut t: Vec<_> = results.hits.iter().map(|h| h.title.clone()).collect();
        t.sort();
        t
    };
    assert_eq!(titles, vec!["A".to_string(), "B".to_string()]);
}

#[tokio::test]
async fn negation_excludes() {
    let (_tmp, indexer) = setup_and_index(&[
        ("alpha.md", "# Alpha\nraft consensus algorithm.\n"),
        ("beta.md", "# Beta\nraft draft note.\n"),
    ])
    .await;

    let q = parse_query("raft -draft").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    let titles: Vec<_> = results.hits.iter().map(|h| h.title.clone()).collect();
    assert_eq!(titles, vec!["Alpha".to_string()]);
}

#[tokio::test]
async fn snippet_highlights_matched_terms() {
    let (_tmp, indexer) = setup_and_index(&[(
        "snippet.md",
        "# Snippet test\nThe quick brown fox jumps over the lazy dog. \
         Raft is a consensus algorithm with leader election.\n",
    )])
    .await;

    let q = parse_query("raft").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    assert_eq!(results.hits.len(), 1);
    let snippet = &results.hits[0].snippet;
    assert!(
        snippet.contains("<b>") || snippet.contains("<mark>"),
        "expected highlight markup in snippet, got `{snippet}`"
    );
    assert!(
        snippet.to_lowercase().contains("raft"),
        "snippet should contain the matched term, got `{snippet}`"
    );
}

#[tokio::test]
async fn empty_query_matches_all() {
    let (_tmp, indexer) = setup_and_index(&[
        ("a.md", "# A\nbody.\n"),
        ("b.md", "# B\nbody.\n"),
        ("c.md", "# C\nbody.\n"),
    ])
    .await;

    let q = parse_query("").unwrap();
    let results = indexer.with_search(|s| s.search(&q, 20).unwrap()).await;
    assert_eq!(
        results.total, 3,
        "empty query should match all docs, got {}",
        results.total
    );
}
