//! Vault note read / write / list (v0.2 PR #3.5).
//!
//! The desktop shell + future v0.4 AI panel + v0.5 sync layer all need to load
//! and save the Markdown files inside an open [`Vault`]. This module wraps:
//!
//!   - **Listing** — walk the vault directory tree, skip `.lattice/`, dot-dirs,
//!     and `.git/`, return one [`NoteSummary`] per `.md` file with a title
//!     derived from frontmatter > first ATX heading > file stem.
//!   - **Reading** — load the file, parse it with [`crate::markdown::parse`],
//!     return both the raw text (so the renderer can show a "this file is
//!     unparseable" fallback) and the [`NoteDoc`] AST.
//!   - **Writing** — serialize the [`NoteDoc`] back via
//!     [`crate::markdown::serialize`] and atomically replace the file on disk
//!     (write to `<file>.md.tmp`, `rename` over the original).
//!   - **Creating** — slug the requested title, find the first non-colliding
//!     `<slug>.md` at the vault root, write a minimal `# Title\n` document.
//!
//! ## Identity
//!
//! For v0.2 a note's stable identity *is* its vault-relative POSIX path. The
//! v0.1 SQLite schema requires a `TEXT PRIMARY KEY` on `notes.id` but the
//! v0.1 file watcher doesn't populate that table — the `notes` table only
//! gets rows once v0.3 PR #2 ("live re-indexing on save") wires the watcher
//! into a writer. Until then the renderer uses paths as React keys and as
//! IPC-level ids; v0.5 (CRDT sync) introduces persistent UUIDs in
//! frontmatter without breaking this contract.
//!
//! ## Round-trip
//!
//! `read → write` of an unmodified `NoteDoc` produces a byte-identical file
//! per the v0.2 PR #1 markdown round-trip corpus, because we never touch the
//! AST and the serializer is the canonical-form emitter (D4 in
//! [`crate::markdown`]). This is gated by
//! [`tests/notes_io.rs`](../../tests/notes_io.rs).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{LatticeError, LatticeResult};
use crate::markdown::{self, Block, Inline, NoteDoc};
use crate::vault::{Vault, LATTICE_DIR};

/// Summary of a note suitable for the picker rail in the desktop shell.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct NoteSummary {
    /// Stable id — vault-relative POSIX path (e.g. `Engineering/Notes.md`).
    /// Same value as [`NoteSummary::path`]; both are exposed so the IPC
    /// shape can grow a separate UUID field in v0.5 without renaming.
    pub id: String,
    /// Vault-relative POSIX path.
    pub path: String,
    /// Human-readable title (frontmatter `title` > first ATX heading > stem).
    pub title: String,
    /// Last-modified time as Unix milliseconds. Falls back to `0` if the
    /// platform doesn't expose mtime (rare; mostly for portability).
    #[ts(type = "number")]
    pub modified_ms: i64,
    /// File size in bytes. Surfaced for the picker rail's secondary line.
    #[ts(type = "number")]
    pub size_bytes: i64,
}

/// Full content of a note: parsed [`NoteDoc`] plus the raw bytes the editor
/// last saw, so the renderer can flag "this file no longer round-trips" if
/// the user pastes pathological Markdown.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct NoteContent {
    /// Summary metadata (same shape as in `list`).
    pub summary: NoteSummary,
    /// Raw on-disk Markdown.
    pub raw: String,
    /// Parsed AST for the editor.
    pub doc: NoteDoc,
}

/// List every `.md` file in the vault, depth-first, skipping `.lattice/`,
/// `.git/`, and any dot-prefixed directory.
pub async fn list(vault: &Vault) -> LatticeResult<Vec<NoteSummary>> {
    let mut out = Vec::new();
    walk(vault.root(), vault.root(), &mut out).await?;
    // Newest first — matches the picker-rail UX everyone expects.
    out.sort_by_key(|s| std::cmp::Reverse(s.modified_ms));
    Ok(out)
}

/// Read a single note. `rel_path` is the vault-relative POSIX path returned
/// by [`list`]; backslashes are tolerated so a Windows shell can pass paths
/// through without sanitising.
pub async fn read(vault: &Vault, rel_path: &str) -> LatticeResult<NoteContent> {
    let abs = resolve_inside_vault(vault, rel_path)?;
    let raw = tokio::fs::read_to_string(&abs)
        .await
        .map_err(|err| classify_io_error(rel_path, err))?;
    let doc = markdown::parse(&raw)?;
    let summary = summary_for(vault, &abs, &raw, &doc).await?;
    Ok(NoteContent { summary, raw, doc })
}

/// Serialise a [`NoteDoc`] and atomically replace the file at `rel_path`.
/// Creates parent directories on demand. Returns the post-write summary.
pub async fn write(vault: &Vault, rel_path: &str, doc: &NoteDoc) -> LatticeResult<NoteSummary> {
    let abs = resolve_inside_vault(vault, rel_path)?;
    if let Some(parent) = abs.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let serialized = markdown::serialize(doc);
    atomic_write(&abs, serialized.as_bytes()).await?;
    summary_for(vault, &abs, &serialized, doc).await
}

