//! Markdown -> [`NoteDoc`] parser.
//!
//! Pipeline:
//! 1. [`frontmatter::extract`] peels off the optional YAML head.
//! 2. `pulldown-cmark` (with GFM extensions) yields a flat event stream over
//!    the body.
//! 3. A [`Walker`] folds the event stream into block / inline trees.
//! 4. [`apply_lattice_extensions`] post-processes the inline trees to recognise
//!    Lattice-specific syntax that `pulldown-cmark` doesn't know about:
//!    wiki-links `[[…]]`, inline math `$…$`, GitHub-style callouts inside
//!    blockquotes.

use pulldown_cmark::{
    Alignment as PdAlign, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd,
};

use crate::error::LatticeResult;
use crate::markdown::doc::{Alignment, Block, CalloutKind, Inline, ListItem, NoteDoc, Row};
use crate::markdown::frontmatter;

/// Parse a full Markdown document.
pub fn parse(input: &str) -> LatticeResult<NoteDoc> {
    let (frontmatter, body) = frontmatter::extract(input)?;
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_MATH);
    let parser = Parser::new_ext(body, options);
    let mut walker = Walker::default();
    for event in parser {
        walker.handle(event);
    }
    let mut blocks = walker.finish();
    apply_lattice_extensions(&mut blocks);
    promote_block_math(&mut blocks);
    Ok(NoteDoc {
        frontmatter,
        body: blocks,
    })
}

/// Promote `Paragraph(only DisplayMath)` to `Block::Math` so the serializer
/// emits the canonical `$$\nsrc\n$$\n` form.
fn promote_block_math(blocks: &mut [Block]) {
    for block in blocks.iter_mut() {
        match block {
            Block::Paragraph { content } if content.len() == 1 => {
                if let Inline::Math { display: true, src } = &content[0] {
                    let src = src.clone();
                    *block = Block::Math { src };
                }
            }
            Block::Blockquote { content }
            | Block::Callout { body: content, .. }
            | Block::FootnoteDefinition { content, .. } => promote_block_math(content),
            Block::BulletList { items } | Block::OrderedList { items, .. } => {
                for item in items {
                    promote_block_math(&mut item.content);
                }
            }
            _ => {}
        }
    }
}

#[derive(Default)]
struct Walker {
    /// Stack of in-progress block containers. Top is the most recent open block.
    block_stack: Vec<BlockFrame>,
    /// Stack of in-progress inline containers. Top is the most recent open span.
    inline_stack: Vec<InlineFrame>,
    /// Scratch buffer for inline content owned by the current Paragraph/Heading.
    /// Reset to `None` on commit; `Some(empty)` during accumulation.
    inline_buffer: Option<Vec<Inline>>,
    /// Accumulated table state, if currently inside one.
    table: Option<TableBuilder>,
    /// Finished top-level blocks in source order.
    output: Vec<Block>,
}

#[derive(Debug)]
enum BlockFrame {
    Paragraph,
    Heading(u8),
    Blockquote(Vec<Block>),
    BulletList(Vec<ListItem>),
    OrderedList {
        start: u32,
        items: Vec<ListItem>,
    },
    ListItem {
        checked: Option<bool>,
        blocks: Vec<Block>,
    },
    FootnoteDef {
        id: String,
        blocks: Vec<Block>,
    },
    HtmlBlock(String),
}

#[derive(Debug)]
enum InlineFrame {
    Emphasis(Vec<Inline>),
    Strong(Vec<Inline>),
    Strikethrough(Vec<Inline>),
    Link {
        url: String,
        title: Option<String>,
        content: Vec<Inline>,
    },
    Image {
        url: String,
        title: Option<String>,
        alt: String,
    },
}

#[derive(Debug)]
struct TableBuilder {
    alignments: Vec<Alignment>,
    header: Option<Row>,
    current_row_cells: Vec<Vec<Inline>>,
    rows: Vec<Row>,
    in_header: bool,
}

