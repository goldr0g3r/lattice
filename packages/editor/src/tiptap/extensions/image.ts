/**
 * Inline image — `![alt](url "title")` in Markdown.
 *
 * Atom inline node so the editor doesn't allow caret traversal through the
 * `<img>` itself. Asset upload / vault-relative path resolution lives in
 * v0.2 PR #5 (KaTeX / Mermaid / Excalidraw embeds + attachment handling per
 * ADR-0016); this extension only models the data so the converter is total.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const Image = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (el): string => el.getAttribute("src") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          src: String(attrs.url ?? ""),
        }),
      },
      alt: {
        default: "",
        parseHTML: (el): string => el.getAttribute("alt") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          alt: String(attrs.alt ?? ""),
        }),
      },
      title: {
        default: null as string | null,
        parseHTML: (el): string | null => el.getAttribute("title"),
        renderHTML: (attrs): Record<string, string> => {
          const title = attrs.title;
          return title === null || title === undefined ? {} : { title: String(title) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});
