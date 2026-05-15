//! The unified indexer — v0.3 PR C (`feat(search): live re-indexing on save`).
//!
//! Owns the wiring between three on-disk stores so any change to a `.md`
//! file in the vault flows into all of them atomically per save:
//!
//! 1. **Tantivy** (via [`lattice_search::Index`]) — full-text index that
//!    powers the search modal ([#43]).
//! 2. **SQLite `notes`** — scalar metadata (path, title, frontmatter,
//!    body hash, created / updated timestamps) that the picker rail and
//!    the v0.3 PR G tree views read.
//! 3. **SQLite `tags` + `note_tags`** — frontmatter `tags` array,
//!    populated for the v0.3 PR G tag tree.
//! 4. **SQLite `links`** — `[[wiki-links]]` and internal markdown links
//!    extracted from the body, populated for the v0.3 PR F backlinks
//!    panel per the eventual-consistency model locked by [ADR-0020].
//!
//! ## Threading
//!
//! [`Indexer`] is `Clone` (it's `Arc`-wrapped) so the Tauri layer can
//! hand a clone to the file watcher's sync callback thread. The callback
//! `tokio::Handle::spawn`s [`Indexer::apply_event`] onto the existing
//! tokio runtime; the indexer's Tantivy writer is wrapped in a
//! `tokio::sync::Mutex` so concurrent watcher batches serialise without
//! blocking the IPC thread.
//!
//! ## Identity
//!
//! Until v0.5 introduces UUID frontmatter, a note's identity is its
//! vault-relative POSIX path — same convention as
//! [`crate::notes::NoteSummary::id`]. The indexer rejects absolute or
//! escape-paths the same way [`crate::notes::read`] does, so a
//! malformed watcher event can never write outside the vault.
//!
//! [#43]: https://github.com/goldr0g3r/lattice/issues/43
//! [ADR-0020]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0020-backlinks-staleness-model.md

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use lattice_search::{Index as SearchIndex, IndexDoc};
use sha2::{Digest, Sha256};
use sqlx::SqlitePool;
use tokio::sync::Mutex;

use crate::error::{LatticeError, LatticeResult};
use crate::markdown::{self, Block, Frontmatter, Inline, NoteDoc};
use crate::types::LinkKind;
use crate::vault::LATTICE_DIR;
use crate::watcher::{IndexEvent, IndexEventKind};

/// File extension we index. Anything else is ignored by the watcher path.
const NOTE_EXT: &str = "md";

/// One indexable note as extracted from a `NoteDoc`. Carries everything
/// every store needs so we don't re-walk the AST per store.
#[derive(Debug, Clone)]
struct ExtractedNote {
    id: String,
    path: String,
    title: String,
    frontmatter_json: String,
    body_text: String,
    body_hash: String,
    tags: Vec<String>,
    links: Vec<ExtractedLink>,
}

#[derive(Debug, Clone)]
struct ExtractedLink {
    dst: String,
    kind: LinkKind,
}

/// The unified indexer. Cheap to `clone`.
#[derive(Clone)]
pub struct Indexer {
    inner: Arc<Inner>,
}

struct Inner {
    vault_root: PathBuf,
    pool: SqlitePool,
    search: Mutex<SearchIndex>,
}

impl Indexer {
    /// Wire up an indexer over the open vault's stores.
    ///
    /// The caller owns the `Vault` (and thus the [`SqlitePool`]); the
    /// indexer holds a clone of the pool. The [`SearchIndex`] is moved
    /// in — there's exactly one writer per vault.
    pub fn new(vault_root: impl Into<PathBuf>, pool: SqlitePool, search: SearchIndex) -> Self {
        Self {
            inner: Arc::new(Inner {
                vault_root: vault_root.into(),
                pool,
                search: Mutex::new(search),
            }),
        }
    }

    /// Drain every `.md` file under the vault root, parse it, and write
    /// it to all four stores. Used on first open of a vault whose
    /// `.lattice/tantivy/` directory was missing (or rejected by
    /// [`SearchIndex::open`] with a schema mismatch).
    ///
    /// Returns the number of notes indexed. Idempotent — re-running on a
    /// populated vault re-indexes every file.
    pub async fn seed_from_disk(&self) -> LatticeResult<usize> {
        let files = walk_markdown(&self.inner.vault_root).await?;
        let count = files.len();
        for abs in files {
            // Read + parse on the async runtime; the SQLite + Tantivy
            // writes happen inside `index_one_path`.
            if let Err(err) = self.index_one_path(&abs).await {
                tracing::warn!(
                    error = %err,
                    path = %abs.display(),
                    "indexer: failed to index file during seed_from_disk; continuing"
                );
            }
        }
        self.commit().await?;
        Ok(count)
    }

