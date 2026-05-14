/**
 * NoteDoc -> Markdown string serializer (TS mirror of
 * `core/lattice-core/src/markdown/serializer.rs`).
 *
 * Hand-rolled, single-pass emitter. We deliberately do NOT use
 * `mdast-util-to-markdown` / `remark-stringify` because they don't give us
 * enough whitespace control to round-trip the corpus byte-identical.
 */

import type {
  Alignment,
  Block,
  Frontmatter,
  FrontmatterEntry,
  Inline,
  ListItem,
  NoteDoc,
  Row,
} from "@lattice/core-bindings";

export function serialize(doc: NoteDoc): string {
  let out = "";
  out += writeFrontmatter(doc.frontmatter);
  if (doc.frontmatter.entries.length > 0 && doc.body.length > 0) {
    out += "\n";
  }
  out += writeBlocks(doc.body, "");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

function writeFrontmatter(fm: Frontmatter): string {
  if (fm.entries.length === 0) return "";
  let out = "---\n";
  for (const entry of fm.entries) {
    out += writeFrontmatterEntry(entry);
  }
  out += "---\n";
  return out;
}

function writeFrontmatterEntry({ key, value }: FrontmatterEntry): string {
  return `${key}: ${writeYamlInline(value)}\n`;
}

function writeYamlInline(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return writeYamlString(value);
  if (Array.isArray(value)) {
    return `[${value.map(writeYamlInline).join(", ")}]`;
  }
  if (typeof value === "object") {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      parts.push(`${k}: ${writeYamlInline(v)}`);
    }
    return `{${parts.join(", ")}}`;
  }
  return "null";
}