impl Walker {
    fn handle(&mut self, event: Event<'_>) {
        match event {
            Event::Start(tag) => self.open(tag),
            Event::End(tag) => self.close(tag),
            Event::Text(text) => self.push_inline(Inline::Text {
                value: text.into_string(),
            }),
            Event::Code(text) => self.push_inline(Inline::Code {
                value: text.into_string(),
            }),
            Event::Html(html) | Event::InlineHtml(html) => self.push_inline_or_block_html(html),
            Event::FootnoteReference(id) => self.push_inline(Inline::FootnoteRef {
                id: id.into_string(),
            }),
            Event::SoftBreak => self.push_inline(Inline::LineBreak { hard: false }),
            Event::HardBreak => self.push_inline(Inline::LineBreak { hard: true }),
            Event::Rule => self.commit_block(Block::ThematicBreak),
            Event::TaskListMarker(checked) => {
                if let Some(BlockFrame::ListItem { checked: slot, .. }) =
                    self.block_stack.last_mut()
                {
                    *slot = Some(checked);
                }
            }
            Event::InlineMath(s) => self.push_inline(Inline::Math {
                display: false,
                src: s.into_string(),
            }),
            Event::DisplayMath(s) => {
                // Display math may appear inline or as its own block; we always
                // surface it inline and let the post-pass promote when standalone.
                // Trim a single leading/trailing newline so the multi-line
                // form `$$\nbody\n$$` round-trips cleanly.
                let src = s
                    .into_string()
                    .trim_start_matches('\n')
                    .trim_end_matches('\n')
                    .to_string();
                self.push_inline(Inline::Math { display: true, src });
            }
        }
    }

    fn open(&mut self, tag: Tag<'_>) {
        // Tight list items can hold both inline text AND a nested block
        // (commonly a nested list). When we see a block-opening tag while
        // an inline buffer has pending content, commit that content as a
        // Paragraph first so siblings stay separated.
        if !matches!(
            tag,
            Tag::Paragraph
                | Tag::Heading { .. }
                | Tag::TableCell
                | Tag::Emphasis
                | Tag::Strong
                | Tag::Strikethrough
                | Tag::Link { .. }
                | Tag::Image { .. }
        ) {
            self.flush_inline_buffer();
        }
        match tag {
            Tag::Paragraph => self.block_stack.push(BlockFrame::Paragraph),
            Tag::Heading { level, .. } => self
                .block_stack
                .push(BlockFrame::Heading(heading_to_u8(level))),
            Tag::BlockQuote(_) => self.block_stack.push(BlockFrame::Blockquote(Vec::new())),
            Tag::CodeBlock(kind) => self.open_code_block(kind),
            Tag::List(start) => match start {
                Some(n) => self.block_stack.push(BlockFrame::OrderedList {
                    start: n as u32,
                    items: Vec::new(),
                }),
                None => self.block_stack.push(BlockFrame::BulletList(Vec::new())),
            },
            Tag::Item => self.block_stack.push(BlockFrame::ListItem {
                checked: None,
                blocks: Vec::new(),
            }),
            Tag::Emphasis => self.inline_stack.push(InlineFrame::Emphasis(Vec::new())),
            Tag::Strong => self.inline_stack.push(InlineFrame::Strong(Vec::new())),
            Tag::Strikethrough => self
                .inline_stack
                .push(InlineFrame::Strikethrough(Vec::new())),
            Tag::Link {
                dest_url, title, ..
            } => self.inline_stack.push(InlineFrame::Link {
                url: dest_url.into_string(),
                title: option_string(title),
                content: Vec::new(),
            }),
            Tag::Image {
                dest_url, title, ..
            } => self.inline_stack.push(InlineFrame::Image {
                url: dest_url.into_string(),
                title: option_string(title),
                alt: String::new(),
            }),
            Tag::Table(alignments) => {
                self.table = Some(TableBuilder {
                    alignments: alignments.into_iter().map(map_alignment).collect(),
                    header: None,
                    current_row_cells: Vec::new(),
                    rows: Vec::new(),
                    in_header: false,
                });
            }
            Tag::TableHead => {
                if let Some(t) = self.table.as_mut() {
                    t.in_header = true;
                    t.current_row_cells = Vec::new();
                }
            }
            Tag::TableRow => {
                if let Some(t) = self.table.as_mut() {
                    t.current_row_cells = Vec::new();
                }
            }
            Tag::TableCell => {
                self.block_stack.push(BlockFrame::Paragraph);
            }
            Tag::FootnoteDefinition(id) => self.block_stack.push(BlockFrame::FootnoteDef {
                id: id.into_string(),
                blocks: Vec::new(),
            }),
            Tag::HtmlBlock => {
                self.block_stack.push(BlockFrame::HtmlBlock(String::new()));
            }
            Tag::MetadataBlock(_) => {
                // Frontmatter is parsed separately in `frontmatter::extract`,
                // so we drop any metadata block pulldown-cmark emits.
            }
            // Definition list / FootNote (legacy alias) — not enabled in our Options set.
            _ => {}
        }
    }

