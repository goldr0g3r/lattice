//! `Index` — the per-vault Tantivy handle.
//!
//! Wraps `tantivy::Index` + a long-lived `IndexWriter` so callers can stream
//! `add_document` / `delete_document` / `commit` calls without re-creating
//! the writer (which is expensive). The contract is:
//!
//! * One [`Index`] per open vault, kept inside the `lattice-core` vault
//!   state alongside the SQLite pool.
//! * The watcher (v0.3 PR C) calls `add_document` for each `Created /
//!   Modified` event and `delete_document` for `Removed`, then `commit`
//!   once per debounce tick.
//! * On vault open, if `<vault>/.lattice/tantivy/` is missing, we
//!   [`Index::create`] a fresh one and the indexer triggers
//!   [`Index::reindex_all`] with every note on disk.
//! * Schema mismatch (post-upgrade) is detected at [`Index::open`] time
//!   and surfaces as [`crate::SearchError::SchemaMismatch`]; the caller
//!   recovers by deleting the directory and re-creating.
//!
//! The index files live under `<vault>/.lattice/tantivy/`; the
//! [`crate::INDEX_DIR_NAME`] constant carries the subdirectory name so
//! the SQLite + index layers stay in sync.

use std::path::{Path, PathBuf};

use tantivy::collector::Count;
use tantivy::directory::MmapDirectory;
use tantivy::query::AllQuery;
use tantivy::schema::Schema;
use tantivy::{
    Index as TantivyIndex, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
};

use crate::doc::IndexDoc;
use crate::error::{SearchError, SearchResult};
use crate::schema::{build_schema, Fields, BODY_TOKENIZER, RAW_TOKENIZER, TITLE_TOKENIZER};

/// Writer heap budget — 50 MB matches the Tantivy "single-thread small
/// dataset" recommendation. We can raise this for the v0.3 reindex bench
/// (which feeds in 10 k docs) if the budget shows up as the bottleneck.
const WRITER_HEAP_BYTES: usize = 50_000_000;

/// Per-vault Tantivy handle. Cheap to call `add_document` / `delete_document` /
/// `commit` on; not `Clone` because the underlying writer isn't.
pub struct Index {
    /// Filesystem root of the index (e.g., `<vault>/.lattice/tantivy/`).
    root: PathBuf,
    /// Tantivy index handle. Survives for the life of the [`Index`].
    inner: TantivyIndex,
    /// Long-lived writer. Held across `add_document` calls; `commit` flushes
    /// staged ops to disk and makes them visible to readers.
    writer: IndexWriter,
    /// Long-lived reader. Refreshes on demand so `num_docs` reflects the
    /// latest commit without re-opening files.
    reader: IndexReader,
    /// Field handles — owned by the schema so callers don't need to look
    /// up field names per write.
    fields: Fields,
}

impl Index {
    /// Open an existing index at `path`. The directory must exist; if it
    /// doesn't, call [`Index::create`] instead.
    ///
    /// If the on-disk schema differs from the crate's locked schema, returns
    /// [`SearchError::SchemaMismatch`]; recovery is to drop the directory
    /// and re-`create`.
    pub fn open(path: impl AsRef<Path>) -> SearchResult<Self> {
        let root = path.as_ref().to_path_buf();
        let dir = MmapDirectory::open(&root)?;
        let inner = TantivyIndex::open(dir)?;
        let (expected_schema, fields) = build_schema();
        Self::verify_schema(&inner.schema(), &expected_schema)?;
        Self::register_tokenizers(&inner);
        let writer: IndexWriter = inner.writer(WRITER_HEAP_BYTES)?;
        let reader = inner
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        Ok(Self {
            root,
            inner,
            writer,
            reader,
            fields,
        })
    }

    /// Create a fresh index at `path`. Creates the directory if missing.
    /// If a Tantivy index already exists in `path`, its files are
    /// overwritten — callers wanting a hard reset should
    /// [`crate::drop_index_dir`] first.
    pub fn create(path: impl AsRef<Path>) -> SearchResult<Self> {
        let root = path.as_ref().to_path_buf();
        std::fs::create_dir_all(&root).map_err(|source| SearchError::Io {
            path: root.clone(),
            source,
        })?;
        let dir = MmapDirectory::open(&root)?;
        let (schema, fields) = build_schema();
        let inner = TantivyIndex::create(dir, schema, tantivy::IndexSettings::default())?;
        Self::register_tokenizers(&inner);
        let writer = inner.writer(WRITER_HEAP_BYTES)?;
        let reader = inner
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;
        Ok(Self {
            root,
            inner,
            writer,
            reader,
            fields,
        })
    }

    /// Open the index at `path` if it exists, else create a fresh one.
    /// The common bootstrap call from `lattice-core::vault::open`.
    pub fn open_or_create(path: impl AsRef<Path>) -> SearchResult<Self> {
        let p = path.as_ref();
        // `MmapDirectory::open` succeeds if the directory exists; tantivy
        // then errors with `OpenReadError::FileDoesNotExist("meta.json")`
        // when the index hasn't been initialised. Detect that path by
        // probing for `meta.json`.
        if p.join("meta.json").exists() {
            Self::open(p)
        } else {
            Self::create(p)
        }
    }

