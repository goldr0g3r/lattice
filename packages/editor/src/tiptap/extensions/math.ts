/**
 * Inline and block math nodes — `$..$` and `$$..$$` in Markdown.
 *
 * Both nodes are atom-style (their `src` lives in `attrs.src`, not as text
 * content). v0.2 PR #5 wires KaTeX into both renderHTML paths; for now they
 * render the raw LaTeX in a `<code>` so the user can still see it.
 */

import { Node, mergeAttributes } from "@tiptap/core";

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
});
