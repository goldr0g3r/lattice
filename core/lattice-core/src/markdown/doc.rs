//! `NoteDoc` AST + every inline and block variant.
//!
//! All types here derive `serde::{Serialize, Deserialize}` (for IPC + on-disk
//! diagnostics via `dump_ast`) and `ts_rs::TS` (for the editor-side mirror in
//! `packages/editor/`). The TS bindings are codegen'd into
//! `packages/core-bindings/src/generated/` when `cargo test` runs.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

const TS_EXPORT_DIR: &str = "../../../packages/core-bindings/src/generated/";

/// Top-level parsed Markdown note.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct NoteDoc {
    /// YAML frontmatter; key order preserved from the source file.
    pub frontmatter: Frontmatter,
    /// Document body, in source order.
    pub body: Vec<Block>,
}

/// Ordered frontmatter map (D3).
///
/// We use an explicit `Vec` of entries rather than `IndexMap` so insertion order
/// is part of the public type contract — round-trip fixtures rely on it, and
/// the TS-side mirror gets a deterministic shape too.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Default, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Frontmatter {
    /// Ordered list of `(key, value)` pairs from the YAML head.
    pub entries: Vec<FrontmatterEntry>,
}

impl Frontmatter {
    /// True when no `---\n...---\n` block was present in the source.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// One key/value pair from the frontmatter, in source order.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct FrontmatterEntry {
    /// YAML key (left of the `:`).
    pub key: String,
    /// YAML value coerced to JSON. Nested maps become objects; sequences become arrays.
    #[ts(type = "unknown")]
    pub value: serde_json::Value,
}

/// A block-level element.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Block {
    /// ATX heading `# … ######`. Setext headings are normalised to ATX (D4).
    Heading {
        /// 1-6 (`#` through `######`).
        level: u8,
        /// Inline content of the heading.
        content: Vec<Inline>,
    },
    /// Paragraph of inline content.
    Paragraph {
        /// Inline content of the paragraph.
        content: Vec<Inline>,
    },
    /// `- ` unordered list. Items may contain nested blocks.
    BulletList {
        /// List items in source order.
        items: Vec<ListItem>,
    },
    /// `1. 2.` ordered list. `start` is the number on the first item.
    OrderedList {
        /// Starting ordinal.
        start: u32,
        /// List items in source order.
        items: Vec<ListItem>,
    },
    /// `> ` blockquote (non-callout).
    Blockquote {
        /// Block content of the quote.
        content: Vec<Block>,
    },
    /// GitHub `> [!info|tip|note|warning|caution]` callout (D6).
    Callout {
        /// Which callout kind was declared.
        kind: CalloutKind,
        /// Body of the callout (block content).
        body: Vec<Block>,
    },
    /// Fenced block of any flavour (D8): ` ```rust `, ` ```mermaid `, etc.
    ///
    /// The info-string is preserved verbatim; type-specific rendering is the
    /// editor's job at a higher layer.
    Fenced {
        /// Info-string after the opening fence (empty for plain code blocks).
        info: String,
        /// Body of the fence, newline-terminated.
        body: String,
    },
    /// Block math `$$ … $$` (D7).
    Math {
        /// LaTeX source.
        src: String,
    },
    /// GFM table.
    Table {
        /// Header row.
        header: Row,
        /// Data rows.
        rows: Vec<Row>,
        /// Column alignment, one per column.
        alignments: Vec<Alignment>,
    },
    /// `---` / `***` thematic break.
    ThematicBreak,
    /// Raw HTML block.
    HtmlBlock {
        /// Verbatim HTML.
        html: String,
    },
    /// `[^id]: …` GFM footnote definition.
    FootnoteDefinition {
        /// Footnote label (without `^`).
        id: String,
        /// Block content of the definition.
        content: Vec<Block>,
    },
}