    /// Process one watcher event. The dispatch:
    ///
    /// * [`IndexEventKind::Created`] / [`IndexEventKind::Modified`] —
    ///   re-read the file, upsert all four stores, commit Tantivy.
    /// * [`IndexEventKind::Removed`] — delete from Tantivy + SQLite.
    /// * [`IndexEventKind::Renamed`] — handled per `notify`'s shape: the
    ///   debouncer emits a `Modified` for both the old and the new path,
    ///   so we treat a rename as remove-then-add by virtue of the
    ///   surrounding events. If the file at `path` exists we add; if it
    ///   doesn't we remove. This keeps the indexer correct without
    ///   coupling to notify's per-platform rename semantics.
    /// * [`IndexEventKind::Other`] — ignored (intentional: events we
    ///   don't classify shouldn't trigger spurious re-indexes).
    ///
    /// Events for paths outside the vault, paths under `.lattice/`, or
    /// non-`.md` files are dropped silently.
    pub async fn apply_event(&self, event: &IndexEvent) -> LatticeResult<()> {
        let abs = PathBuf::from(&event.path);
        if !self.is_indexable_path(&abs) {
            return Ok(());
        }
        match event.kind {
            IndexEventKind::Created | IndexEventKind::Modified | IndexEventKind::Renamed => {
                if tokio::fs::try_exists(&abs).await? {
                    self.index_one_path(&abs).await?;
                } else {
                    // Renamed-away or transient: the file is gone.
                    self.remove_one_path(&abs).await?;
                }
            }
            IndexEventKind::Removed => {
                self.remove_one_path(&abs).await?;
            }
            IndexEventKind::Other => {
                // Intentionally ignored.
            }
        }
        self.commit().await
    }

    /// Force-commit any pending Tantivy ops. Watcher callers don't
    /// usually need to call this directly — [`Self::apply_event`] commits
    /// at the end — but the seed path and the bench harness do.
    pub async fn commit(&self) -> LatticeResult<()> {
        let mut search = self.inner.search.lock().await;
        search.commit()?;
        Ok(())
    }

    /// Borrow the underlying [`SearchIndex`] briefly. Used by the v0.3
    /// PR D query parser to attach a searcher.
    pub async fn with_search<R>(&self, f: impl FnOnce(&SearchIndex) -> R) -> R {
        let search = self.inner.search.lock().await;
        f(&search)
    }

    // -------------------------------------------------------------------
    // internals
    // -------------------------------------------------------------------

    /// True iff `abs` is a `.md` file under the vault root and outside
    /// `.lattice/`.
    fn is_indexable_path(&self, abs: &Path) -> bool {
        // Reject absolute paths outside the vault (a malformed watcher
        // event could in theory carry one).
        let Ok(rel) = abs.strip_prefix(&self.inner.vault_root) else {
            return false;
        };
        // Reject anything under `.lattice/`.
        if rel.components().any(|c| c.as_os_str() == LATTICE_DIR) {
            return false;
        }
        // Only `.md` files (case-insensitive).
        abs.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case(NOTE_EXT))
            .unwrap_or(false)
    }

    async fn index_one_path(&self, abs: &Path) -> LatticeResult<()> {
        let raw = tokio::fs::read_to_string(abs).await?;
        let doc = markdown::parse(&raw)?;
        let rel = relative_to(&self.inner.vault_root, abs)?;
        let extracted = extract(&rel, &raw, &doc);

        // SQLite writes — `notes`, `tags + note_tags`, `links` — all in
        // one transaction so a crash mid-update doesn't leave a
        // half-indexed note.
        let mut tx = self.inner.pool.begin().await?;
        upsert_note(&mut tx, &extracted).await?;
        replace_tags(&mut tx, &extracted.id, &extracted.tags).await?;
        replace_links(&mut tx, &extracted.id, &extracted.links).await?;
        tx.commit().await?;

        // Tantivy write happens after SQLite so the inverted index is
        // never ahead of the scalar metadata it joins back to.
        let mut search = self.inner.search.lock().await;
        search.add_document(&IndexDoc {
            id: extracted.id,
            path: extracted.path,
            title: extracted.title,
            body: extracted.body_text,
            tags: extracted.tags,
        })?;
        Ok(())
    }

    async fn remove_one_path(&self, abs: &Path) -> LatticeResult<()> {
        let rel = relative_to(&self.inner.vault_root, abs)?;
        let mut tx = self.inner.pool.begin().await?;
        sqlx::query("DELETE FROM note_tags WHERE note_id = ?1")
            .bind(&rel)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM links WHERE src = ?1")
            .bind(&rel)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM notes WHERE id = ?1")
            .bind(&rel)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        let mut search = self.inner.search.lock().await;
        search.delete_document(&rel)?;
        Ok(())
    }
}

