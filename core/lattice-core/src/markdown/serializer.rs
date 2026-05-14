//! [`NoteDoc`] -> Markdown string.
//!
//! Hand-rolled, single-pass emitter. No third-party formatter (we tried
//! `pulldown-cmark-to-cmark` and `remark-stringify`; neither lets us control
//! whitespace precisely enough for byte-identical round-trip).
//!
//! ## Canonical-form rules
//!
//! - Headings use ATX form (`# ` … `###### `); setext never emitted.
//! - Lists use `- ` for bullets and `1. `, `2. `, … for ordered. Nested lists
//!   indent by two spaces.
//! - Blockquotes prefix each line with `> ` (or `>` for empty lines).
//! - Fenced blocks use ` ``` ` with the info-string verbatim.
//! - Blocks are separated by a single blank line.
//! - The output always ends with exactly one trailing newline.

use std::fmt::Write as _;

use crate::markdown::doc::{
    Alignment, Block, Frontmatter, FrontmatterEntry, Inline, ListItem, NoteDoc, Row,
};

/// Serialize a [`NoteDoc`] to canonical Markdown.
#[must_use]
pub fn serialize(doc: &NoteDoc) -> String {
    let mut out = String::new();
    write_frontmatter(&mut out, &doc.frontmatter);
    if !doc.frontmatter.is_empty() && !doc.body.is_empty() {
        // Canonical separator between frontmatter and body.
        out.push('\n');
    }
    write_blocks(&mut out, &doc.body, "");
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}

fn write_frontmatter(out: &mut String, fm: &Frontmatter) {
    if fm.is_empty() {
        return;
    }
    out.push_str("---\n");
    for FrontmatterEntry { key, value } in &fm.entries {
        write_frontmatter_entry(out, key, value);
    }
    out.push_str("---\n");
}

fn write_frontmatter_entry(out: &mut String, key: &str, value: &serde_json::Value) {
    let _ = write!(out, "{key}: ");
    write_yaml_inline(out, value);
    out.push('\n');
}

/// Emit a YAML value on a single line where possible (flow style for nested
/// sequences/maps). Round-trip corpus avoids deeply-nested frontmatter so this
/// is sufficient.
fn write_yaml_inline(out: &mut String, value: &serde_json::Value) {
    match value {
        serde_json::Value::Null => out.push_str("null"),
        serde_json::Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        serde_json::Value::Number(n) => {
            let _ = write!(out, "{n}");
        }
        serde_json::Value::String(s) => write_yaml_string(out, s),
        serde_json::Value::Array(arr) => {
            out.push('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                write_yaml_inline(out, item);
            }
            out.push(']');
        }
        serde_json::Value::Object(map) => {
            out.push('{');
            for (i, (k, v)) in map.iter().enumerate() {
                if i > 0 {
                    out.push_str(", ");
                }
                let _ = write!(out, "{k}: ");
                write_yaml_inline(out, v);
            }
            out.push('}');
        }
    }
}

fn write_yaml_string(out: &mut String, s: &str) {
    let needs_quotes = s.is_empty()
        || s.contains([
            ':', '#', '\n', '[', ']', '{', '}', ',', '&', '*', '!', '|', '>', '\'', '"', '%', '@',
            '`',
        ])
        || s.starts_with(' ')
        || s.ends_with(' ')
        || matches!(s, "true" | "false" | "null" | "yes" | "no" | "on" | "off")
        || s.parse::<f64>().is_ok();
    if needs_quotes {
        let _ = write!(out, "\"");
        for c in s.chars() {
            match c {
                '"' => out.push_str("\\\""),
                '\\' => out.push_str("\\\\"),
                '\n' => out.push_str("\\n"),
                other => out.push(other),
            }
        }
        let _ = write!(out, "\"");
    } else {
        out.push_str(s);
    }
}

fn write_blocks(out: &mut String, blocks: &[Block], prefix: &str) {
    for (i, block) in blocks.iter().enumerate() {
        if i > 0 {
            // Single blank line between blocks. The blank line picks up the
            // prefix when we're inside a blockquote/callout.
            let trimmed_prefix = prefix.trim_end();
            out.push_str(trimmed_prefix);
            out.push('\n');
        }
        write_block(out, block, prefix);
    }
}

