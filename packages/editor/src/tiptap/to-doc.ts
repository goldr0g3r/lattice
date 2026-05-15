/**
 * Convert a ProseMirror `doc` JSON tree back into a [`NoteDoc`].
 *
 * Inverse of [`noteDocToProseMirror`](./from-doc.ts). The conversion is
 * structural — every TipTap node name in [`LATTICE_NODE_NAMES`](./schema.ts)
 * is handled here, and an `unhandled node type` error fires if a stray node
 * (typically a TipTap default that escaped our schema lockdown) shows up.
 *
 * Frontmatter is reattached by the caller from the original [`NoteDoc`] —
 * the editing surface only knows about block + inline content (see contract
 * notes in the [TipTap PR sub-plan](../../../../.cursor/plans/)).
 */

import type {
  Alignment,
  Block,
  CalloutKind,
  Frontmatter,
  Inline,
  ListItem,
  NoteDoc,
  Row,
} from "@lattice/core-bindings";

import type { PMMark, PMNode } from "./from-doc";

/**
 * Map a ProseMirror `doc` to a [`NoteDoc`].
 *
 * The optional `frontmatter` argument is the carry-over from the original
 * document so the caller doesn't have to reattach it themselves.
 */
export function proseMirrorToNoteDoc(
  json: PMNode,
  frontmatter: Frontmatter = { entries: [] },
): NoteDoc {
  if (json.type !== "doc") {
    throw new Error(`expected doc root, got ${json.type}`);
  }
  const body: Block[] = [];
  for (const node of json.content ?? []) {
    const block = nodeToBlock(node);
    if (block !== null) body.push(block);
  }
  return { frontmatter, body };
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function nodeToBlock(node: PMNode): Block | null {
  switch (node.type) {
    case "heading":
      return {
        type: "heading",
        data: {
          level: clampHeading(node.attrs?.["level"]),
          content: childrenToInlines(node.content ?? []),
        },
      };
    case "paragraph":
      return {
        type: "paragraph",
        data: { content: childrenToInlines(node.content ?? []) },
      };
    case "bulletList":
      return {
        type: "bullet_list",
        data: { items: (node.content ?? []).map(nodeToItem) },
      };
    case "taskList":
      return {
        type: "bullet_list",
        data: { items: (node.content ?? []).map(nodeToItem) },
      };
    case "orderedList":
      return {
        type: "ordered_list",
        data: {
          start: clampStart(node.attrs?.["start"]),
          items: (node.content ?? []).map(nodeToItem),
        },
      };
    case "blockquote":
      return {
        type: "blockquote",
        data: {
          content: childrenToBlocks(node.content ?? []),
        },
      };
    case "callout":
      return {
        type: "callout",
        data: {
          kind: coerceCalloutKind(node.attrs?.["kind"]),
          body: childrenToBlocks(node.content ?? []),
        },
      };
    case "fenced":
      return {
        type: "fenced",
        data: {
          info: String(node.attrs?.["info"] ?? ""),
          body: String(node.attrs?.["body"] ?? ""),
        },
      };
    case "blockMath":
      return {
        type: "math",
        data: { src: String(node.attrs?.["src"] ?? "") },
      };
    case "table":
      return tableFromNode(node);
    case "horizontalRule":
      return { type: "thematic_break" };
    case "htmlBlock":
      return {
        type: "html_block",
        data: { html: String(node.attrs?.["html"] ?? "") },
      };
    case "footnoteDefinition":
      return {
        type: "footnote_definition",
        data: {
          id: String(node.attrs?.["id"] ?? ""),
          content: childrenToBlocks(node.content ?? []),
        },
      };
    case "codeBlock":
      // TipTap StarterKit's default code block (only reachable if someone
      // disables Fenced — keep the converter total for safety).
      return {
        type: "fenced",
        data: {
          info: String(node.attrs?.["language"] ?? ""),
          body: collectText(node.content ?? []),
        },
      };
    default:
      throw new Error(`unhandled PM block node: ${node.type}`);
  }
}

function nodeToItem(node: PMNode): ListItem {
  if (node.type === "listItem") {
    return {
      checked: null,
      content: childrenToBlocks(node.content ?? []),
    };
  }
  if (node.type === "taskItem") {
    return {
      checked: Boolean(node.attrs?.["checked"]),
      content: childrenToBlocks(node.content ?? []),
    };
  }
  throw new Error(`unhandled list-item node: ${node.type}`);
}

function tableFromNode(node: PMNode): Block {
  const rows = node.content ?? [];
  if (rows.length === 0) {
    return {
      type: "table",
      data: { header: { cells: [] }, rows: [], alignments: [] },
    };
  }
  const [headerRow, ...bodyRows] = rows;
  const header = rowFromNode(headerRow!);
  const alignments = (headerRow!.content ?? []).map((cell) =>
    coerceAlignment(cell.attrs?.["align"]),
  );
  return {
    type: "table",
    data: {
      header,
      rows: bodyRows.map(rowFromNode),
      alignments,
    },
  };
}

function rowFromNode(node: PMNode): Row {
  const cells = node.content ?? [];
  return {
    cells: cells.map((cell) => {
      const cellChildren = cell.content ?? [];
      // A cell wraps inline content in a single paragraph.
      if (cellChildren.length === 1 && cellChildren[0]!.type === "paragraph") {
        return childrenToInlines(cellChildren[0]!.content ?? []);
      }
      // Fallback: flatten everything.
      const flat: Inline[] = [];
      for (const child of cellChildren) {
        if (child.type === "paragraph") {
          flat.push(...childrenToInlines(child.content ?? []));
        }
      }
      return flat;
    }),
  };
}

function childrenToBlocks(nodes: PMNode[]): Block[] {
  const out: Block[] = [];
  for (const node of nodes) {
    const block = nodeToBlock(node);
    if (block !== null) out.push(block);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------

function childrenToInlines(nodes: PMNode[]): Inline[] {
  // PM stores marks per text node; NoteDoc nests them. We rebuild the nesting
  // by scanning the children and grouping consecutive nodes whose mark stacks
  // start with the same mark, then recursing.
  const flat: Inline[] = [];
  for (const node of nodes) {
    flat.push(...nodeToInlines(node));
  }
  return mergeAdjacentText(flat);
}

function nodeToInlines(node: PMNode): Inline[] {
  switch (node.type) {
    case "text":
      return textToInlines(node.text ?? "", node.marks ?? []);
    case "hardBreak":
      return [{ type: "line_break", data: { hard: true } }];
    case "image":
      return [
        {
          type: "image",
          data: {
            url: String(node.attrs?.["url"] ?? ""),
            alt: String(node.attrs?.["alt"] ?? ""),
            title: coerceOptionalString(node.attrs?.["title"]),
          },
        },
      ];
    case "wikiLink":
      return [
        {
          type: "wiki_link",
          data: {
            target: String(node.attrs?.["target"] ?? ""),
            alias: coerceOptionalString(node.attrs?.["alias"]),
          },
        },
      ];
    case "inlineMath":
      return [
        {
          type: "math",
          data: { display: false, src: String(node.attrs?.["src"] ?? "") },
        },
      ];
    case "blockMath":
      // Display math reached us inline — surface as display=true so the
      // serializer round-trips through the same path.
      return [
        {
          type: "math",
          data: { display: true, src: String(node.attrs?.["src"] ?? "") },
        },
      ];
    case "footnoteRef":
      return [
        {
          type: "footnote_ref",
          data: { id: String(node.attrs?.["id"] ?? "") },
        },
      ];
    case "htmlInline":
      return [
        {
          type: "html_inline",
          data: { html: String(node.attrs?.["html"] ?? "") },
        },
      ];
    default:
      throw new Error(`unhandled PM inline node: ${node.type}`);
  }
}

function textToInlines(text: string, marks: PMMark[]): Inline[] {
  if (text === "") return [];
  const segments = text.split("\n");
  const out: Inline[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i] !== "") {
      out.push(wrapWithMarks({ type: "text", data: { value: segments[i]! } }, marks));
    }
    if (i < segments.length - 1) {
      out.push({ type: "line_break", data: { hard: false } });
    }
  }
  return out;
}

/**
 * Wrap an inline in the marks (innermost first → outermost last). PM stores
 * marks in arbitrary order; NoteDoc cares only that the tree is correct, so
 * the canonical nesting is: italic ⊂ strong ⊂ strike ⊂ code ⊂ link.
 */
const MARK_ORDER = ["italic", "bold", "strike", "code", "link"] as const;

function wrapWithMarks(inner: Inline, marks: PMMark[]): Inline {
  if (marks.length === 0) return inner;
  const sorted = [...marks].sort((a, b) => markRank(a.type) - markRank(b.type));
  let current = inner;
  for (const mark of sorted) {
    current = wrapOnce(current, mark);
  }
  return current;
}

function markRank(type: string): number {
  const idx = (MARK_ORDER as readonly string[]).indexOf(type);
  return idx === -1 ? MARK_ORDER.length : idx;
}

function wrapOnce(inner: Inline, mark: PMMark): Inline {
  switch (mark.type) {
    case "italic":
      return { type: "emphasis", data: { content: [inner] } };
    case "bold":
      return { type: "strong", data: { content: [inner] } };
    case "strike":
      return { type: "strikethrough", data: { content: [inner] } };
    case "code":
      // The code MARK can only wrap a single text inline. Anything else means
      // the PM tree is malformed for our schema; flatten to text.
      if (inner.type === "text") {
        return { type: "code", data: { value: inner.data.value } };
      }
      return inner;
    case "link":
      return {
        type: "link",
        data: {
          url: String(mark.attrs?.["href"] ?? ""),
          title: coerceOptionalString(mark.attrs?.["title"]),
          content: [inner],
        },
      };
    default:
      return inner;
  }
}

// ---------------------------------------------------------------------------
// Merge adjacent text nodes that share the same mark stack so the result
// matches the canonical NoteDoc shape produced by `markdown::parse` in Rust.
// ---------------------------------------------------------------------------

function mergeAdjacentText(inlines: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const inline of inlines) {
    const recursed = recurseInlineMerge(inline);
    const prev = out[out.length - 1];
    if (prev && prev.type === "text" && recursed.type === "text") {
      out[out.length - 1] = {
        type: "text",
        data: { value: prev.data.value + recursed.data.value },
      };
    } else {
      out.push(recursed);
    }
  }
  return out;
}

