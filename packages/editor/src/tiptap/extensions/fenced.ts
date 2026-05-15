/**
 * Lattice fenced block — every ` ```info ` block in Markdown, including
 * plain code, ``` ```mermaid ``` `, and ``` ```excalidraw ``` `.
 *
 * v0.2 PR #2 shipped this as a read-only atom node (`info` / `body` as
 * attributes, `<pre><code>` rendering, no inline editing). v0.2 PR #3
 * swapped the renderer for a TipTap node-view that mounts a real
 * CodeMirror 6 instance inside the block via
 * [`latticeCodeMirrorNodeView`](../codemirror/node-view.ts). v0.2 PR #6
 * (this edit) routes ` ```mermaid ` and ` ```excalidraw ` blocks through
 * the new [`latticeFencedNodeView`](../embeds/node-view-dispatcher.ts)
 * dispatcher, which picks Mermaid / Excalidraw / CodeMirror per-instance
 * based on `node.attrs.info` (D1 in the dispatcher's JSDoc). Non-embed
 * info-strings still hand off to the same CM6 factory PR #3 wired in,
 * bit-identical.
 *
 * The `attrs: { info, body }` shape, `parseHTML`, and `renderHTML` are
 * **unchanged** (D4 in the dispatcher) — the NoteDoc <-> ProseMirror
 * converter pair, the 13-fixture conversion corpus, and the 26-fixture
 * Markdown round-trip corpus stay untouched and byte-identical.
 *
 * Headless contexts (vitest's default node env, the conversion corpus
 * test) never instantiate the node-view because TipTap only calls
 * `addNodeView()` from inside a live `EditorView` — and the editor view
 * itself only mounts under jsdom in this package's `*.test.tsx` files.
 */

import { Node, mergeAttributes } from "@tiptap/core";

import { latticeFencedNodeView } from "../embeds";

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
    return latticeFencedNodeView();
  },
});
