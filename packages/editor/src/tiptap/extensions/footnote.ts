/**
 * GFM footnote definition + reference. The reference is an inline atom; the
 * definition is a block node holding inline / block content.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const FootnoteReference = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-id") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-id": String(attrs.id ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote-ref]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, { "data-footnote-ref": "true" }),
      `[^${String(node.attrs.id ?? "")}]`,
    ];
  },
});

export const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-id") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-id": String(attrs.id ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-footnote-definition]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-footnote-definition": "true" }), 0];
  },
});
