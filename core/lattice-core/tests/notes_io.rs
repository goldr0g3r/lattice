//! Integration tests for `lattice_core::notes` against the on-disk
//! markdown round-trip corpus (v0.2 PR #3.5).
//!
//! The contract: every fixture in [`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/)
//! must survive `notes::read → notes::write` byte-identical when fed in as the
//! starting on-disk content. This is the end-to-end gate for the v0.2 PR #1
//! Markdown serialiser combined with the new `notes::read`/`write` IO layer
//! — the contract that "open vault → edit → save → reopen → byte-identical
//! file" works no matter what fixture we pick.

use std::path::Path;

use lattice_core::{notes, Vault};

#[tokio::test]
async fn corpus_round_trips_through_notes_read_write() {
    let corpus_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("tests")
        .join("markdown-roundtrip");

    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = Vault::open(tmp.path()).await.expect("vault open");

    let mut fixtures: Vec<_> = std::fs::read_dir(&corpus_dir)
        .expect("read corpus")
        .filter_map(Result::ok)
        .filter(|entry| {
            let path = entry.path();
            // Mirror `tests/markdown_roundtrip.rs::corpus_fixtures` — only
            // `*.md` files, and skip the corpus-level README which documents
            // the suite rather than serving as a fixture.
            path.extension().and_then(|s| s.to_str()) == Some("md")
                && path.file_name().and_then(|s| s.to_str()) != Some("README.md")
        })
        .collect();
    fixtures.sort_by_key(|entry| entry.path());

    assert!(!fixtures.is_empty(), "corpus must not be empty");

    for fixture in fixtures {
        let raw = std::fs::read_to_string(fixture.path()).expect("read fixture");
        // Same CRLF normalisation the existing round-trip suite uses so the
        // Windows + Linux CI matrix sees the same bytes.
        let original = raw.replace("\r\n", "\n");
        let stem = fixture
            .path()
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let rel = format!("{stem}.md");

        // Copy the fixture into the vault, then load + save through notes.
        let dest = tmp.path().join(&rel);
        tokio::fs::write(&dest, &original)
            .await
            .expect("seed fixture");
        let content = notes::read(&vault, &rel).await.expect("notes::read");
        notes::write(&vault, &rel, &content.doc)
            .await
            .expect("notes::write");

        let after = tokio::fs::read_to_string(&dest).await.expect("re-read");
        assert_eq!(
            after, original,
            "fixture `{rel}` must round-trip byte-identical through notes::{{read,write}}",
        );
    }

    vault.close().await.expect("close");
}

#[tokio::test]
async fn list_then_read_round_trips_first_fixture() {
    let corpus = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("tests")
        .join("markdown-roundtrip")
        .join("simple.md");
    let original = std::fs::read_to_string(&corpus).expect("read simple.md");

    let tmp = tempfile::tempdir().expect("tempdir");
    let vault = Vault::open(tmp.path()).await.expect("vault open");
    tokio::fs::write(tmp.path().join("simple.md"), &original)
        .await
        .expect("seed");

    let summaries = notes::list(&vault).await.expect("list");
    let summary = summaries
        .iter()
        .find(|s| s.path == "simple.md")
        .expect("simple.md should be listed");
    let content = notes::read(&vault, &summary.path).await.expect("read");
    notes::write(&vault, &summary.path, &content.doc)
        .await
        .expect("write");

    let after = tokio::fs::read_to_string(tmp.path().join("simple.md"))
        .await
        .expect("re-read");
    assert_eq!(after, original);
    vault.close().await.expect("close");
}