    /// Add (or replace) a document. The replace semantics: `delete_term`
    /// on the `id` field, then `add_document`. Both happen in the same
    /// writer txn, so a commit either persists both or neither.
    pub fn add_document(&mut self, doc: &IndexDoc) -> SearchResult<()> {
        self.writer
            .delete_term(Term::from_field_text(self.fields.id, &doc.id));
        let mut td = TantivyDocument::new();
        td.add_text(self.fields.id, &doc.id);
        td.add_text(self.fields.path, &doc.path);
        td.add_text(self.fields.title, &doc.title);
        td.add_text(self.fields.body, &doc.body);
        for tag in &doc.tags {
            td.add_text(self.fields.tags, tag);
        }
        self.writer.add_document(td)?;
        Ok(())
    }

    /// Delete by `id`. No-op if the id isn't present. Becomes effective
    /// only after [`Index::commit`].
    pub fn delete_document(&mut self, id: &str) -> SearchResult<()> {
        self.writer
            .delete_term(Term::from_field_text(self.fields.id, id));
        Ok(())
    }

    /// Commit pending changes. After this returns, the next reader load
    /// sees them. Returns the new `opstamp` so callers can correlate
    /// commits with watcher batches.
    pub fn commit(&mut self) -> SearchResult<u64> {
        let stamp = self.writer.commit()?;
        // Trigger a synchronous reload so [`Self::num_docs`] reflects the
        // commit on the very next call. `OnCommitWithDelay` would catch
        // up eventually but tests want the new value now.
        self.reader.reload()?;
        Ok(stamp)
    }

    /// Tear the index down to empty and re-add every doc in `docs`,
    /// committing once at the end. Returns the commit opstamp.
    ///
    /// Used by:
    ///
    /// * Vault open when `<vault>/.lattice/tantivy/` exists but its
    ///   contents don't match the SQLite `notes` table (drift recovery).
    /// * The "Rebuild index" command in the settings panel (v0.3 PR E).
    pub fn reindex_all<I>(&mut self, docs: I) -> SearchResult<u64>
    where
        I: IntoIterator<Item = IndexDoc>,
    {
        self.writer.delete_all_documents()?;
        for d in docs {
            self.add_document(&d)?;
        }
        self.commit()
    }

    /// Commit any pending changes and consume the handle. Returns the
    /// final opstamp.
    pub fn close(mut self) -> SearchResult<u64> {
        let stamp = self.commit()?;
        // The writer's drop blocks waiting for in-flight merges, which is
        // what we want — close() should be synchronous.
        drop(self.writer);
        Ok(stamp)
    }

    /// Number of committed documents in the index. Excludes pending adds
    /// that haven't been committed yet.
    pub fn num_docs(&self) -> SearchResult<u64> {
        let searcher = self.reader.searcher();
        let count = searcher.search(&AllQuery, &Count)?;
        Ok(count as u64)
    }

    /// Snapshot stats for telemetry / debug surfaces.
    pub fn stats(&self) -> SearchResult<IndexStats> {
        let searcher = self.reader.searcher();
        let count = searcher.search(&AllQuery, &Count)?;
        Ok(IndexStats {
            num_docs: count as u64,
            num_segments: searcher.segment_readers().len() as u32,
        })
    }