// =========================================================================
// SQLite helpers (free functions so tests can call them on a bare pool)
// =========================================================================

async fn upsert_note(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    n: &ExtractedNote,
) -> LatticeResult<()> {
    let now = Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO notes (id, path, title, frontmatter, body_hash, created, updated)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
            path        = excluded.path,
            title       = excluded.title,
            frontmatter = excluded.frontmatter,
            body_hash   = excluded.body_hash,
            updated     = excluded.updated",
    )
    .bind(&n.id)
    .bind(&n.path)
    .bind(&n.title)
    .bind(&n.frontmatter_json)
    .bind(&n.body_hash)
    .bind(&now)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn replace_tags(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    note_id: &str,
    tags: &[String],
) -> LatticeResult<()> {
    sqlx::query("DELETE FROM note_tags WHERE note_id = ?1")
        .bind(note_id)
        .execute(&mut **tx)
        .await?;
    for tag in tags {
        sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?1)")
            .bind(tag)
            .execute(&mut **tx)
            .await?;
        sqlx::query(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id)
             SELECT ?1, id FROM tags WHERE name = ?2",
        )
        .bind(note_id)
        .bind(tag)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

async fn replace_links(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    note_id: &str,
    links: &[ExtractedLink],
) -> LatticeResult<()> {
    sqlx::query("DELETE FROM links WHERE src = ?1")
        .bind(note_id)
        .execute(&mut **tx)
        .await?;
    let mut seen: HashSet<(String, String)> = HashSet::new();
    for link in links {
        let key = (link.dst.clone(), kind_str(link.kind).to_string());
        if !seen.insert(key) {
            continue;
        }
        sqlx::query("INSERT OR IGNORE INTO links (src, dst, kind) VALUES (?1, ?2, ?3)")
            .bind(note_id)
            .bind(&link.dst)
            .bind(kind_str(link.kind))
            .execute(&mut **tx)
            .await?;
    }
    Ok(())
}

fn kind_str(kind: LinkKind) -> &'static str {
    match kind {
        LinkKind::WikiLink => "wiki_link",
        LinkKind::Markdown => "markdown",
        LinkKind::Embed => "embed",
    }
}

// =========================================================================
// Extraction
// =========================================================================

fn extract(rel_path: &str, raw: &str, doc: &NoteDoc) -> ExtractedNote {
    let title = title_of(doc, rel_path);
    let body_text = flatten_body(&doc.body);
    let body_hash = {
        let mut h = Sha256::new();
        h.update(raw.as_bytes());
        format!("{:x}", h.finalize())
    };
    let frontmatter_json = frontmatter_json(&doc.frontmatter);
    let tags = collect_tags(&doc.frontmatter);
    let links = collect_links(&doc.body);
    ExtractedNote {
        id: rel_path.to_string(),
        path: rel_path.to_string(),
        title,
        frontmatter_json,
        body_text,
        body_hash,
        tags,
        links,
    }
}