    fn close(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Paragraph => {
                let frame = self.pop_block();
                if let BlockFrame::Paragraph = frame {
                    let content = self.take_inline();
                    if self.in_table_cell() {
                        if let Some(t) = self.table.as_mut() {
                            t.current_row_cells.push(content);
                        }
                    } else {
                        self.commit_block(Block::Paragraph { content });
                    }
                }
            }
            TagEnd::Heading(_) => {
                let frame = self.pop_block();
                if let BlockFrame::Heading(level) = frame {
                    let content = self.take_inline();
                    self.commit_block(Block::Heading { level, content });
                }
            }
            TagEnd::BlockQuote(_) => {
                let frame = self.pop_block();
                if let BlockFrame::Blockquote(content) = frame {
                    self.commit_block(Block::Blockquote { content });
                }
            }
            TagEnd::CodeBlock => { /* code block was committed in open */ }
            TagEnd::List(_) => {
                let frame = self.pop_block();
                match frame {
                    BlockFrame::BulletList(items) => {
                        self.commit_block(Block::BulletList { items });
                    }
                    BlockFrame::OrderedList { start, items } => {
                        self.commit_block(Block::OrderedList { start, items });
                    }
                    _ => {}
                }
            }
            TagEnd::Item => {
                // Flush any pending inline content (tight list items hold
                // their text directly in the item rather than in a Paragraph).
                let pending = self.inline_buffer.take().unwrap_or_default();
                let frame = self.pop_block();
                if let BlockFrame::ListItem {
                    checked,
                    mut blocks,
                } = frame
                {
                    if !pending.is_empty() {
                        blocks.push(Block::Paragraph { content: pending });
                    }
                    let item = ListItem {
                        checked,
                        content: blocks,
                    };
                    match self.block_stack.last_mut() {
                        Some(BlockFrame::BulletList(items))
                        | Some(BlockFrame::OrderedList { items, .. }) => {
                            items.push(item);
                        }
                        _ => {}
                    }
                }
            }
            TagEnd::Emphasis => {
                let frame = self.inline_stack.pop();
                if let Some(InlineFrame::Emphasis(content)) = frame {
                    self.push_inline(Inline::Emphasis { content });
                }
            }
            TagEnd::Strong => {
                let frame = self.inline_stack.pop();
                if let Some(InlineFrame::Strong(content)) = frame {
                    self.push_inline(Inline::Strong { content });
                }
            }
            TagEnd::Strikethrough => {
                let frame = self.inline_stack.pop();
                if let Some(InlineFrame::Strikethrough(content)) = frame {
                    self.push_inline(Inline::Strikethrough { content });
                }
            }
            TagEnd::Link => {
                let frame = self.inline_stack.pop();
                if let Some(InlineFrame::Link {
                    url,
                    title,
                    content,
                }) = frame
                {
                    self.push_inline(Inline::Link {
                        url,
                        title,
                        content,
                    });
                }
            }
            TagEnd::Image => {
                let frame = self.inline_stack.pop();
                if let Some(InlineFrame::Image { url, title, alt }) = frame {
                    self.push_inline(Inline::Image { url, alt, title });
                }
            }
            TagEnd::Table => {
                if let Some(t) = self.table.take() {
                    let header = t.header.unwrap_or(Row { cells: Vec::new() });
                    self.commit_block(Block::Table {
                        header,
                        rows: t.rows,
                        alignments: t.alignments,
                    });
                }
            }
            TagEnd::TableHead => {
                if let Some(t) = self.table.as_mut() {
                    let cells = std::mem::take(&mut t.current_row_cells);
                    t.header = Some(Row { cells });
                    t.in_header = false;
                }
            }
            TagEnd::TableRow => {
                if let Some(t) = self.table.as_mut() {
                    let cells = std::mem::take(&mut t.current_row_cells);
                    t.rows.push(Row { cells });
                }
            }
            TagEnd::TableCell => {
                let frame = self.pop_block();
                if let BlockFrame::Paragraph = frame {
                    let content = self.take_inline();
                    if let Some(t) = self.table.as_mut() {
                        t.current_row_cells.push(content);
                    }
                }
            }
            TagEnd::FootnoteDefinition => {
                let frame = self.pop_block();
                if let BlockFrame::FootnoteDef { id, blocks } = frame {
                    self.commit_block(Block::FootnoteDefinition {
                        id,
                        content: blocks,
                    });
                }
            }
            TagEnd::HtmlBlock => {
                let frame = self.pop_block();
                if let BlockFrame::HtmlBlock(mut html) = frame {
                    while html.ends_with('\n') {
                        html.pop();
                    }
                    self.commit_block(Block::HtmlBlock { html });
                }
            }
            TagEnd::MetadataBlock(_) => {}
            _ => {}
        }
    }

    fn open_code_block(&mut self, kind: pulldown_cmark::CodeBlockKind<'_>) {
        let info = match kind {
            pulldown_cmark::CodeBlockKind::Indented => String::new(),
            pulldown_cmark::CodeBlockKind::Fenced(s) => s.into_string(),
        };
        // Code-block bodies arrive as a series of Text events while the block
        // is open. We accumulate them into a Paragraph frame and convert on close.
        self.block_stack.push(BlockFrame::Paragraph);
        // Stash info-string on the inline buffer via a temporary marker text.
        // We pop it back on close.
        self.inline_stack.push(InlineFrame::Link {
            url: format!("__lattice_fenced__:{info}"),
            title: None,
            content: Vec::new(),
        });
    }

    fn push_inline(&mut self, inline: Inline) {
        // Special handling: if we're inside the code-block sentinel link, the
        // text events are the code body. We dispatch to the fenced-block path.
        if let Some(InlineFrame::Link { url, .. }) = self.inline_stack.last_mut() {
            if let Some(info) = url.strip_prefix("__lattice_fenced__:") {
                let info = info.to_string();
                let body = match inline {
                    Inline::Text { value } => value,
                    Inline::Code { value } => value,
                    _ => return,
                };
                // pop the sentinel frame + paragraph; commit a Fenced block.
                let _ = self.inline_stack.pop();
                let _ = self.pop_block();
                self.commit_block(Block::Fenced { info, body });
                return;
            }
        }
        if let Some(frame) = self.inline_stack.last_mut() {
            match frame {
                InlineFrame::Emphasis(c)
                | InlineFrame::Strong(c)
                | InlineFrame::Strikethrough(c)
                | InlineFrame::Link { content: c, .. } => c.push(inline),
                InlineFrame::Image { alt, .. } => {
                    if let Inline::Text { value } = inline {
                        alt.push_str(&value);
                    }
                }
            }
        } else {
            self.current_inline_buf_mut().push(inline);
        }
    }

    fn push_inline_or_block_html(&mut self, html: CowStr<'_>) {
        let html = html.into_string();
        // If we're inside an HtmlBlock frame, accumulate the chunk into it.
        if let Some(BlockFrame::HtmlBlock(buf)) = self.block_stack.last_mut() {
            buf.push_str(&html);
            return;
        }
        // Otherwise inline / standalone html arrived without an HtmlBlock wrapper.
        if self
            .block_stack
            .iter()
            .any(|frame| matches!(frame, BlockFrame::Paragraph | BlockFrame::Heading(_)))
        {
            self.push_inline(Inline::HtmlInline { html });
        } else {
            self.commit_block(Block::HtmlBlock { html });
        }
    }

    fn current_inline_buf_mut(&mut self) -> &mut Vec<Inline> {
        // Stash for the most recent block frame that holds inline content.
        // We use a thread-local-ish approach: each open Paragraph/Heading owns
        // a scratch buffer kept on the stack via take_inline at close.
        self.inline_buffer.get_or_insert_with(Vec::new)
    }

    fn take_inline(&mut self) -> Vec<Inline> {
        self.inline_buffer.take().unwrap_or_default()
    }

    fn pop_block(&mut self) -> BlockFrame {
        self.block_stack.pop().expect("balanced block events")
    }

    /// If there's pending inline content not yet committed to a block, wrap
    /// it in a Paragraph and commit it. Used when a tight list item holds
    /// loose text followed by a nested block.
    fn flush_inline_buffer(&mut self) {
        let buf = self.inline_buffer.take().unwrap_or_default();
        if !buf.is_empty() {
            self.commit_block(Block::Paragraph { content: buf });
        }
    }

    fn commit_block(&mut self, block: Block) {
        if let Some(frame) = self.block_stack.last_mut() {
            match frame {
                BlockFrame::Blockquote(blocks)
                | BlockFrame::ListItem { blocks, .. }
                | BlockFrame::FootnoteDef { blocks, .. } => blocks.push(block),
                _ => self.output.push(block),
            }
        } else {
            self.output.push(block);
        }
    }

    fn in_table_cell(&self) -> bool {
        self.table.is_some() && matches!(self.block_stack.last(), Some(BlockFrame::Paragraph))
    }

    fn finish(mut self) -> Vec<Block> {
        // Any leftover inline (loose text outside any block) gets wrapped in
        // a paragraph so the output is well-formed.
        if let Some(buf) = self.inline_buffer.take() {
            if !buf.is_empty() {
                self.output.push(Block::Paragraph { content: buf });
            }
        }
        self.output
    }
}

