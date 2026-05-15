//! The shape that flows into the index.
//!
//! Callers — the v0.3 PR C indexer in `lattice-core` and the bench harness
//! in this crate — produce one [`IndexDoc`] per note and hand it to
//! [`crate::Index::add_document`]. The struct is `serde`-friendly so the
//! Tauri layer can ship it across IPC without a separate wire type if it
//! ever needs to.

use serde::{Deserialize, Serialize};

/// One Lattice note in the shape Tantivy expects.
///
/// Construct one per note; the index machinery handles the field
/// translation. Strings are owned (`String` not `&str`) so the indexer
/// can build them lazily from the parsed Markdown AST.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct IndexDoc {
    /// Stable note identifier (vault-relative POSIX path until v0.5 introduces
    /// UUIDs in frontmatter).
    pub id: String,
    /// Vault-relative POSIX path of the source `.md` file.
    pub path: String,
    /// Human-readable title — first frontmatter `title`, first ATX heading,
    /// else the file stem (the same priority the v0.2 PR #3.5 note picker
    /// uses).
    pub title: String,
    /// Body text fed to the English-stem tokenizer. This is the plain-text
    /// projection of the parsed Markdown — wiki-link aliases, callout
    /// content, list items, code blocks all flattened with spaces.
    pub body: String,
    /// Tags — frontmatter `tags` plus inline `#tag` extractions. Stored as
    /// a `Vec<String>` so the same note can carry many.
    pub tags: Vec<String>,
}

impl IndexDoc {
    /// Construct an [`IndexDoc`] with empty body and no tags — handy for tests
    /// that only care about the title path.
    #[must_use]
    pub fn new_minimal(
        id: impl Into<String>,
        path: impl Into<String>,
        title: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            path: path.into(),
            title: title.into(),
            body: String::new(),
            tags: Vec::new(),
        }
    }
}