/// Create a new blank note titled `title`, picking the first non-colliding
/// path under the vault root. The file is written with a minimal `# Title`
/// body so the editor has something to show on first open.
pub async fn create_blank(vault: &Vault, title: &str) -> LatticeResult<NoteSummary> {
    let trimmed = title.trim();
    let display_title = if trimmed.is_empty() {
        "Untitled"
    } else {
        trimmed
    };
    let slug = slugify(display_title);
    let stem = if slug.is_empty() { "untitled" } else { &slug };

    let mut candidate = format!("{stem}.md");
    let mut suffix = 2u32;
    while tokio::fs::try_exists(vault.root().join(&candidate)).await? {
        candidate = format!("{stem}-{suffix}.md");
        suffix = suffix.saturating_add(1);
        // Defensive: don't loop forever if a vault somehow has thousands of
        // identical names. After 10 000 collisions we surface NotFound (the
        // closest typed error) so callers can show a clear message.
        if suffix > 10_000 {
            return Err(LatticeError::NotFound {
                id: format!("{stem}-*"),
            });
        }
    }

    let doc = blank_note_doc(display_title);
    write(vault, &candidate, &doc).await
}

// -----------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------

fn blank_note_doc(title: &str) -> NoteDoc {
    NoteDoc {
        frontmatter: Default::default(),
        body: vec![
            Block::Heading {
                level: 1,
                content: vec![Inline::Text {
                    value: title.to_string(),
                }],
            },
            Block::Paragraph { content: vec![] },
        ],
    }
}

/// Convert an arbitrary title into a filesystem-friendly stem. Keeps ASCII
/// alphanumerics, lowercases, replaces whitespace + punctuation with `-`,
/// collapses runs of `-`, trims leading/trailing `-`. Empty string ⇒ `""`.
fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = false;
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn classify_io_error(rel_path: &str, err: std::io::Error) -> LatticeError {
    match err.kind() {
        std::io::ErrorKind::NotFound => LatticeError::NotFound {
            id: rel_path.to_string(),
        },
        _ => LatticeError::Io {
            message: err.to_string(),
        },
    }
}

/// Resolve a vault-relative path to an absolute one and refuse to escape the
/// vault root (no `..` traversal, no absolute paths).
fn resolve_inside_vault(vault: &Vault, rel_path: &str) -> LatticeResult<PathBuf> {
    let normalised = rel_path.replace('\\', "/");
    if normalised.starts_with('/') {
        return Err(LatticeError::InvalidPath {
            path: rel_path.to_string(),
            reason: "must be vault-relative, got absolute path".into(),
        });
    }
    let mut joined = vault.root().to_path_buf();
    for segment in normalised.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                return Err(LatticeError::InvalidPath {
                    path: rel_path.to_string(),
                    reason: "parent-directory traversal is not allowed".into(),
                });
            }
            other => joined.push(other),
        }
    }
    Ok(joined)
}

/// Atomic file replace via `tmp + rename`.
async fn atomic_write(abs: &Path, bytes: &[u8]) -> LatticeResult<()> {
    let tmp = match abs.file_name() {
        Some(name) => abs.with_file_name(format!("{}.tmp", name.to_string_lossy())),
        None => abs.with_extension("tmp"),
    };
    tokio::fs::write(&tmp, bytes).await?;
    tokio::fs::rename(&tmp, abs).await?;
    Ok(())
}

/// Recurse into `dir` (depth-first), skipping the `.lattice/` private dir,
/// `.git/`, and any other dot-prefixed directory; collect every `.md` file.
async fn walk(root: &Path, dir: &Path, out: &mut Vec<NoteSummary>) -> LatticeResult<()> {
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        let mut reader = match tokio::fs::read_dir(&current).await {
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
            let raw = match tokio::fs::read_to_string(&path).await {
                Ok(text) => text,
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => continue,
                // For listing we tolerate parse errors — non-UTF-8 files just
                // get a stem-derived title and an empty body for the picker.
                Err(_) => String::new(),
            };
            let doc = markdown::parse(&raw).unwrap_or_else(|_| NoteDoc {
                frontmatter: Default::default(),
                body: Vec::new(),
            });
            let summary = summary_for_with_meta(root, &path, &raw, &doc, &metadata)?;
            out.push(summary);
        }
    }
    Ok(())
}

async fn summary_for(
    vault: &Vault,
    abs: &Path,
    raw: &str,
    doc: &NoteDoc,
) -> LatticeResult<NoteSummary> {
    let metadata = tokio::fs::metadata(abs).await?;
    summary_for_with_meta(vault.root(), abs, raw, doc, &metadata)
}

fn summary_for_with_meta(
    root: &Path,
    abs: &Path,
    raw: &str,
    doc: &NoteDoc,
    metadata: &std::fs::Metadata,
) -> LatticeResult<NoteSummary> {
    let rel = relative_to(root, abs)?;
    let title = extract_title(doc, &rel);
    let modified_ms = mtime_ms(metadata);
    let size_bytes = i64::try_from(raw.len()).unwrap_or(i64::MAX);
    Ok(NoteSummary {
        id: rel.clone(),
        path: rel,
        title,
        modified_ms,
        size_bytes,
    })
}

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

