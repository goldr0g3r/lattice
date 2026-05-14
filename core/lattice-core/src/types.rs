//! Core data types exposed across the IPC boundary.
//!
//! Every type here derives `ts_rs::TS` and is exported into
//! `packages/core-bindings/src/generated/` when `cargo test` runs.
//! The frontend imports those generated `.ts` files so the IPC surface
//! is statically typed end-to-end.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// ts-rs 10 resolves `export_to` relative to `CARGO_MANIFEST_DIR/bindings/`
// (override with the `TS_RS_EXPORT_DIR` env var). From `core/lattice-core/`,
// three `..` segments climb to the workspace root, then we land in
// `packages/core-bindings/src/generated/`.

/// A markdown note as the core sees it.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Note {
    /// Stable identifier (UUID v4, persisted in the note's frontmatter).
    pub id: String,
    /// Vault-relative path of the source `.md` file.
    pub path: String,
    /// First-non-empty-line heuristic title (or frontmatter `title`).
    pub title: Option<String>,
    /// Parsed YAML frontmatter, as opaque JSON.
    #[ts(type = "Record<string, unknown> | null")]
    pub frontmatter: Option<serde_json::Value>,
    /// SHA-256 of the body bytes — used to detect external edits.
    pub body_hash: Option<String>,
    /// Creation timestamp (RFC 3339).
    pub created: DateTime<Utc>,
    /// Last-modified timestamp (RFC 3339).
    pub updated: DateTime<Utc>,
}

/// A tag — either declared in frontmatter or inferred from `#tag` syntax.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Tag {
    /// Auto-increment surrogate key.
    pub id: i64,
    /// Normalised tag name (lower-case, no leading `#`).
    pub name: String,
}

/// Why one note references another.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    /// `[[Wiki link]]`.
    WikiLink,
    /// Standard `[text](url)` markdown link.
    Markdown,
    /// Embedded asset (`![[image.png]]`).
    Embed,
}

/// A directed reference from one note to another.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Link {
    /// Source note id.
    pub src: String,
    /// Destination note id, or the literal target slug if unresolved.
    pub dst: String,
    /// How the link was authored.
    pub kind: LinkKind,
}

/// A binary asset attached to a note.
#[derive(Serialize, Deserialize, Debug, Clone, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Attachment {
    /// Stable identifier (UUID v4).
    pub id: String,
    /// Owning note id.
    pub note_id: String,
    /// Vault-relative path under `.lattice/attachments/`.
    pub path: String,
    /// MIME type (e.g. `image/png`), best-effort.
    pub mime: Option<String>,
}
