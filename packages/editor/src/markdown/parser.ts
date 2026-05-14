/**
 * Markdown -> NoteDoc parser (TypeScript mirror of `core/lattice-core/src/markdown/parser.rs`).
 *
 * Pipeline:
 *   1. `frontmatter` peels off the YAML head, returning an ordered map.
 *   2. `mdast-util-from-markdown` (with GFM + math extensions) yields the mdast tree.
 *   3. `mdastToBlocks` walks the tree and builds [`Block`] array.
 *   4. `applyLatticeExtensions` post-processes inlines for wiki-links / callouts.
 */

import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { frontmatter as frontmatterExt } from "micromark-extension-frontmatter";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";
import type {
  Code,
  Content,
  Definition,
  Emphasis,
  FootnoteDefinition as MdastFootnoteDef,
  FootnoteReference,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem as MdastListItem,
  Paragraph,
  Root,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
  ThematicBreak,
  Yaml,
} from "mdast";
import { parse as parseYaml } from "yaml";

/**
 * `mdast-util-math` augments the mdast schema with `math` (block) and
 * `inlineMath` (inline) nodes. The augmentation isn't re-exported as a
 * named type, so we declare a local shape here.
 */
interface MdastMath {
  type: "math";
  value: string;
}

import type {
  Alignment,
  Block,
  CalloutKind,
  Frontmatter,
  FrontmatterEntry,
  Inline,
  ListItem,
  NoteDoc,
  Row,
} from "@lattice/core-bindings";

interface MdastInlineMath {
  type: "inlineMath";
  value: string;
}

type AnyNode = Content | Root;

/** Public entry point — parse a full Markdown document. */
export function parse(input: string): NoteDoc {
  const tree = fromMarkdown(input, {
    extensions: [frontmatterExt(["yaml"]), gfm(), math()],
    mdastExtensions: [frontmatterFromMarkdown(["yaml"]), gfmFromMarkdown(), mathFromMarkdown()],
  });

  let frontmatter: Frontmatter = { entries: [] };
  const blocks: Block[] = [];

  for (const child of tree.children) {
    if (child.type === "yaml") {
      frontmatter = parseFrontmatter((child as Yaml).value);
    } else {
      const block = mdastToBlock(child);
      if (block !== null) blocks.push(block);
    }
  }

  applyLatticeExtensions(blocks);
  promoteBlockMath(blocks);
  promoteCallouts(blocks);

  return { frontmatter, body: blocks };
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function parseFrontmatter(yamlText: string): Frontmatter {
  if (yamlText.trim() === "") return { entries: [] };
  const doc = parseYaml(yamlText, { keepSourceTokens: false });
  if (doc === null || doc === undefined) return { entries: [] };
  if (typeof doc !== "object") return { entries: [] };

  // `parse` returns a plain JS value when the document is a mapping/sequence;
  // we need the ordered key list, which only `parseDocument` exposes. Round-trip
  // via the high-level `parse` is fine since modern V8 preserves insertion order.
  const entries: FrontmatterEntry[] = [];
  for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
    entries.push({ key, value: yamlToJson(value) });
  }
  return { entries };
}

function yamlToJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(yamlToJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = yamlToJson(v);
    }
    return out;
  }
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return value;
  // Dates, bigints, symbols — coerce to string for IPC parity with the Rust side.
  return String(value);
}

// ---------------------------------------------------------------------------
// mdast -> Block
// ---------------------------------------------------------------------------

function mdastToBlock(node: AnyNode): Block | null {
  switch (node.type) {
    case "heading": {
      const h = node as Heading;
      return {
        type: "heading",
        data: {
          level: h.depth as Block extends { data: infer D }
            ? D extends { level: number }
              ? number
              : never
            : never as unknown as number,
          content: inlinesFrom(h.children),
        },
      };
    }
    case "paragraph": {
      return { type: "paragraph", data: { content: inlinesFrom((node as Paragraph).children) } };
    }
    case "list": {
      const list = node as List;
      const items = list.children.map((item) => listItemFromMdast(item as MdastListItem));
      if (list.ordered) {
        const start = (list.start ?? 1) as number;
        return { type: "ordered_list", data: { start, items } };
      }
      return { type: "bullet_list", data: { items } };
    }
    case "blockquote": {
      const bq = node as { children: Content[] };
      const content = bq.children.map((c) => mdastToBlock(c)).filter((b): b is Block => b !== null);
      return { type: "blockquote", data: { content } };
    }
    case "code": {
      const c = node as Code;
      // pulldown-cmark includes the trailing `\n` in code-block bodies; mdast
      // strips it. Add it back so both parsers produce the same NoteDoc.
      const body = c.value === "" ? "" : `${c.value}\n`;
      return { type: "fenced", data: { info: c.lang ? formatCodeInfo(c) : "", body } };
    }
    case "math": {
      return { type: "math", data: { src: (node as MdastMath).value } };
    }
    case "thematicBreak": {
      void (node as ThematicBreak);
      return { type: "thematic_break" };
    }
    case "html": {
      return { type: "html_block", data: { html: (node as Html).value } };
    }
    case "table": {
      const t = node as Table;
      const alignments = (t.align ?? []).map(mapAlignment);
      const rows = t.children.map((r) => rowFromMdast(r as TableRow));
      const header = rows.shift() ?? { cells: [] };
      return { type: "table", data: { header, rows, alignments } };
    }
    case "footnoteDefinition": {
      const f = node as MdastFootnoteDef;
      const content = f.children
        .map((c) => mdastToBlock(c as Content))
        .filter((b): b is Block => b !== null);
      return { type: "footnote_definition", data: { id: f.identifier, content } };
    }
    case "definition": {
      // Link reference definitions aren't first-class blocks in NoteDoc; skip.
      void (node as Definition);
      return null;
    }
    default:
      return null;
  }
}