function recurseInlineMerge(inline: Inline): Inline {
  switch (inline.type) {
    case "emphasis":
      return { type: "emphasis", data: { content: mergeAdjacentText(inline.data.content) } };
    case "strong":
      return { type: "strong", data: { content: mergeAdjacentText(inline.data.content) } };
    case "strikethrough":
      return {
        type: "strikethrough",
        data: { content: mergeAdjacentText(inline.data.content) },
      };
    case "link":
      return {
        type: "link",
        data: { ...inline.data, content: mergeAdjacentText(inline.data.content) },
      };
    default:
      return inline;
  }
}

function collectText(nodes: PMNode[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += node.text ?? "";
    else if (node.content) out += collectText(node.content);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Coercers
// ---------------------------------------------------------------------------

function clampHeading(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  const clamped = Math.max(1, Math.min(6, Math.floor(n)));
  return clamped;
}

function clampStart(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

const CALLOUT_KINDS: readonly CalloutKind[] = ["note", "tip", "info", "warning", "caution"];

function coerceCalloutKind(raw: unknown): CalloutKind {
  return typeof raw === "string" && (CALLOUT_KINDS as readonly string[]).includes(raw)
    ? (raw as CalloutKind)
    : "note";
}

const ALIGNMENTS: readonly Alignment[] = ["none", "left", "center", "right"];

function coerceAlignment(raw: unknown): Alignment {
  return typeof raw === "string" && (ALIGNMENTS as readonly string[]).includes(raw)
    ? (raw as Alignment)
    : "none";
}

function coerceOptionalString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  return String(raw);
}
