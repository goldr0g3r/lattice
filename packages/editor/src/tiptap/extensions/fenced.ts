/**
 * Lattice fenced block — every ` ```info ` block in Markdown, including plain
 * code, ``` ```mermaid ``` `, and ``` ```excalidraw ``` `.
 *
 * v0.2 PR #2 shipped this as a read-only atom node (`info` / `body` as
 * attributes, `<pre><code>` rendering, no inline editing). v0.2 PR #3
 * (this file) swaps the renderer for a TipTap node-view that mounts a real
 * CodeMirror 6 instance inside the block via
 * [`latticeCodeMirrorNodeView`](../codemirror/node-view.ts). The
 * `attrs: { info, body }` shape is unchanged (D6 in
 * [`codemirror/languages.ts`](../codemirror/languages.ts)) so the
 * NoteDoc <-> ProseMirror converter pair and its 13-fixture corpus stay
 * untouched.
 *
 * Headless contexts (vitest's default node env, the conversion corpus
 * test) never instantiate the node-view because TipTap only calls
 * `addNodeView()` from inside a live `EditorView` — and the editor view
 * itself only mounts under jsdom in this package's `*.test.tsx` files.
 */

import { Node, mergeAttributes } from "@tiptap/core";

import { latticeCodeMirrorNodeView } from "../codemirror/node-view";

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
    // SSR / copy-paste fallback. Live editing uses `addNodeView` below.
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-fenced": "true" }),
      ["code", String(node.attrs.body ?? "")],
    ];
  },

  addNodeView() {
    return latticeCodeMirrorNodeView();
  },
});
