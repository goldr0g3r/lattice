/**
 * Inline and block math nodes — `$..$` and `$$..$$` in Markdown.
 *
 * Both nodes are atom-style (their `src` lives in `attrs.src`, not as text
 * content). v0.2 PR #5 (this file) wires KaTeX into the live editor via
 * a TipTap React node-view; the [`parseHTML`](#parseHTML) /
 * [`renderHTML`](#renderHTML) paths intentionally stay untouched so the
 * NoteDoc <-> ProseMirror converter pair and its 13-fixture corpus stay
 * byte-identical (D4 in
 * [`../components/MathInline.tsx`](../components/MathInline.tsx) — the
 * canonical home for the math-rendering design decisions). KaTeX HTML
 * lives **only** inside the live `addNodeView()` DOM, never in the
 * serialised HTML.
 *
 * Headless contexts (vitest's default node env, the conversion corpus
 * test, server-side Markdown round-trip) never instantiate the node-view
 * because TipTap only calls `addNodeView()` from inside a live
 * `EditorView` — and the editor view itself only mounts under jsdom in
 * this package's `*.test.tsx` files (D5).
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { MathBlock as MathBlockView } from "../components/MathBlock";
import { MathInline as MathInlineView } from "../components/MathInline";

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-src") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-src": String(attrs.src ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "code[data-math='inline']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "code",
      mergeAttributes(HTMLAttributes, { "data-math": "inline" }),
      String(node.attrs.src ?? ""),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView, { as: "span" });
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-src") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-src": String(attrs.src ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-math='block']" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-math": "block" }),
      ["code", String(node.attrs.src ?? "")],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView, { as: "div" });
  },
});