function formatCodeInfo(code: Code): string {
  if (!code.lang) return "";
  return code.meta ? `${code.lang} ${code.meta}` : code.lang;
}

function listItemFromMdast(item: MdastListItem): ListItem {
  const checked = typeof item.checked === "boolean" ? item.checked : null;
  const content = item.children.map((c) => mdastToBlock(c)).filter((b): b is Block => b !== null);
  return { checked, content };
}

function rowFromMdast(row: TableRow): Row {
  return {
    cells: row.children.map((cell) => inlinesFrom((cell as TableCell).children)),
  };
}

function mapAlignment(a: "left" | "right" | "center" | null): Alignment {
  switch (a) {
    case "left":
      return "left";
    case "right":
      return "right";
    case "center":
      return "center";
    default:
      return "none";
  }
}

// ---------------------------------------------------------------------------
// mdast inline -> Inline
// ---------------------------------------------------------------------------

function inlinesFrom(children: Content[]): Inline[] {
  const out: Inline[] = [];
  for (const child of children) {
    pushInline(out, child);
  }
  return out;
}

function pushInline(out: Inline[], node: Content): void {
  switch (node.type) {
    case "text": {
      // mdast keeps soft line breaks inside Text values as literal `\n`;
      // pulldown-cmark surfaces them as SoftBreak events. To keep both
      // ASTs identical we split Text on `\n` into Text + soft LineBreak.
      const value = (node as Text).value;
      if (!value.includes("\n")) {
        out.push({ type: "text", data: { value } });
        break;
      }
      const parts = value.split("\n");
      for (let i = 0; i < parts.length; i += 1) {
        if (parts[i] !== "") out.push({ type: "text", data: { value: parts[i]! } });
        if (i < parts.length - 1) out.push({ type: "line_break", data: { hard: false } });
      }
      break;
    }
    case "emphasis":
      out.push({
        type: "emphasis",
        data: { content: inlinesFrom((node as Emphasis).children) },
      });
      break;
    case "strong":
      out.push({
        type: "strong",
        data: { content: inlinesFrom((node as Strong).children) },
      });
      break;
    case "delete":
      out.push({
        type: "strikethrough",
        data: { content: inlinesFrom((node as { children: Content[] }).children) },
      });
      break;
    case "inlineCode":
      out.push({ type: "code", data: { value: (node as InlineCode).value } });
      break;
    case "link": {
      const link = node as Link;
      out.push({
        type: "link",
        data: {
          url: link.url,
          title: link.title ?? null,
          content: inlinesFrom(link.children),
        },
      });
      break;
    }
    case "image": {
      const img = node as Image;
      out.push({
        type: "image",
        data: { url: img.url, alt: img.alt ?? "", title: img.title ?? null },
      });
      break;
    }
    case "inlineMath":
      out.push({
        type: "math",
        data: { display: false, src: (node as MdastInlineMath).value },
      });
      break;
    case "math":
      // Block math at inline position — surface as display math; the
      // promoteBlockMath pass converts standalone-paragraph display math.
      out.push({
        type: "math",
        data: { display: true, src: (node as MdastMath).value },
      });
      break;
    case "break":
      out.push({ type: "line_break", data: { hard: true } });
      break;
    case "html":
      out.push({ type: "html_inline", data: { html: (node as Html).value } });
      break;
    case "footnoteReference":
      out.push({
        type: "footnote_ref",
        data: { id: (node as FootnoteReference).identifier },
      });
      break;
    default:
      // Unknown — drop silently to avoid noise; should not happen on the corpus.
      break;
  }
}

// ---------------------------------------------------------------------------
// Post-walk passes (mirror of `apply_lattice_extensions` in Rust)
// ---------------------------------------------------------------------------

function applyLatticeExtensions(blocks: Block[]): void {
  for (const block of blocks) {
    applyToBlock(block);
  }
}