    /// Filesystem root of the on-disk index. Lets the indexer rebuild
    /// state without re-deriving the path.
    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Field handles (for callers that need to build a raw Tantivy query
    /// before the v0.3 PR D parser lands).
    #[must_use]
    pub fn fields(&self) -> Fields {
        self.fields
    }

    /// A read-only [`tantivy::Searcher`] over the latest commit. Returned
    /// by value because the underlying reader is shared and snapshotting
    /// is cheap (`Arc`-based).
    pub fn reader_searcher(&self) -> tantivy::Searcher {
        self.reader.searcher()
    }

    fn verify_schema(found: &Schema, expected: &Schema) -> SearchResult<()> {
        let found_fields: Vec<_> = found.fields().map(|(_, e)| e.name().to_string()).collect();
        let expected_fields: Vec<_> = expected
            .fields()
            .map(|(_, e)| e.name().to_string())
            .collect();
        if found_fields != expected_fields {
            return Err(SearchError::SchemaMismatch {
                reason: format!(
                    "field list differs (found {found_fields:?}, expected {expected_fields:?})"
                ),
            });
        }
        Ok(())
    }

    fn register_tokenizers(index: &TantivyIndex) {
        use tantivy::tokenizer::{
            Language, LowerCaser, RawTokenizer, RemoveLongFilter, SimpleTokenizer, Stemmer,
            TextAnalyzer,
        };
        let manager = index.tokenizers();
        // `default` and `raw` are registered by Tantivy out of the box;
        // re-register them explicitly so the schema's named tokenizers
        // resolve even when callers swap Tantivy versions that change
        // defaults. Idempotent.
        manager.register(
            TITLE_TOKENIZER,
            TextAnalyzer::builder(SimpleTokenizer::default())
                .filter(RemoveLongFilter::limit(40))
                .filter(LowerCaser)
                .build(),
        );
        manager.register(RAW_TOKENIZER, TextAnalyzer::from(RawTokenizer::default()));
        manager.register(
            BODY_TOKENIZER,
            TextAnalyzer::builder(SimpleTokenizer::default())
                .filter(RemoveLongFilter::limit(40))
                .filter(LowerCaser)
                .filter(Stemmer::new(Language::English))
                .build(),
        );
    }

    /// Direct access to the underlying Tantivy index — escape hatch for
    /// the v0.3 PR D query parser before this crate grows its own
    /// `query()` method.
    #[must_use]
    pub fn tantivy(&self) -> &TantivyIndex {
        &self.inner
    }
}

/// Quick snapshot of the index for diagnostics. Returned by [`Index::stats`].
#[derive(Debug, Clone, Copy)]
pub struct IndexStats {
    /// Number of committed documents.
    pub num_docs: u64,
    /// Number of on-disk segments. Useful to spot a runaway merge backlog.
    pub num_segments: u32,
}

/// Delete the on-disk index directory at `path`. Idempotent: missing is
/// not an error. Used by the "rebuild index" command and by
/// [`crate::Index::create`] callers who want a guaranteed-clean start.
pub fn drop_index_dir(path: impl AsRef<Path>) -> SearchResult<()> {
    let p = path.as_ref();
    if !p.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(p).map_err(|source| SearchError::Io {
        path: p.to_path_buf(),
        source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample(id: &str, title: &str, body: &str, tags: &[&str]) -> IndexDoc {
        IndexDoc {
            id: id.into(),
            path: format!("notes/{id}.md"),
            title: title.into(),
            body: body.into(),
            tags: tags.iter().map(|s| (*s).to_string()).collect(),
        }
    }

    #[test]
    fn create_then_add_then_count() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "the quick brown fox", &["a"]))
            .unwrap();
        idx.add_document(&sample("n2", "Beta", "lazy dog", &["b"]))
            .unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 2);
    }

    #[test]
    fn replace_by_id() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "first", &["a"]))
            .unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 1);

        idx.add_document(&sample("n1", "Alpha v2", "second", &["a", "b"]))
            .unwrap();
        idx.commit().unwrap();
        assert_eq!(
            idx.num_docs().unwrap(),
            1,
            "re-adding the same id must replace, not duplicate"
        );
    }

    #[test]
    fn delete_then_count() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "x", &[])).unwrap();
        idx.add_document(&sample("n2", "Beta", "y", &[])).unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 2);

        idx.delete_document("n1").unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 1);
    }

    #[test]
    fn delete_unknown_id_is_noop() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "x", &[])).unwrap();
        idx.commit().unwrap();
        idx.delete_document("ghost").unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 1);
    }

    #[test]
    fn reindex_all_resets_then_repopulates() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("old", "Old", "", &[])).unwrap();
        idx.commit().unwrap();
        assert_eq!(idx.num_docs().unwrap(), 1);

        let fresh = vec![
            sample("a", "A", "", &[]),
            sample("b", "B", "", &[]),
            sample("c", "C", "", &[]),
        ];
        idx.reindex_all(fresh).unwrap();
        assert_eq!(idx.num_docs().unwrap(), 3);
    }

    #[test]
    fn open_or_create_reuses_existing_index() {
        let tmp = tempdir().unwrap();
        {
            let mut idx = Index::open_or_create(tmp.path()).unwrap();
            idx.add_document(&sample("n1", "Alpha", "x", &[])).unwrap();
            idx.close().unwrap();
        }
        let idx = Index::open_or_create(tmp.path()).unwrap();
        assert_eq!(
            idx.num_docs().unwrap(),
            1,
            "second open_or_create must not wipe the index"
        );
    }

    #[test]
    fn drop_index_dir_is_idempotent() {
        let tmp = tempdir().unwrap();
        let p = tmp.path().join("never_created");
        drop_index_dir(&p).unwrap();
        assert!(!p.exists());

        let q = tmp.path().join("created");
        std::fs::create_dir_all(&q).unwrap();
        std::fs::write(q.join("foo.txt"), b"x").unwrap();
        drop_index_dir(&q).unwrap();
        assert!(!q.exists());
    }

    #[test]
    fn stats_reports_committed_count() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "", &[])).unwrap();
        // Stats before commit should be 0.
        let pre = idx.stats().unwrap();
        assert_eq!(pre.num_docs, 0);
        idx.commit().unwrap();
        let post = idx.stats().unwrap();
        assert_eq!(post.num_docs, 1);
        assert!(post.num_segments >= 1);
    }

    #[test]
    fn close_returns_opstamp_and_persists() {
        let tmp = tempdir().unwrap();
        let mut idx = Index::create(tmp.path()).unwrap();
        idx.add_document(&sample("n1", "Alpha", "x", &[])).unwrap();
        let stamp = idx.close().unwrap();
        assert!(stamp >= 1);
        let reopened = Index::open(tmp.path()).unwrap();
        assert_eq!(reopened.num_docs().unwrap(), 1);
    }
}