fn title_of(doc: &NoteDoc, rel_path: &str) -> String {
    for entry in &doc.frontmatter.entries {
        if entry.key == "title" {
            if let Some(s) = entry.value.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }
    for block in &doc.body {
        if let Block::Heading { content, .. } = block {
            let mut buf = String::new();
            collect_inline_text(content, &mut buf);
            let trimmed = buf.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    rel_path
        .rsplit('/')
        .next()
        .unwrap_or(rel_path)
        .strip_suffix(".md")
        .unwrap_or(rel_path)
        .to_string()
}

fn frontmatter_json(fm: &Frontmatter) -> String {
    if fm.entries.is_empty() {
        return "{}".to_string();
    }
    let map: serde_json::Map<String, serde_json::Value> = fm
        .entries
        .iter()
        .map(|e| (e.key.clone(), e.value.clone()))
        .collect();
    serde_json::to_string(&map).unwrap_or_else(|_| "{}".to_string())
}

fn collect_tags(fm: &Frontmatter) -> Vec<String> {
    let mut out = Vec::new();
    for entry in &fm.entries {
        if entry.key != "tags" && entry.key != "tag" {
            continue;
        }
        match &entry.value {
            serde_json::Value::Array(arr) => {
                for v in arr {
                    if let Some(s) = v.as_str() {
                        push_tag(&mut out, s);
                    }
                }
            }
            serde_json::Value::String(s) => {
                for part in s.split(',') {
                    push_tag(&mut out, part);
                }
            }
            _ => {}
        }
    }
    out
}

fn push_tag(out: &mut Vec<String>, raw: &str) {
    let trimmed = raw.trim().trim_start_matches('#');
    if !trimmed.is_empty() && !out.iter().any(|t| t == trimmed) {
        out.push(trimmed.to_string());
    }
}

fn collect_links(blocks: &[Block]) -> Vec<ExtractedLink> {
    let mut out = Vec::new();
    walk_blocks_for_links(blocks, &mut out);
    out
}

fn walk_blocks_for_links(blocks: &[Block], out: &mut Vec<ExtractedLink>) {
    for block in blocks {
        match block {
            Block::Heading { content, .. } | Block::Paragraph { content } => {
                walk_inline_for_links(content, out);
            }
            Block::BulletList { items } | Block::OrderedList { items, .. } => {
                for it in items {
                    walk_blocks_for_links(&it.content, out);
                }
            }
            Block::Blockquote { content } | Block::Callout { body: content, .. } => {
                walk_blocks_for_links(content, out);
            }
            Block::FootnoteDefinition { content, .. } => {
                walk_blocks_for_links(content, out);
            }
            Block::Table { header, rows, .. } => {
                for cell in &header.cells {
                    walk_inline_for_links(cell, out);
                }
                for row in rows {
                    for cell in &row.cells {
                        walk_inline_for_links(cell, out);
                    }
                }
            }
            _ => {}
        }
    }
}

fn walk_inline_for_links(items: &[Inline], out: &mut Vec<ExtractedLink>) {
    for item in items {
        match item {
            Inline::WikiLink { target, .. } => {
                let trimmed = target.trim();
                if !trimmed.is_empty() {
                    out.push(ExtractedLink {
                        dst: trimmed.to_string(),
                        kind: LinkKind::WikiLink,
                    });
                }
            }
            Inline::Link { url, content, .. } => {
                // Only track internal-looking targets: any URL with no
                // scheme. External http(s):// / mailto: / etc. don't go
                // into the backlinks panel.
                if !url.contains("://") && !url.starts_with("mailto:") && !url.is_empty() {
                    out.push(ExtractedLink {
                        dst: url.clone(),
                        kind: LinkKind::Markdown,
                    });
                }
                walk_inline_for_links(content, out);
            }
            Inline::Strong { content }
            | Inline::Emphasis { content }
            | Inline::Strikethrough { content } => {
                walk_inline_for_links(content, out);
            }
            _ => {}
        }
    }
}

fn flatten_body(blocks: &[Block]) -> String {
    let mut buf = String::with_capacity(256);
    flatten_blocks(blocks, &mut buf);
    buf
}

fn flatten_blocks(blocks: &[Block], buf: &mut String) {
    for block in blocks {
        match block {
            Block::Heading { content, .. } | Block::Paragraph { content } => {
                collect_inline_text(content, buf);
                buf.push('\n');
            }
            Block::BulletList { items } | Block::OrderedList { items, .. } => {
                for it in items {
                    flatten_blocks(&it.content, buf);
                    buf.push('\n');
                }
            }
            Block::Blockquote { content } | Block::Callout { body: content, .. } => {
                flatten_blocks(content, buf);
            }
            Block::Fenced { body, .. } => {
                buf.push_str(body);
                buf.push('\n');
            }
            Block::Math { src } => {
                buf.push_str(src);
                buf.push('\n');
            }
            Block::Table { header, rows, .. } => {
                for cell in &header.cells {
                    collect_inline_text(cell, buf);
                    buf.push(' ');
                }
                buf.push('\n');
                for row in rows {
                    for cell in &row.cells {
                        collect_inline_text(cell, buf);
                        buf.push(' ');
                    }
                    buf.push('\n');
                }
            }
            Block::HtmlBlock { html } => {
                buf.push_str(html);
                buf.push('\n');
            }
            Block::FootnoteDefinition { content, .. } => {
                flatten_blocks(content, buf);
            }
            Block::ThematicBreak => {}
        }
    }
}

fn collect_inline_text(items: &[Inline], out: &mut String) {
    for item in items {
        match item {
            Inline::Text { value } => out.push_str(value),
            Inline::Code { value } => out.push_str(value),
            Inline::WikiLink { target, alias } => {
                out.push_str(alias.as_deref().unwrap_or(target));
            }
            Inline::Link { content, .. } => collect_inline_text(content, out),
            Inline::Strong { content }
            | Inline::Emphasis { content }
            | Inline::Strikethrough { content } => collect_inline_text(content, out),
            Inline::Math { src, .. } => out.push_str(src),
            _ => {}
        }
        out.push(' ');
    }
}

// =========================================================================
// FS helpers
// =========================================================================

fn relative_to(root: &Path, abs: &Path) -> LatticeResult<String> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| LatticeError::InvalidPath {
            path: abs.to_string_lossy().to_string(),
            reason: "file is outside the vault root".into(),
        })?;
    let posix = rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/");
    Ok(posix)
}

async fn walk_markdown(root: &Path) -> LatticeResult<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let mut reader = match tokio::fs::read_dir(&dir).await {
            Ok(r) => r,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
            Err(err) => return Err(err.into()),
        };
        while let Some(entry) = reader.next_entry().await? {
            let path = entry.path();
            let metadata = match entry.metadata().await {
                Ok(m) => m,
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
                Err(err) => return Err(err.into()),
            };
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            if metadata.is_dir() {
                if name_str == LATTICE_DIR || name_str.starts_with('.') {
                    continue;
                }
                stack.push(path);
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            if !name_str.to_ascii_lowercase().ends_with(".md") {
                continue;
            }
            out.push(path);
        }
    }
    Ok(out)
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::vault::Vault;
    use lattice_search::Index as SearchIndex;
    use tempfile::tempdir;

    async fn setup() -> (tempfile::TempDir, Indexer) {
        let tmp = tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        let pool = vault.pool().clone();
        // Don't `close()` the vault: that would close the pool we just
        // cloned. We hold the vault for its lifetime via the tempdir
        // (the file backing it goes away when tmp is dropped).
        std::mem::forget(vault);
        let search = SearchIndex::create(tmp.path().join(".lattice/tantivy")).unwrap();
        let indexer = Indexer::new(tmp.path().to_path_buf(), pool, search);
        (tmp, indexer)
    }

    async fn count_notes(pool: &SqlitePool) -> i64 {
        let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM notes")
            .fetch_one(pool)
            .await
            .unwrap();
        n
    }

    #[tokio::test]
    async fn index_one_inserts_into_notes_and_tantivy() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("a.md");
        tokio::fs::write(
            &path,
            "---\ntitle: Hello\ntags: [foo, bar]\n---\n# Hello\nBody\n",
        )
        .await
        .unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        // SQLite side
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 1);
        let (title,): (String,) = sqlx::query_as("SELECT title FROM notes WHERE id = ?1")
            .bind("a.md")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(title, "Hello");
        // Tags
        let (tag_count,): (i64,) =
            sqlx::query_as("SELECT count(*) FROM note_tags WHERE note_id = ?1")
                .bind("a.md")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(tag_count, 2);
        // Tantivy side
        let search = indexer.inner.search.lock().await;
        assert_eq!(search.num_docs().unwrap(), 1);
    }

    #[tokio::test]
    async fn modify_replaces_rather_than_duplicates() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("note.md");
        tokio::fs::write(&path, "# v1\nbody one\n").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        tokio::fs::write(&path, "# v2\nbody two\n").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Modified,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 1);
        let (title,): (String,) = sqlx::query_as("SELECT title FROM notes WHERE id = ?1")
            .bind("note.md")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(title, "v2");
        let search = indexer.inner.search.lock().await;
        assert_eq!(search.num_docs().unwrap(), 1);
    }

    #[tokio::test]
    async fn removed_deletes_from_both_stores() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("doomed.md");
        tokio::fs::write(&path, "# Goodbye\n").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        // File must be gone for the Removed branch to take the delete path.
        tokio::fs::remove_file(&path).await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Removed,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 0);
        let search = indexer.inner.search.lock().await;
        assert_eq!(search.num_docs().unwrap(), 0);
    }

    #[tokio::test]
    async fn paths_under_lattice_dir_are_ignored() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join(".lattice/should-not-index.md");
        tokio::fs::create_dir_all(path.parent().unwrap())
            .await
            .unwrap();
        tokio::fs::write(&path, "# Hidden\n").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 0);
    }

    #[tokio::test]
    async fn non_markdown_files_are_ignored() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("readme.txt");
        tokio::fs::write(&path, "not markdown").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 0);
    }

    #[tokio::test]
    async fn wiki_links_populate_links_table() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("source.md");
        tokio::fs::write(
            &path,
            "# Source\nSee [[Target]] and [[Target|alias]] and [internal](other.md).\n",
        )
        .await
        .unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        let rows: Vec<(String, String, String)> =
            sqlx::query_as("SELECT src, dst, kind FROM links WHERE src = ?1 ORDER BY kind, dst")
                .bind("source.md")
                .fetch_all(&pool)
                .await
                .unwrap();
        // Two wiki-links to "Target" dedupe to one row; plus the
        // internal markdown link.
        assert_eq!(rows.len(), 2);
        assert!(rows
            .iter()
            .any(|(_, dst, kind)| dst == "Target" && kind == "wiki_link"));
        assert!(rows
            .iter()
            .any(|(_, dst, kind)| dst == "other.md" && kind == "markdown"));
    }

    #[tokio::test]
    async fn external_links_are_not_tracked() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("ext.md");
        tokio::fs::write(
            &path,
            "# Ext\nSee [Google](https://google.com) and [mailto](mailto:x@y.z).\n",
        )
        .await
        .unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Created,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM links WHERE src = ?1")
            .bind("ext.md")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 0);
    }

    #[tokio::test]
    async fn seed_from_disk_walks_vault() {
        let (tmp, indexer) = setup().await;
        tokio::fs::write(tmp.path().join("a.md"), "# A\n")
            .await
            .unwrap();
        tokio::fs::create_dir_all(tmp.path().join("nested"))
            .await
            .unwrap();
        tokio::fs::write(tmp.path().join("nested/b.md"), "# B\n")
            .await
            .unwrap();
        // Under .lattice — must be skipped.
        tokio::fs::write(tmp.path().join(".lattice/skip.md"), "# skip\n")
            .await
            .unwrap();

        let count = indexer.seed_from_disk().await.unwrap();
        assert_eq!(count, 2);
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 2);
        let search = indexer.inner.search.lock().await;
        assert_eq!(search.num_docs().unwrap(), 2);
    }

    #[tokio::test]
    async fn tags_are_extracted_from_array_or_string() {
        let (tmp, indexer) = setup().await;
        let array_path = tmp.path().join("array.md");
        tokio::fs::write(&array_path, "---\ntags: [alpha, beta]\n---\n# x\n")
            .await
            .unwrap();
        let string_path = tmp.path().join("string.md");
        tokio::fs::write(&string_path, "---\ntags: gamma, delta\n---\n# y\n")
            .await
            .unwrap();
        for p in [&array_path, &string_path] {
            indexer
                .apply_event(&IndexEvent {
                    kind: IndexEventKind::Created,
                    path: p.to_string_lossy().to_string(),
                    timestamp: Utc::now(),
                })
                .await
                .unwrap();
        }
        let pool = indexer.inner.pool.clone();
        let names: Vec<(String,)> = sqlx::query_as("SELECT name FROM tags ORDER BY name")
            .fetch_all(&pool)
            .await
            .unwrap();
        let names: Vec<_> = names.into_iter().map(|(s,)| s).collect();
        assert_eq!(names, vec!["alpha", "beta", "delta", "gamma"]);
    }

    #[tokio::test]
    async fn other_event_kind_is_noop() {
        let (tmp, indexer) = setup().await;
        let path = tmp.path().join("x.md");
        tokio::fs::write(&path, "# X\n").await.unwrap();
        indexer
            .apply_event(&IndexEvent {
                kind: IndexEventKind::Other,
                path: path.to_string_lossy().to_string(),
                timestamp: Utc::now(),
            })
            .await
            .unwrap();
        let pool = indexer.inner.pool.clone();
        assert_eq!(count_notes(&pool).await, 0);
    }

    // Sanity: the in-memory pool helpers still work even after the
    // module sprouted (no missed migration ordering).
    #[tokio::test]
    async fn in_memory_pool_has_tags_table() {
        let pool = db::init_in_memory().await.unwrap();
        let (n,): (i64,) = sqlx::query_as("SELECT count(*) FROM sqlite_master WHERE name = 'tags'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(n, 1);
    }
}