function applyToBlock(block: Block): void {
  switch (block.type) {
    case "heading":
    case "paragraph":
      block.data.content = transformInlines(block.data.content);
      break;
    case "blockquote":
      applyLatticeExtensions(block.data.content);
      break;
    case "callout":
      applyLatticeExtensions(block.data.body);
      break;
    case "bullet_list":
    case "ordered_list":
      for (const item of block.data.items) {
        applyLatticeExtensions(item.content);
      }
      break;
    case "table":
      block.data.header.cells = block.data.header.cells.map(transformInlines);
      for (const row of block.data.rows) {
        row.cells = row.cells.map(transformInlines);
      }
      break;
    case "footnote_definition":
      applyLatticeExtensions(block.data.content);
      break;
    default:
      break;
  }
}

function transformInlines(inlines: Inline[]): Inline[] {
  // Recurse first so children get rewritten before scanning the parent text.
  for (const inline of inlines) {
    if (
      inline.type === "emphasis" ||
      inline.type === "strong" ||
      inline.type === "strikethrough" ||
      inline.type === "link"
    ) {
      inline.data.content = transformInlines(inline.data.content);
    }
  }
  const out: Inline[] = [];
  for (const inline of inlines) {
    if (inline.type === "text") {
      out.push(...scanTextForExtensions(inline.data.value));
    } else {
      out.push(inline);
    }
  }
  return out;
}

function scanTextForExtensions(text: string): Inline[] {
  const out: Inline[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[" && text[i + 1] === "[") {
      const end = text.indexOf("]]", i + 2);
      if (end !== -1) {
        if (start < i) out.push({ type: "text", data: { value: text.slice(start, i) } });
        const inner = text.slice(i + 2, end);
        const pipe = inner.indexOf("|");
        const target = pipe === -1 ? inner : inner.slice(0, pipe);
        const alias = pipe === -1 ? null : inner.slice(pipe + 1);
        out.push({ type: "wiki_link", data: { target, alias } });
        i = end + 2;
        start = i;
        continue;
      }
    }
    i += 1;
  }
  if (start < text.length) out.push({ type: "text", data: { value: text.slice(start) } });
  return out;
}

function promoteBlockMath(blocks: Block[]): void {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type === "paragraph" && block.data.content.length === 1) {
      const only = block.data.content[0]!;
      if (only.type === "math" && only.data.display) {
        blocks[i] = { type: "math", data: { src: only.data.src } };
        continue;
      }
    }
    if (block.type === "blockquote") promoteBlockMath(block.data.content);
    if (block.type === "callout") promoteBlockMath(block.data.body);
    if (block.type === "bullet_list" || block.type === "ordered_list") {
      for (const item of block.data.items) promoteBlockMath(item.content);
    }
    if (block.type === "footnote_definition") promoteBlockMath(block.data.content);
  }
}

function promoteCallouts(blocks: Block[]): void {
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type === "blockquote") {
      const kind = detectCalloutKind(block.data.content);
      if (kind !== null) {
        const body = block.data.content;
        stripCalloutMarker(body);
        promoteCallouts(body);
        blocks[i] = { type: "callout", data: { kind, body } };
        continue;
      }
      promoteCallouts(block.data.content);
    }
    if (block.type === "callout") promoteCallouts(block.data.body);
    if (block.type === "bullet_list" || block.type === "ordered_list") {
      for (const item of block.data.items) promoteCallouts(item.content);
    }
    if (block.type === "footnote_definition") promoteCallouts(block.data.content);
  }
}

const CALLOUT_KINDS: readonly CalloutKind[] = ["note", "tip", "info", "warning", "caution"];

function detectCalloutKind(content: Block[]): CalloutKind | null {
  const first = content[0];
  if (!first || first.type !== "paragraph") return null;
  const text = collectLeadingText(first.data.content);
  const m = /^\[!([a-zA-Z]+)\]/.exec(text);
  if (!m) return null;
  const marker = m[1]!.toLowerCase();
  return (CALLOUT_KINDS as readonly string[]).includes(marker) ? (marker as CalloutKind) : null;
}

function collectLeadingText(inlines: Inline[]): string {
  let out = "";
  for (const inline of inlines) {
    if (inline.type === "text") out += inline.data.value;
    else break;
  }
  return out;
}

function stripCalloutMarker(content: Block[]): void {
  const first = content[0];
  if (!first || first.type !== "paragraph") return;
  const inlines = first.data.content;
  let combined = "";
  let consumed = 0;
  for (const inline of inlines) {
    if (inline.type === "text") {
      combined += inline.data.value;
      consumed += 1;
      if (combined.includes("]")) break;
    } else {
      break;
    }
  }
  const m = /^\[!([a-zA-Z]+)\]/.exec(combined);
  if (!m) return;
  const afterMarker = combined.slice(m[0].length).replace(/^\n+/, "").replace(/^ +/, "");
  inlines.splice(0, consumed);
  if (afterMarker !== "") {
    inlines.unshift({ type: "text", data: { value: afterMarker } });
  }
  while (inlines[0]?.type === "line_break") {
    inlines.shift();
  }
  if (inlines.length === 0) {
    content.shift();
  }
}
