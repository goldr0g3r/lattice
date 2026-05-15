/**
 * React node-view for the `inlineMath` TipTap atom (`$..$` in Markdown).
 *
 * v0.2 PR #5 — KaTeX math rendering. Design decisions live here as the
 * first file written and apply to both [`MathInline`](./MathInline.tsx)
 * and [`MathBlock`](./MathBlock.tsx):
 *
 *   - D1 — library: **KaTeX**, not MathJax. `katex.renderToString` is the
 *     server-side renderer (works in node, so jsdom tests can mount the
 *     editor without polyfilling), produces self-contained HTML +
 *     MathML, and ships a single ~280 KB minified bundle.
 *   - D2 — node-view shape: `inlineMath` / `blockMath` keep their atom
 *     attrs (`src: string`) unchanged. The React component reads
 *     `node.attrs.src` and injects the rendered HTML via
 *     `dangerouslySetInnerHTML`. **Read-only in this PR** — clicking to
 *     edit the source is a follow-up (out of scope).
 *   - D3 — error UX: `throwOnError: false` makes KaTeX emit a
 *     `<span class="katex-error">` for malformed input and KaTeX styles
 *     that on its own. We do not swallow the rendered error.
 *   - D4 — round-trip: the [`parseHTML`](../extensions/math.ts) and
 *     [`renderHTML`](../extensions/math.ts) paths still emit
 *     `<code data-math='inline'>` / `<pre data-math='block'>` with the
 *     raw `src`. KaTeX HTML lives **only** inside the live
 *     `addNodeView()` DOM, so the 13-fixture conversion corpus stays
 *     byte-identical with zero edits.
 *   - D5 — SSR / jsdom: `renderToString` is pure — it does not touch the
 *     DOM. We still call it lazily inside the component so the import
 *     graph remains side-effect free.
 *   - D6 — design tokens: KaTeX owns the math typography (CMU Serif via
 *     `katex/dist/katex.min.css`). The Lattice wrapper element pulls
 *     spacing / accent colour from `@lattice/ui/tokens.css` (see
 *     [`../math.css`](../math.css)) so math sits in the editor's
 *     vertical rhythm.
 *   - D7 — CSS delivery: two files, two import paths. Apps load
 *     `@lattice/editor/math.css` (re-export of `katex.min.css` so the
 *     KaTeX fonts resolve) and `@lattice/editor/math-wrapper.css` (our
 *     token-driven container). Splitting keeps the heavy KaTeX styles
 *     opt-in for headless consumers and out of the CodeMirror PR's
 *     `Editor.css` editing surface.
 *   - D8 — Mermaid + Excalidraw are intentionally out of scope. Both
 *     queue behind the CodeMirror node-view pattern that lands in
 *     [PR #55](https://github.com/goldr0g3r/lattice/pull/55) so the
 *     three embeds (math / mermaid / excalidraw) can share one
 *     React-node-view shape. Tracked under issue #37.
 */

import katex from "katex";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useMemo } from "react";

export function MathInline(props: NodeViewProps) {
  const src = String(props.node.attrs["src"] ?? "");
  const html = useMemo(
    () =>
      katex.renderToString(src, {
        displayMode: false,
        throwOnError: false,
        output: "html",
      }),
    [src],
  );

  return (
    <NodeViewWrapper
      as="span"
      className="lattice-math lattice-math--inline"
      data-math="inline"
      data-src={src}
    >
      <span
        className="lattice-math__render"
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </NodeViewWrapper>
  );
}