/// An inline element.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum Inline {
    /// Plain text.
    Text {
        /// Literal text content.
        value: String,
    },
    /// `*em*` / `_em_`.
    Emphasis {
        /// Inline content inside the emphasis.
        content: Vec<Inline>,
    },
    /// `**strong**`.
    Strong {
        /// Inline content inside the strong.
        content: Vec<Inline>,
    },
    /// GFM `~~strikethrough~~`.
    Strikethrough {
        /// Inline content inside the strikethrough.
        content: Vec<Inline>,
    },
    /// `` `code` ``.
    Code {
        /// Code span body.
        value: String,
    },
    /// `[text](url "title")`.
    Link {
        /// Target URL.
        url: String,
        /// Optional title attribute.
        title: Option<String>,
        /// Inline content of the link text.
        content: Vec<Inline>,
    },
    /// `![alt](url "title")`.
    Image {
        /// Image source URL.
        url: String,
        /// Alt-text.
        alt: String,
        /// Optional title attribute.
        title: Option<String>,
    },
    /// `[[Target]]` or `[[Target|Alias]]` (D5).
    WikiLink {
        /// Linked note title or slug.
        target: String,
        /// Optional display alias.
        alias: Option<String>,
    },
    /// Inline math `$x$` or block math when used standalone (D7).
    Math {
        /// True for `$$...$$` (display); false for `$...$` (inline).
        display: bool,
        /// LaTeX source.
        src: String,
    },
    /// `[^id]` GFM footnote reference.
    FootnoteRef {
        /// Footnote label (without `^`).
        id: String,
    },
    /// Soft (`\n`) or hard (`  \n` / `\\\n`) line break.
    LineBreak {
        /// True for hard breaks.
        hard: bool,
    },
    /// Raw inline HTML.
    HtmlInline {
        /// Verbatim HTML snippet.
        html: String,
    },
}

/// One row of a GFM table.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct Row {
    /// Cells in left-to-right order; each cell is inline content.
    pub cells: Vec<Vec<Inline>>,
}

/// One list item, with optional task-list checkbox state.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
pub struct ListItem {
    /// `Some(true)` for `[x]`, `Some(false)` for `[ ]`, `None` for non-task items.
    pub checked: Option<bool>,
    /// Block content of the item.
    pub content: Vec<Block>,
}

/// GitHub-style callout kinds (D6).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(rename_all = "lowercase")]
pub enum CalloutKind {
    /// `> [!note]`.
    Note,
    /// `> [!tip]`.
    Tip,
    /// `> [!info]`.
    Info,
    /// `> [!warning]`.
    Warning,
    /// `> [!caution]`.
    Caution,
}

impl CalloutKind {
    /// Parse the marker inside a `[!…]`; returns `None` on unknown kinds so
    /// the parser can fall back to plain blockquote.
    #[must_use]
    pub fn from_marker(marker: &str) -> Option<Self> {
        match marker.to_ascii_lowercase().as_str() {
            "note" => Some(Self::Note),
            "tip" => Some(Self::Tip),
            "info" => Some(Self::Info),
            "warning" => Some(Self::Warning),
            "caution" => Some(Self::Caution),
            _ => None,
        }
    }

    /// Lowercase marker as it appears in `[!marker]`.
    #[must_use]
    pub const fn marker(self) -> &'static str {
        match self {
            Self::Note => "note",
            Self::Tip => "tip",
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Caution => "caution",
        }
    }
}

/// GFM column alignment.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../../packages/core-bindings/src/generated/")]
#[serde(rename_all = "snake_case")]
pub enum Alignment {
    /// `---` (default).
    None,
    /// `:---`.
    Left,
    /// `:---:`.
    Center,
    /// `---:`.
    Right,
}

const _: () = {
    // Sanity: the canonical export dir is exactly what every `#[ts(export_to)]`
    // attribute on the types above also says. Kept here so anyone changing one
    // copy notices.
    assert!(!TS_EXPORT_DIR.is_empty());
};
