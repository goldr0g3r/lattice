/**
 * `@lattice/editor/tiptap/embeds` — Mermaid + Excalidraw fenced-block
 * embeds (v0.2 PR #6, issue #37).
 *
 * Public surface:
 *
 *   - [`latticeFencedNodeView`](./node-view-dispatcher.ts) — TipTap
 *     `NodeViewRenderer` factory consumed by
 *     [`../extensions/fenced.ts`](../extensions/fenced.ts)'s
 *     `addNodeView()`. Routes per-instance to Mermaid / Excalidraw /
 *     CodeMirror based on `node.attrs.info` (D1).
 *   - [`MermaidEmbed`](./mermaid.tsx) — React node-view that
 *     lazy-loads the `mermaid` package and renders an SVG.
 *   - [`ExcalidrawEmbed`](./excalidraw.tsx) — read-only placeholder
 *     card for v0.2 (the actual `<Excalidraw>` canvas lands in a
 *     follow-up PR — see the TODO in `excalidraw.tsx`).
 *   - [`isMermaidInfo`](./node-view-dispatcher.ts) /
 *     [`isExcalidrawInfo`](./node-view-dispatcher.ts) — info-string
 *     predicates the dispatcher uses; re-exported so tests and
 *     downstream tooling can assert routing without re-implementing
 *     the canonical list.
 *
 * All eight design decisions (D1–D8) live as JSDoc at the top of
 * `./node-view-dispatcher.ts`.
 */

export { ExcalidrawEmbed } from "./excalidraw";
export { MermaidEmbed } from "./mermaid";
export { isExcalidrawInfo, isMermaidInfo, latticeFencedNodeView } from "./node-view-dispatcher";