fn extract_title(doc: &NoteDoc, rel_path: &str) -> String {
    if let Some(t) = frontmatter_title(doc) {
        return t;
    }
    if let Some(t) = first_heading_text(doc) {
        return t;
    }
    file_stem(rel_path)
}

fn frontmatter_title(doc: &NoteDoc) -> Option<String> {
    for entry in &doc.frontmatter.entries {
        if entry.key == "title" {
            if let Some(s) = entry.value.as_str() {
                let trimmed = s.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    None
}

fn first_heading_text(doc: &NoteDoc) -> Option<String> {
    for block in &doc.body {
        if let Block::Heading { content, .. } = block {
            let mut buf = String::new();
            collect_inline_text(content, &mut buf);
            let trimmed = buf.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn collect_inline_text(items: &[Inline], out: &mut String) {
    for item in items {
        match item {
            Inline::Text { value } => out.push_str(value),
            Inline::Code { value } => out.push_str(value),
            Inline::Strong { content }
            | Inline::Emphasis { content }
            | Inline::Strikethrough { content } => collect_inline_text(content, out),
            Inline::Link { content, .. } => collect_inline_text(content, out),
            _ => {}
        }
    }
}

fn file_stem(rel_path: &str) -> String {
    let last = rel_path.rsplit('/').next().unwrap_or(rel_path);
    let stem = last.strip_suffix(".md").unwrap_or(last);
    if stem.is_empty() {
        "Untitled".to_string()
    } else {
        stem.to_string()
    }
}

fn mtime_ms(metadata: &std::fs::Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Vault;

    #[tokio::test]
    async fn list_walks_and_skips_lattice_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        tokio::fs::write(tmp.path().join("a.md"), "# A\n")
            .await
            .unwrap();
        tokio::fs::create_dir_all(tmp.path().join("nested"))
            .await
            .unwrap();
        tokio::fs::write(tmp.path().join("nested/b.md"), "# B\n")
            .await
            .unwrap();
        // Anything under .lattice/ must NOT appear in the listing.
        tokio::fs::write(tmp.path().join(".lattice/should-not-show.md"), "x")
            .await
            .unwrap();

        let mut summaries = list(&vault).await.unwrap();
        summaries.sort_by(|a, b| a.path.cmp(&b.path));
        let paths: Vec<_> = summaries.iter().map(|s| s.path.as_str()).collect();
        assert_eq!(paths, vec!["a.md", "nested/b.md"]);
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn read_then_write_round_trips_byte_identical() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        let original = "# Hello\n\nWorld.\n";
        tokio::fs::write(tmp.path().join("note.md"), original)
            .await
            .unwrap();

        let content = read(&vault, "note.md").await.unwrap();
        write(&vault, "note.md", &content.doc).await.unwrap();
        let after = tokio::fs::read_to_string(tmp.path().join("note.md"))
            .await
            .unwrap();

        assert_eq!(after, original, "write must be byte-identical to source");
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn create_blank_writes_minimal_doc_and_resolves_collision() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();

        let one = create_blank(&vault, "My Note").await.unwrap();
        assert_eq!(one.path, "my-note.md");
        let two = create_blank(&vault, "My Note").await.unwrap();
        assert_eq!(two.path, "my-note-2.md");
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn read_rejects_parent_traversal() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        let err = read(&vault, "../etc/passwd").await.unwrap_err();
        assert!(matches!(err, LatticeError::InvalidPath { .. }));
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn read_rejects_absolute_path() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        let err = read(&vault, "/absolute/path.md").await.unwrap_err();
        assert!(matches!(err, LatticeError::InvalidPath { .. }));
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn read_missing_returns_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        let err = read(&vault, "nope.md").await.unwrap_err();
        assert!(matches!(err, LatticeError::NotFound { .. }));
        vault.close().await.unwrap();
    }

    #[tokio::test]
    async fn list_orders_newest_first() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::open(tmp.path()).await.unwrap();
        tokio::fs::write(tmp.path().join("old.md"), "# old")
            .await
            .unwrap();
        // Make sure the second file's mtime strictly exceeds the first's.
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        tokio::fs::write(tmp.path().join("new.md"), "# new")
            .await
            .unwrap();
        let summaries = list(&vault).await.unwrap();
        assert_eq!(summaries[0].path, "new.md");
        assert_eq!(summaries[1].path, "old.md");
        vault.close().await.unwrap();
    }

    #[test]
    fn slugify_strips_unsafe_chars() {
        assert_eq!(slugify("Hello, World!"), "hello-world");
        assert_eq!(slugify("  spaced  out  "), "spaced-out");
        assert_eq!(slugify("emoji 🚀 ok"), "emoji-ok");
        assert_eq!(slugify(""), "");
    }
}
