/**
 * Lattice fenced block — every ` ```info ` block in Markdown, including plain
 * code, ``` ```mermaid ``` `, and ``` ```excalidraw ``` `.
 *
 * v0.2 PR #2 ships this as an atom node: `info` and `body` both live as
 * attributes, the editor renders read-only `<pre><code>` content with no
 * inline editing inside the block. v0.2 PR #3 swaps this for a node-view
 * hosting a CodeMirror 6 instance; v0.2 PR #5 renders mermaid / excalidraw /
 * KaTeX from the same node.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const Fenced = Node.create({
  name: "fenced",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      info: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-info") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-info": String(attrs.info ?? ""),
        }),
      },
      body: {
        default: "",
        parseHTML: (el): string => {
          const code = el.querySelector("code");
          return code?.textContent ?? el.textContent ?? "";
        },
        renderHTML: (): Record<string, string> => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-fenced]", preserveWhitespace: "full" as const }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-fenced": "true" }),
      ["code", String(node.attrs.body ?? "")],
    ];
  },
});