fn heading_to_u8(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn map_alignment(a: PdAlign) -> Alignment {
    match a {
        PdAlign::None => Alignment::None,
        PdAlign::Left => Alignment::Left,
        PdAlign::Center => Alignment::Center,
        PdAlign::Right => Alignment::Right,
    }
}

fn option_string(s: CowStr<'_>) -> Option<String> {
    let s = s.into_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

// ---------------------------------------------------------------------------
// Post-walk Lattice-extension passes
// ---------------------------------------------------------------------------

fn apply_lattice_extensions(blocks: &mut [Block]) {
    for block in blocks.iter_mut() {
        apply_to_block(block);
    }
    // Detect callouts at the top level: a Blockquote whose first paragraph
    // begins with `[!kind]` becomes a Callout.
    promote_callouts(blocks);
}

fn apply_to_block(block: &mut Block) {
    match block {
        Block::Heading { content, .. } | Block::Paragraph { content } => apply_to_inlines(content),
        Block::Blockquote { content } | Block::Callout { body: content, .. } => {
            apply_lattice_extensions(content)
        }
        Block::BulletList { items } | Block::OrderedList { items, .. } => {
            for item in items {
                apply_lattice_extensions(&mut item.content);
            }
        }
        Block::Table { header, rows, .. } => {
            for cell in &mut header.cells {
                apply_to_inlines(cell);
            }
            for row in rows {
                for cell in &mut row.cells {
                    apply_to_inlines(cell);
                }
            }
        }
        Block::FootnoteDefinition { content, .. } => apply_lattice_extensions(content),
        _ => {}
    }
}

fn apply_to_inlines(inlines: &mut Vec<Inline>) {
    // Recurse first so children get rewritten before we re-scan the parent
    // text for wiki-links and inline math.
    for inline in inlines.iter_mut() {
        match inline {
            Inline::Emphasis { content }
            | Inline::Strong { content }
            | Inline::Strikethrough { content }
            | Inline::Link { content, .. } => apply_to_inlines(content),
            _ => {}
        }
    }

    // Coalesce consecutive Text nodes before scanning so wiki-links and math
    // spans that pulldown-cmark fragmented across multiple Text events still
    // get recognised. We flush a buffered run whenever we hit a non-Text node.
    let mut out: Vec<Inline> = Vec::with_capacity(inlines.len());
    let mut buf = String::new();
    for inline in std::mem::take(inlines) {
        match inline {
            Inline::Text { value } => buf.push_str(&value),
            other => {
                if !buf.is_empty() {
                    out.extend(scan_text_for_extensions(&buf));
                    buf.clear();
                }
                out.push(other);
            }
        }
    }
    if !buf.is_empty() {
        out.extend(scan_text_for_extensions(&buf));
    }
    *inlines = out;
}

fn scan_text_for_extensions(text: &str) -> Vec<Inline> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut start = 0usize;
    let mut i = 0usize;
    while i < bytes.len() {
        // Wiki-link: `[[…]]` — recognise eagerly, since this syntax doesn't
        // overlap with vanilla CommonMark.
        if bytes[i] == b'[' && i + 1 < bytes.len() && bytes[i + 1] == b'[' {
            if let Some(end) = text[i + 2..].find("]]") {
                let inner = &text[i + 2..i + 2 + end];
                push_text_slice(&mut out, &text[start..i]);
                let (target, alias) = match inner.find('|') {
                    Some(p) => (inner[..p].to_string(), Some(inner[p + 1..].to_string())),
                    None => (inner.to_string(), None),
                };
                out.push(Inline::WikiLink { target, alias });
                i += 2 + end + 2;
                start = i;
                continue;
            }
        }
        // Inline math `$…$` — single-line, no whitespace right after the
        // opening `$` and no whitespace right before the closing `$`.
        if bytes[i] == b'$' && (i == 0 || bytes[i - 1] != b'\\') {
            if let Some(rel_end) = find_inline_math_close(&text[i + 1..]) {
                let src = &text[i + 1..i + 1 + rel_end];
                push_text_slice(&mut out, &text[start..i]);
                out.push(Inline::Math {
                    display: false,
                    src: src.to_string(),
                });
                i += 1 + rel_end + 1;
                start = i;
                continue;
            }
        }
        i += 1;
    }
    push_text_slice(&mut out, &text[start..]);
    out
}

fn find_inline_math_close(after_open: &str) -> Option<usize> {
    if after_open.starts_with(' ') || after_open.starts_with('\n') {
        return None;
    }
    let mut prev = 0u8;
    for (idx, b) in after_open.bytes().enumerate() {
        if b == b'\n' {
            return None;
        }
        if b == b'$' && prev != b'\\' && idx > 0 {
            // Check the character before the `$` isn't whitespace.
            let prev_char = after_open.as_bytes()[idx - 1];
            if prev_char != b' ' && prev_char != b'\t' {
                return Some(idx);
            }
        }
        prev = b;
    }
    None
}

fn push_text_slice(out: &mut Vec<Inline>, s: &str) {
    if !s.is_empty() {
        out.push(Inline::Text {
            value: s.to_string(),
        });
    }
}

fn promote_callouts(blocks: &mut [Block]) {
    for block in blocks.iter_mut() {
        if let Block::Blockquote { content } = block {
            if let Some(kind) = detect_callout_kind(content) {
                strip_callout_marker(content);
                let body = std::mem::take(content);
                *block = Block::Callout { kind, body };
            }
        }
    }
}

fn detect_callout_kind(content: &[Block]) -> Option<CalloutKind> {
    let first_inlines = match content.first() {
        Some(Block::Paragraph { content }) => content,
        _ => return None,
    };
    let first_text = collect_leading_text(first_inlines);
    let stripped = first_text.strip_prefix("[!")?;
    let close = stripped.find(']')?;
    let marker = &stripped[..close];
    CalloutKind::from_marker(marker)
}

/// pulldown-cmark sometimes splits short text like `[!info]` into multiple
/// `Text` inlines (e.g. `[`, `!info`, `]`) when it tentatively starts parsing
/// a link. Concatenate the leading run of `Text` events so the callout
/// detector sees a complete marker.
fn collect_leading_text(inlines: &[Inline]) -> String {
    let mut out = String::new();
    for inline in inlines {
        match inline {
            Inline::Text { value } => out.push_str(value),
            _ => break,
        }
    }
    out
}

fn strip_callout_marker(content: &mut Vec<Block>) {
    let Some(Block::Paragraph { content: inlines }) = content.first_mut() else {
        return;
    };
    // Find where the marker ends across consecutive Text inlines.
    let mut combined = String::new();
    let mut consumed_text_count = 0usize;
    for inline in inlines.iter() {
        if let Inline::Text { value } = inline {
            combined.push_str(value);
            consumed_text_count += 1;
            if combined.contains(']') {
                break;
            }
        } else {
            break;
        }
    }
    let Some(stripped) = combined.strip_prefix("[!") else {
        return;
    };
    let Some(close_rel) = stripped.find(']') else {
        return;
    };
    let after_marker = &stripped[close_rel + 1..];
    // Remove the Text inlines we consumed and re-insert the post-marker tail.
    inlines.drain(0..consumed_text_count);
    let tail = after_marker
        .trim_start_matches('\n')
        .trim_start_matches(' ')
        .to_string();
    if !tail.is_empty() {
        inlines.insert(0, Inline::Text { value: tail });
    }
    // Drop any leading break that came from the newline after `[!kind]`.
    while matches!(inlines.first(), Some(Inline::LineBreak { .. })) {
        inlines.remove(0);
    }
    if inlines.is_empty() {
        content.remove(0);
    }
}
