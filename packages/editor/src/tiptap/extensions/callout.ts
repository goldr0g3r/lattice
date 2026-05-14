/**
 * Lattice callout block — `> [!note|tip|info|warning|caution]` in Markdown.
 *
 * Renders as a `<aside data-callout="kind">` so CSS in `Editor.css` can apply
 * the per-kind accent colour from `@lattice/ui` design tokens.
 */

import { Node, mergeAttributes } from "@tiptap/core";

import type { CalloutKind } from "@lattice/core-bindings";

const CALLOUT_KINDS: readonly CalloutKind[] = ["note", "tip", "info", "warning", "caution"];

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "note" as CalloutKind,
        parseHTML: (el): CalloutKind => {
          const raw = el.getAttribute("data-callout") ?? "note";
          return (CALLOUT_KINDS as readonly string[]).includes(raw) ? (raw as CalloutKind) : "note";
        },
        renderHTML: (attrs): Record<string, string> => ({
          "data-callout": String(attrs.kind ?? "note"),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes), 0];
  },
});
