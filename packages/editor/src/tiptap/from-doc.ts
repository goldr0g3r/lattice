/**
 * Convert a [`NoteDoc`] into ProseMirror JSON ready for `useEditor`.
 *
 * Pattern-matches every `Block` / `Inline` variant onto the TipTap node names
 * declared in [`schema.ts`](./schema.ts). The inverse — `proseMirrorToNoteDoc`
 * — lives next door in [`to-doc.ts`](./to-doc.ts). Both are pure and the
 * contract `proseMirrorToNoteDoc(noteDocToProseMirror(d)) === d` is enforced
 * by the corpus test in `__tests__/conversion.test.ts`.
 *
 * Frontmatter is intentionally passed through outside of this layer — the
 * editor only sees block + inline content; the desktop shell re-attaches the
 * original `Frontmatter` when serialising back to disk.
 */

import type {
  Alignment,
  Block,
  CalloutKind,
  Inline,
  ListItem,
  NoteDoc,
  Row,
} from "@lattice/core-bindings";

/** Minimal ProseMirror JSON shape we emit. */
export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Map a [`NoteDoc`] body to a ProseMirror `doc` node. */
export function noteDocToProseMirror(doc: NoteDoc): PMNode {
  const content = doc.body.map(blockToPM);
  const root: PMNode = {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
  promoteTaskLists(root);
  return root;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function blockToPM(block: Block): PMNode {
  switch (block.type) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: block.data.level },
        content: inlinesToPM(block.data.content),
      };
    case "paragraph":
      return {
        type: "paragraph",
        content: inlinesToPM(block.data.content),
      };
    case "bullet_list":
      return { type: "bulletList", content: block.data.items.map(itemToPM) };
    case "ordered_list":
      return {
        type: "orderedList",
        attrs: { start: block.data.start },
        content: block.data.items.map(itemToPM),
      };
    case "blockquote":
      return {
        type: "blockquote",
        content: block.data.content.map(blockToPM),
      };
    case "callout":
      return {
        type: "callout",
        attrs: { kind: block.data.kind },
        content: block.data.body.map(blockToPM),
      };
    case "fenced":
      return {
        type: "fenced",
        attrs: { info: block.data.info, body: block.data.body },
      };
    case "math":
      return { type: "blockMath", attrs: { src: block.data.src } };
    case "table":
      return tableToPM(block.data.header, block.data.rows, block.data.alignments);
    case "thematic_break":
      return { type: "horizontalRule" };
    case "html_block":
      return { type: "htmlBlock", attrs: { html: block.data.html } };
    case "footnote_definition":
      return {
        type: "footnoteDefinition",
        attrs: { id: block.data.id },
        content: block.data.content.map(blockToPM),
      };
    default: {
      const _exhaustive: never = block;
      throw new Error(`unhandled NoteDoc block: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function itemToPM(item: ListItem): PMNode {
  // GFM task list items become TipTap `taskItem` nodes (which require a
  // `taskList` wrapper — handled below in the list-promotion pass). For plain
  // items we emit `listItem`. To keep the inverse function purely structural
  // we mark task items inline by setting `attrs.checked`; the parent list
  // wrapper is rewritten in `from-doc` only when EVERY item is a task.
  const content = item.content.map(blockToPM);
  if (item.checked === null) {
    return { type: "listItem", content };
  }
  return {
    type: "taskItem",
    attrs: { checked: item.checked },
    content,
  };
}

function tableToPM(header: Row, rows: Row[], alignments: Alignment[]): PMNode {
  const headerRow: PMNode = {
    type: "tableRow",
    content: header.cells.map((cell, i) => ({
      type: "tableHeader",
      attrs: { align: alignments[i] ?? "none" },
      content: [{ type: "paragraph", content: inlinesToPM(cell) }],
    })),
  };
  const bodyRows: PMNode[] = rows.map((row) => ({
    type: "tableRow",
    content: row.cells.map((cell, i) => ({
      type: "tableCell",
      attrs: { align: alignments[i] ?? "none" },
      content: [{ type: "paragraph", content: inlinesToPM(cell) }],
    })),
  }));
  return { type: "table", content: [headerRow, ...bodyRows] };
}

// ---------------------------------------------------------------------------
// Post-processing: promote `bulletList` of all-task items to `taskList`
// ---------------------------------------------------------------------------

/**
 * Walk a PM tree and, where a `bulletList` only contains `taskItem` children,
 * relabel the wrapper to `taskList`. TipTap's `@tiptap/extension-task-list`
 * requires this discipline.
 */
function promoteTaskLists(node: PMNode): void {
  if (!node.content) return;
  for (const child of node.content) promoteTaskLists(child);
  if (node.type === "bulletList") {
    const allTasks =
      node.content.length > 0 && node.content.every((child) => child.type === "taskItem");
    if (allTasks) node.type = "taskList";
  }
}

// ---------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------

function inlinesToPM(inlines: Inline[]): PMNode[] {
  const out: PMNode[] = [];
  for (const inline of inlines) {
    pushInline(out, inline, []);
  }
  return out;
}

function pushInline(out: PMNode[], inline: Inline, marks: PMMark[]): void {
  switch (inline.type) {
    case "text":
      pushText(out, inline.data.value, marks);
      break;
    case "emphasis":
      for (const child of inline.data.content) {
        pushInline(out, child, [...marks, { type: "italic" }]);
      }
      break;
    case "strong":
      for (const child of inline.data.content) {
        pushInline(out, child, [...marks, { type: "bold" }]);
      }
      break;
    case "strikethrough":
      for (const child of inline.data.content) {
        pushInline(out, child, [...marks, { type: "strike" }]);
      }
      break;
    case "code":
      pushText(out, inline.data.value, [...marks, { type: "code" }]);
      break;
    case "link": {
      const linkMark: PMMark = {
        type: "link",
        attrs: {
          href: inline.data.url,
          title: inline.data.title,
        },
      };
      for (const child of inline.data.content) {
        pushInline(out, child, [...marks, linkMark]);
      }
      break;
    }
    case "image":
      out.push({
        type: "image",
        attrs: {
          url: inline.data.url,
          alt: inline.data.alt,
          title: inline.data.title,
        },
      });
      break;
    case "wiki_link":
      out.push({
        type: "wikiLink",
        attrs: { target: inline.data.target, alias: inline.data.alias },
      });
      break;
    case "math":
      out.push({
        type: inline.data.display ? "blockMath" : "inlineMath",
        attrs: { src: inline.data.src },
      });
      break;
    case "footnote_ref":
      out.push({ type: "footnoteRef", attrs: { id: inline.data.id } });
      break;
    case "line_break":
      if (inline.data.hard) {
        out.push({ type: "hardBreak", marks: marks.length > 0 ? marks : undefined });
      } else {
        // Soft breaks live inside a text node as a literal `\n`. The inverse
        // converter splits them back out so the round-trip is total.
        pushText(out, "\n", marks);
      }
      break;
    case "html_inline":
      out.push({
        type: "htmlInline",
        attrs: { html: inline.data.html },
      });
      break;
    default: {
      const _exhaustive: never = inline;
      throw new Error(`unhandled NoteDoc inline: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function pushText(out: PMNode[], value: string, marks: PMMark[]): void {
  if (value === "") return;
  // Merge with the previous text node when marks match exactly — keeps the
  // PM document compact and matches what TipTap would produce on its own.
  const prev = out[out.length - 1];
  if (prev?.type === "text" && marksEqual(prev.marks, marks)) {
    prev.text = (prev.text ?? "") + value;
    return;
  }
  out.push({
    type: "text",
    text: value,
    marks: marks.length > 0 ? marks.map(cloneMark) : undefined,
  });
}

function cloneMark(mark: PMMark): PMMark {
  return mark.attrs === undefined
    ? { type: mark.type }
    : { type: mark.type, attrs: { ...mark.attrs } };
}

function marksEqual(a: PMMark[] | undefined, b: PMMark[]): boolean {
  const left = a ?? [];
  if (left.length !== b.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i]!.type !== b[i]!.type) return false;
    if (JSON.stringify(left[i]!.attrs ?? null) !== JSON.stringify(b[i]!.attrs ?? null)) {
      return false;
    }
  }
  return true;
}

// Compile-time check that CalloutKind values are still string literals (used
// directly as `Block::Callout.data.kind` strings inside `blockToPM`).
const _calloutKindTypeCheck: CalloutKind = "note";
void _calloutKindTypeCheck;