const YAML_RESERVED = /^(true|false|null|yes|no|on|off)$/;
const YAML_SPECIAL_CHARS = /[:#\n[\]{},&*!|>'"%@`]/;

function writeYamlString(s: string): string {
  const needsQuotes =
    s === "" ||
    YAML_SPECIAL_CHARS.test(s) ||
    s.startsWith(" ") ||
    s.endsWith(" ") ||
    YAML_RESERVED.test(s) ||
    isNumeric(s);
  if (!needsQuotes) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function isNumeric(s: string): boolean {
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function writeBlocks(blocks: Block[], prefix: string): string {
  let out = "";
  for (let i = 0; i < blocks.length; i += 1) {
    if (i > 0) {
      out += `${prefix.replace(/\s+$/, "")}\n`;
    }
    out += writeBlock(blocks[i]!, prefix);
  }
  return out;
}

function writeBlock(block: Block, prefix: string): string {
  switch (block.type) {
    case "heading": {
      return `${prefix}${"#".repeat(block.data.level)} ${writeInlines(block.data.content)}\n`;
    }
    case "paragraph": {
      return `${prefix}${writeInlinesPrefixed(block.data.content, prefix)}\n`;
    }
    case "bullet_list": {
      return writeList(block.data.items, prefix, null);
    }
    case "ordered_list": {
      return writeList(block.data.items, prefix, block.data.start);
    }
    case "blockquote": {
      const innerPrefix = `${prefix}> `;
      return writeBlocks(block.data.content, innerPrefix);
    }
    case "callout": {
      const innerPrefix = `${prefix}> `;
      return `${prefix}> [!${block.data.kind}]\n${writeBlocks(block.data.body, innerPrefix)}`;
    }
    case "fenced": {
      const lines = block.data.body.split("\n");
      const tail = lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
      return [
        `${prefix}\`\`\`${block.data.info}`,
        ...tail.map((line) => `${prefix}${line}`),
        `${prefix}\`\`\``,
        "",
      ].join("\n");
    }
    case "math": {
      const lines = block.data.src.split("\n");
      return [`${prefix}$$`, ...lines.map((line) => `${prefix}${line}`), `${prefix}$$`, ""].join(
        "\n",
      );
    }
    case "table": {
      return writeTable(block.data.header, block.data.rows, block.data.alignments, prefix);
    }
    case "thematic_break": {
      return `${prefix}---\n`;
    }
    case "html_block": {
      return block.data.html
        .split("\n")
        .map((line) => `${prefix}${line}\n`)
        .join("");
    }
    case "footnote_definition": {
      const [first, ...rest] = block.data.content;
      let out = `${prefix}[^${block.data.id}]:`;
      if (first === undefined) {
        out += "\n";
        return out;
      }
      if (first.type === "paragraph") {
        out += ` ${writeInlinesPrefixed(first.data.content, prefix)}\n`;
      } else {
        out += "\n";
        out += writeBlock(first, `${prefix}    `);
      }
      for (const b of rest) {
        out += `${prefix.replace(/\s+$/, "")}\n`;
        out += writeBlock(b, `${prefix}    `);
      }
      return out;
    }
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return "";
    }
  }
}

function writeList(items: ListItem[], prefix: string, orderedStart: number | null): string {
  let out = "";
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    const marker = orderedStart !== null ? `${orderedStart + i}. ` : "- ";
    const continuation = `${prefix}${" ".repeat(marker.length)}`;
    out += `${prefix}${marker}`;
    if (item.checked !== null) {
      out += item.checked ? "[x] " : "[ ] ";
    }
    const [first, ...rest] = item.content;
    if (first === undefined) {
      out += "\n";
      continue;
    }
    if (first.type === "paragraph") {
      out += `${writeInlinesPrefixed(first.data.content, continuation)}\n`;
    } else {
      out += "\n";
      out += writeBlock(first, continuation);
    }
    for (const b of rest) {
      out += writeBlock(b, continuation);
    }
  }
  return out;
}

function writeTable(header: Row, rows: Row[], alignments: Alignment[], prefix: string): string {
  const headerCells = header.cells.map(renderCell);
  const bodyCells = rows.map((r) => r.cells.map(renderCell));
  const columns = Math.max(headerCells.length, alignments.length);
  while (headerCells.length < columns) headerCells.push("");
  for (const row of bodyCells) {
    while (row.length < columns) row.push("");
  }

  const widths = new Array<number>(columns).fill(0);
  for (let i = 0; i < headerCells.length; i += 1) {
    widths[i] = Math.max(widths[i]!, headerCells[i]!.length);
  }
  for (const row of bodyCells) {
    for (let i = 0; i < row.length; i += 1) {
      widths[i] = Math.max(widths[i]!, row[i]!.length);
    }
  }
  for (let i = 0; i < widths.length; i += 1) {
    if (widths[i]! < 3) widths[i] = 3;
  }

  let out = writeTableRow(headerCells, widths, alignments, prefix);
  out += writeTableSeparator(widths, alignments, prefix);
  for (const row of bodyCells) {
    out += writeTableRow(row, widths, alignments, prefix);
  }
  return out;
}

function renderCell(cell: Inline[]): string {
  return writeInlines(cell);
}

function writeTableRow(
  cells: string[],
  widths: number[],
  alignments: Alignment[],
  prefix: string,
): string {
  let out = `${prefix}|`;
  for (let i = 0; i < cells.length; i += 1) {
    const align = alignments[i] ?? "none";
    const width = widths[i]!;
    const cell = cells[i]!;
    const padTotal = Math.max(0, width - cell.length);
    let leftPad: number;
    let rightPad: number;
    if (align === "right") {
      leftPad = padTotal + 1;
      rightPad = 1;
    } else if (align === "center") {
      leftPad = Math.floor(padTotal / 2) + 1;
      rightPad = padTotal - (leftPad - 1) + 1;
    } else {
      leftPad = 1;
      rightPad = padTotal + 1;
    }
    out += " ".repeat(leftPad);
    out += cell;
    out += " ".repeat(rightPad);
    out += "|";
  }
  out += "\n";
  return out;
}

function writeTableSeparator(widths: number[], alignments: Alignment[], prefix: string): string {
  let out = `${prefix}|`;
  for (let i = 0; i < widths.length; i += 1) {
    const align = alignments[i] ?? "none";
    const width = widths[i]!;
    if (align === "none") {
      out += ` ${"-".repeat(width)} |`;
    } else if (align === "left") {
      out += `:${"-".repeat(width)} |`;
    } else if (align === "center") {
      out += `:${"-".repeat(width)}:|`;
    } else {
      out += ` ${"-".repeat(width)}:|`;
    }
  }
  out += "\n";
  return out;
}

// ---------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------

function writeInlines(inlines: Inline[]): string {
  let out = "";
  for (const inline of inlines) out += writeInline(inline);
  return out;
}

function writeInlinesPrefixed(inlines: Inline[], prefix: string): string {
  if (prefix === "") return writeInlines(inlines);
  let out = "";
  for (const inline of inlines) {
    if (inline.type === "line_break") {
      out += inline.data.hard ? "  \n" : "\n";
      out += prefix;
    } else {
      out += writeInline(inline);
    }
  }
  return out;
}

function writeInline(inline: Inline): string {
  switch (inline.type) {
    case "text":
      return inline.data.value;
    case "emphasis":
      return `*${writeInlines(inline.data.content)}*`;
    case "strong":
      return `**${writeInlines(inline.data.content)}**`;
    case "strikethrough":
      return `~~${writeInlines(inline.data.content)}~~`;
    case "code": {
      const value = inline.data.value;
      const maxRun = longestBacktickRun(value);
      const fence = "`".repeat(maxRun + 1);
      const padded = value.startsWith("`") || value.endsWith("`") ? ` ${value} ` : value;
      return `${fence}${padded}${fence}`;
    }
    case "link": {
      const title = inline.data.title ? ` "${inline.data.title}"` : "";
      return `[${writeInlines(inline.data.content)}](${inline.data.url}${title})`;
    }
    case "image": {
      const title = inline.data.title ? ` "${inline.data.title}"` : "";
      return `![${inline.data.alt}](${inline.data.url}${title})`;
    }
    case "wiki_link": {
      const alias = inline.data.alias !== null ? `|${inline.data.alias}` : "";
      return `[[${inline.data.target}${alias}]]`;
    }
    case "math":
      return inline.data.display ? `$$${inline.data.src}$$` : `$${inline.data.src}$`;
    case "footnote_ref":
      return `[^${inline.data.id}]`;
    case "line_break":
      return inline.data.hard ? "  \n" : "\n";
    case "html_inline":
      return inline.data.html;
    default: {
      const _exhaustive: never = inline;
      void _exhaustive;
      return "";
    }
  }
}

function longestBacktickRun(s: string): number {
  let max = 0;
  let current = 0;
  for (const ch of s) {
    if (ch === "`") {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  }
  return max;
}
