/**
 * Slash command palette items.
 *
 * Each item carries a label, optional aliases used for fuzzy filtering, the
 * `lucide-react` icon to show in the menu, and a `command` that runs against
 * the live TipTap `Editor` to insert / replace the slash range.
 *
 * The list is intentionally exported as a stable value so downstream code
 * (the v0.9 plugin SDK in particular) can subclass / extend it.
 */

import type { Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Info,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Sigma,
  Table as TableIcon,
} from "lucide-react";

import type { CalloutKind } from "@lattice/core-bindings";

export interface SlashItem {
  /** Stable id for keyboard navigation + testing. */
  id: string;
  /** Display label. */
  label: string;
  /** Lowercase aliases the fuzzy matcher will accept. */
  aliases: string[];
  /** Icon component (Lucide). */
  icon: LucideIcon;
  /** Run the command against the editor; the caller has already deleted the slash range. */
  command: (editor: Editor) => void;
}

const calloutItem = (kind: CalloutKind, label: string): SlashItem => ({
  id: `callout-${kind}`,
  label,
  aliases: ["callout", kind],
  icon: Info,
  command: (editor) => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "callout",
        attrs: { kind },
        content: [{ type: "paragraph" }],
      })
      .run();
  },
});

/** Canonical slash-menu insert set, in display order. */
export const slashItems: readonly SlashItem[] = [
  {
    id: "paragraph",
    label: "Paragraph",
    aliases: ["paragraph", "p", "text"],
    icon: Pilcrow,
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    aliases: ["heading", "h1", "title"],
    icon: Heading1,
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 1 }).run();
    },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    aliases: ["heading", "h2", "subtitle"],
    icon: Heading2,
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 2 }).run();
    },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    aliases: ["heading", "h3"],
    icon: Heading3,
    command: (editor) => {
      editor.chain().focus().setHeading({ level: 3 }).run();
    },
  },
  {
    id: "bullet-list",
    label: "Bullet list",
    aliases: ["list", "unordered", "ul"],
    icon: List,
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    id: "ordered-list",
    label: "Ordered list",
    aliases: ["list", "numbered", "ol"],
    icon: ListOrdered,
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    id: "task-list",
    label: "Task list",
    aliases: ["task", "todo", "checklist"],
    icon: CheckSquare,
    command: (editor) => {
      // `taskList` is provided by `@tiptap/extension-task-list` which augments
      // the chain commands typing at runtime; cast is the standard workaround.
      (editor.chain().focus() as unknown as { toggleTaskList: () => { run: () => void } })
        .toggleTaskList()
        .run();
    },
  },
  {
    id: "blockquote",
    label: "Quote",
    aliases: ["quote", "blockquote"],
    icon: Quote,
    command: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    },
  },
  calloutItem("note", "Callout / Note"),
  calloutItem("tip", "Callout / Tip"),
  calloutItem("info", "Callout / Info"),
  calloutItem("warning", "Callout / Warning"),
  calloutItem("caution", "Callout / Caution"),
  {
    id: "fenced",
    label: "Code block",
    aliases: ["code", "fence", "pre"],
    icon: Code,
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({ type: "fenced", attrs: { info: "", body: "" } })
        .run();
    },
  },
  {
    id: "math-block",
    label: "Math block",
    aliases: ["math", "katex", "latex"],
    icon: Sigma,
    command: (editor) => {
      editor
        .chain()
        .focus()
        .insertContent({ type: "blockMath", attrs: { src: "" } })
        .run();
    },
  },
  {
    id: "table",
    label: "Table",
    aliases: ["table", "grid"],
    icon: TableIcon,
    command: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    id: "thematic-break",
    label: "Divider",
    aliases: ["hr", "divider", "rule"],
    icon: Minus,
    command: (editor) => {
      editor.chain().focus().setHorizontalRule().run();
    },
  },
];

/** Case-insensitive substring + alias fuzzy match. */
export function filterSlashItems(items: readonly SlashItem[], query: string): SlashItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...items];
  return items.filter((item) => {
    if (item.label.toLowerCase().includes(needle)) return true;
    return item.aliases.some((alias) => alias.includes(needle));
  });
}
