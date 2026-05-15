/**
 * TipTap extension set that defines our editor schema.
 *
 * One TipTap node per [`NoteDoc`] `Block` variant, one TipTap mark per inline
 * styling, custom inline nodes for things that don't wrap content (wiki-links,
 * math, footnote refs, hard breaks, raw inline HTML).
 *
 * The conversion functions in `from-doc.ts` / `to-doc.ts` map one-to-one
 * against this set, so any time we add a `NoteDoc` variant in `core-bindings`
 * we must add a matching extension here AND update the conversion functions.
 * The Vitest contract in `__tests__/conversion.test.ts` is the safety net.
 */

import type { Extension } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";

import { Callout } from "./extensions/callout";
import { Fenced } from "./extensions/fenced";
import { FootnoteDefinition, FootnoteReference } from "./extensions/footnote";
import { HtmlBlock, HtmlInline } from "./extensions/html-block";
import { Image } from "./extensions/image";
import { BlockMath, InlineMath } from "./extensions/math";
import { WikiLink, type WikiLinkOptions } from "./extensions/wiki-link";

export interface BuildExtensionsOptions {
  /** Forwarded to `@tiptap/extension-placeholder`. */
  placeholder?: string;
  /**
   * Forwarded to the WikiLink extension's `.configure(...)` call. Omit to
   * keep the no-op defaults (empty suggestions list + console-log navigate)
   * defined in `defaultWikiLinkOptions`.
   */
  wikiLink?: Partial<WikiLinkOptions>;
}

/**
 * Build the canonical Lattice editor extension list.
 *
 * The `placeholder` argument lets the desktop shell customise the empty-doc
 * hint without forking the schema. The `wikiLink` argument lets the shell
 * inject a vault-backed data source + an "open or create" navigation
 * handler — see [`WikiLinkOptions`](./extensions/wiki-link.ts).
 */
export function buildExtensions(options: BuildExtensionsOptions = {}): Extension[] {
  // `StarterKit` already covers paragraph, heading, bulletList, orderedList,
  // listItem, blockquote, horizontalRule (= thematicBreak), code (mark),
  // hardBreak, strike, bold, italic. We disable the bits we replace with
  // custom nodes (codeBlock, link) so there's exactly one mapping per
  // NoteDoc variant.
  const starter = StarterKit.configure({
    codeBlock: false,
    // StarterKit's StrikeMark uses `~` GFM-style which is what we want.
    // We let StarterKit ship its built-in link… actually we override:
  }) as unknown as Extension;

  return [
    starter,
    Link.configure({ openOnClick: false, autolink: false }),
    CodeBlock.configure({ HTMLAttributes: { "data-code-block": "true" } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    // Lattice-specific extensions:
    Callout,
    Fenced,
    InlineMath,
    BlockMath,
    options.wikiLink ? WikiLink.configure(options.wikiLink) : WikiLink,
    Image,
    FootnoteReference,
    FootnoteDefinition,
    HtmlBlock,
    HtmlInline,
    Placeholder.configure({
      placeholder: options.placeholder ?? "Type / for commands…",
    }),
  ] as Extension[];
}

/** Names of every node our schema knows about (for `to-doc` exhaustiveness). */
export const LATTICE_NODE_NAMES = [
  // From StarterKit + replacements
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "hardBreak",
  "codeBlock",
  "text",
  // GFM tables
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  // GFM tasks
  "taskList",
  "taskItem",
  // Lattice extensions
  "callout",
  "fenced",
  "inlineMath",
  "blockMath",
  "wikiLink",
  "image",
  "footnoteRef",
  "footnoteDefinition",
  "htmlBlock",
  "htmlInline",
] as const;

export type LatticeNodeName = (typeof LATTICE_NODE_NAMES)[number];