fn write_block(out: &mut String, block: &Block, prefix: &str) {
    match block {
        Block::Heading { level, content } => {
            out.push_str(prefix);
            for _ in 0..*level {
                out.push('#');
            }
            out.push(' ');
            write_inlines(out, content);
            out.push('\n');
        }
        Block::Paragraph { content } => {
            out.push_str(prefix);
            write_inlines_prefixed(out, content, prefix);
            out.push('\n');
        }
        Block::BulletList { items } => write_list(out, items, prefix, None),
        Block::OrderedList { start, items } => write_list(out, items, prefix, Some(*start)),
        Block::Blockquote { content } => {
            let inner_prefix = format!("{prefix}> ");
            write_blocks(out, content, &inner_prefix);
        }
        Block::Callout { kind, body } => {
            let _ = writeln!(out, "{prefix}> [!{}]", kind.marker());
            let inner_prefix = format!("{prefix}> ");
            write_blocks(out, body, &inner_prefix);
        }
        Block::Fenced { info, body } => {
            let _ = writeln!(out, "{prefix}```{info}");
            for line in body.lines() {
                let _ = writeln!(out, "{prefix}{line}");
            }
            let _ = writeln!(out, "{prefix}```");
        }
        Block::Math { src } => {
            let _ = writeln!(out, "{prefix}$$");
            for line in src.lines() {
                let _ = writeln!(out, "{prefix}{line}");
            }
            let _ = writeln!(out, "{prefix}$$");
        }
        Block::Table {
            header,
            rows,
            alignments,
        } => write_table(out, header, rows, alignments, prefix),
        Block::ThematicBreak => {
            let _ = writeln!(out, "{prefix}---");
        }
        Block::HtmlBlock { html } => {
            for line in html.lines() {
                let _ = writeln!(out, "{prefix}{line}");
            }
        }
        Block::FootnoteDefinition { id, content } => {
            let _ = write!(out, "{prefix}[^{id}]:");
            // Footnote bodies render as their block content indented; the first
            // paragraph follows on the same line after the colon for canonical form.
            if let Some((first, rest)) = content.split_first() {
                match first {
                    Block::Paragraph { content: inl } => {
                        out.push(' ');
                        write_inlines(out, inl);
                        out.push('\n');
                    }
                    other => {
                        out.push('\n');
                        write_block(out, other, &format!("{prefix}    "));
                    }
                }
                for b in rest {
                    out.push_str(prefix.trim_end());
                    out.push('\n');
                    write_block(out, b, &format!("{prefix}    "));
                }
            } else {
                out.push('\n');
            }
        }
    }
}

fn write_list(out: &mut String, items: &[ListItem], prefix: &str, ordered_start: Option<u32>) {
    for (i, item) in items.iter().enumerate() {
        let marker = match ordered_start {
            Some(start) => format!("{}. ", start + i as u32),
            None => "- ".to_string(),
        };
        let continuation_prefix = format!("{}{}", prefix, " ".repeat(marker.len()));
        out.push_str(prefix);
        out.push_str(&marker);
        if let Some(checked) = item.checked {
            out.push_str(if checked { "[x] " } else { "[ ] " });
        }
        // First block: inline-after-marker; subsequent blocks: prefix-indented.
        if let Some((first, rest)) = item.content.split_first() {
            match first {
                Block::Paragraph { content } => {
                    write_inlines_prefixed(out, content, &continuation_prefix);
                    out.push('\n');
                }
                other => {
                    out.push('\n');
                    write_block(out, other, &continuation_prefix);
                }
            }
            for b in rest {
                // Tight-list canonical form: no blank line between the item's
                // first paragraph and a nested block (commonly a nested list).
                write_block(out, b, &continuation_prefix);
            }
        } else {
            out.push('\n');
        }
    }
}

fn write_table(
    out: &mut String,
    header: &Row,
    rows: &[Row],
    alignments: &[Alignment],
    prefix: &str,
) {
    // Render each cell to a string first so we can compute column widths.
    let mut header_cells: Vec<String> = Vec::with_capacity(header.cells.len());
    for cell in &header.cells {
        header_cells.push(render_cell(cell));
    }
    let mut row_cells: Vec<Vec<String>> = Vec::with_capacity(rows.len());
    for row in rows {
        let mut row_out: Vec<String> = Vec::with_capacity(row.cells.len());
        for cell in &row.cells {
            row_out.push(render_cell(cell));
        }
        row_cells.push(row_out);
    }
    let columns = header_cells.len().max(alignments.len());
    while header_cells.len() < columns {
        header_cells.push(String::new());
    }
    for row in &mut row_cells {
        while row.len() < columns {
            row.push(String::new());
        }
    }

    let mut widths = vec![0usize; columns];
    for (i, cell) in header_cells.iter().enumerate() {
        widths[i] = widths[i].max(cell.chars().count());
    }
    for row in &row_cells {
        for (i, cell) in row.iter().enumerate() {
            widths[i] = widths[i].max(cell.chars().count());
        }
    }
    // The separator row must have at least three dashes per column.
    for w in widths.iter_mut() {
        if *w < 3 {
            *w = 3;
        }
    }

    write_table_row(out, &header_cells, &widths, alignments, prefix);
    write_table_separator(out, &widths, alignments, prefix);
    for row in &row_cells {
        write_table_row(out, row, &widths, alignments, prefix);
    }
}

fn render_cell(cell: &[Inline]) -> String {
    let mut s = String::new();
    write_inlines(&mut s, cell);
    s
}

