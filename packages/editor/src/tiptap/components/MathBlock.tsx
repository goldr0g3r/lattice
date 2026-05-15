/**
 * React node-view for the `blockMath` TipTap atom (`$$..$$` in Markdown).
 *
 * Mirror of [`MathInline`](./MathInline.tsx) with `displayMode: true` and a
 * block-level `<div>` wrapper that centers the rendered output and gives it
 * the editor's `--space-4` vertical rhythm. All design decisions are
 * documented in [`MathInline.tsx`](./MathInline.tsx) — read that file
 * first.
 */

import katex from "katex";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useMemo } from "react";

export function MathBlock(props: NodeViewProps) {
  const src = String(props.node.attrs["src"] ?? "");
  const html = useMemo(
    () =>
      katex.renderToString(src, {
        displayMode: true,
        throwOnError: false,
        output: "html",
      }),
    [src],
  );

  return (
    <NodeViewWrapper
      as="div"
      className="lattice-math lattice-math--block"
      data-math="block"
      data-src={src}
    >
      <div
        className="lattice-math__render"
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </NodeViewWrapper>
  );
}