fn write_table_row(
    out: &mut String,
    cells: &[String],
    widths: &[usize],
    alignments: &[Alignment],
    prefix: &str,
) {
    out.push_str(prefix);
    out.push('|');
    for (i, cell) in cells.iter().enumerate() {
        let align = alignments.get(i).copied().unwrap_or(Alignment::None);
        let width = widths[i];
        let cell_len = cell.chars().count();
        let pad_total = width.saturating_sub(cell_len);
        let (left_pad, right_pad) = match align {
            Alignment::None | Alignment::Left => (1, pad_total + 1),
            Alignment::Right => (pad_total + 1, 1),
            Alignment::Center => {
                let l = pad_total / 2 + 1;
                let r = pad_total - (l - 1) + 1;
                (l, r)
            }
        };
        for _ in 0..left_pad {
            out.push(' ');
        }
        out.push_str(cell);
        for _ in 0..right_pad {
            out.push(' ');
        }
        out.push('|');
    }
    out.push('\n');
}

fn write_table_separator(
    out: &mut String,
    widths: &[usize],
    alignments: &[Alignment],
    prefix: &str,
) {
    out.push_str(prefix);
    out.push('|');
    for (i, width) in widths.iter().enumerate() {
        let align = alignments.get(i).copied().unwrap_or(Alignment::None);
        match align {
            Alignment::None => {
                out.push(' ');
                for _ in 0..*width {
                    out.push('-');
                }
                out.push(' ');
            }
            Alignment::Left => {
                out.push(':');
                for _ in 0..*width {
                    out.push('-');
                }
                out.push(' ');
            }
            Alignment::Center => {
                out.push(':');
                for _ in 0..*width {
                    out.push('-');
                }
                out.push(':');
            }
            Alignment::Right => {
                out.push(' ');
                for _ in 0..*width {
                    out.push('-');
                }
                out.push(':');
            }
        }
        out.push('|');
    }
    out.push('\n');
}

fn write_inlines(out: &mut String, inlines: &[Inline]) {
    for inline in inlines {
        write_inline(out, inline);
    }
}

/// Variant of [`write_inlines`] that re-emits `prefix` after each line break
/// (used inside paragraphs that live under a blockquote / callout prefix so
/// every wrapped line stays inside the quote).
fn write_inlines_prefixed(out: &mut String, inlines: &[Inline], prefix: &str) {
    if prefix.is_empty() {
        return write_inlines(out, inlines);
    }
    for inline in inlines {
        match inline {
            Inline::LineBreak { hard } => {
                if *hard {
                    out.push_str("  \n");
                } else {
                    out.push('\n');
                }
                out.push_str(prefix);
            }
            other => write_inline(out, other),
        }
    }
}

fn write_inline(out: &mut String, inline: &Inline) {
    match inline {
        Inline::Text { value } => out.push_str(value),
        Inline::Emphasis { content } => {
            out.push('*');
            write_inlines(out, content);
            out.push('*');
        }
        Inline::Strong { content } => {
            out.push_str("**");
            write_inlines(out, content);
            out.push_str("**");
        }
        Inline::Strikethrough { content } => {
            out.push_str("~~");
            write_inlines(out, content);
            out.push_str("~~");
        }
        Inline::Code { value } => {
            // Use the smallest run of backticks that doesn't appear inside the
            // value, with a leading/trailing space when the value itself begins
            // or ends with a backtick.
            let max_run = longest_backtick_run(value);
            let fence: String = "`".repeat(max_run + 1);
            out.push_str(&fence);
            if value.starts_with('`') || value.ends_with('`') {
                out.push(' ');
                out.push_str(value);
                out.push(' ');
            } else {
                out.push_str(value);
            }
            out.push_str(&fence);
        }
        Inline::Link {
            url,
            title,
            content,
        } => {
            out.push('[');
            write_inlines(out, content);
            out.push(']');
            out.push('(');
            out.push_str(url);
            if let Some(title) = title {
                let _ = write!(out, " \"{title}\"");
            }
            out.push(')');
        }
        Inline::Image { url, alt, title } => {
            out.push_str("![");
            out.push_str(alt);
            out.push(']');
            out.push('(');
            out.push_str(url);
            if let Some(title) = title {
                let _ = write!(out, " \"{title}\"");
            }
            out.push(')');
        }
        Inline::WikiLink { target, alias } => {
            out.push_str("[[");
            out.push_str(target);
            if let Some(alias) = alias {
                out.push('|');
                out.push_str(alias);
            }
            out.push_str("]]");
        }
        Inline::Math { display, src } => {
            if *display {
                let _ = write!(out, "$${src}$$");
            } else {
                let _ = write!(out, "${src}$");
            }
        }
        Inline::FootnoteRef { id } => {
            let _ = write!(out, "[^{id}]");
        }
        Inline::LineBreak { hard } => {
            if *hard {
                out.push_str("  \n");
            } else {
                out.push('\n');
            }
        }
        Inline::HtmlInline { html } => out.push_str(html),
    }
}

fn longest_backtick_run(s: &str) -> usize {
    let mut max = 0;
    let mut current = 0;
    for b in s.bytes() {
        if b == b'`' {
            current += 1;
            if current > max {
                max = current;
            }
        } else {
            current = 0;
        }
    }
    max
}
