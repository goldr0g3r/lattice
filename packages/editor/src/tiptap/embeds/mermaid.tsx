/**
 * Mermaid React node-view (v0.2 PR #6 — embeds slice, issue #37).
 *
 * Renders the body of a ```` ```mermaid ```` fenced block as an SVG via
 * the upstream `mermaid` package (v11+). Lazy-loaded per D8 in
 * [`./node-view-dispatcher.ts`](./node-view-dispatcher.ts) — the
 * dynamic `import("mermaid")` resolves only the first time a Mermaid
 * block mounts in a session, so apps that never touch a Mermaid block
 * don't pay the bundle cost.
 *
 * Lifecycle:
 *
 *   1. **First render** — `state.kind === "idle"`. Wrapper carries
 *      `data-mermaid` immediately so the dispatcher's routing assert
 *      fires before the async render completes. The body of the
 *      wrapper shows a "Rendering diagram…" placeholder while the
 *      dynamic import is in flight.
 *   2. **`useEffect`** — dynamic-imports `mermaid`, calls
 *      `mermaid.initialize({ ..., securityLevel: "strict" })` (D7 —
 *      prevents inline JS / external network from a malicious diagram
 *      source), then `mermaid.render(id, src)` and writes the returned
 *      SVG into `state.svg`.
 *   3. **On render failure (D5)** — surface a
 *      `<div data-mermaid-error>` carrying the parser message and the
 *      raw source in a `<pre>` instead of crashing the editor.
 *
 * The mermaid theme name maps to the editor's current colour theme via
 * `data-theme` on `<html>` — `theme: "default"` for light mode,
 * `theme: "dark"` when `document.documentElement.dataset.theme` is
 * `"dark"`. The wrapper itself drives spacing from CSS variables
 * declared in `@lattice/ui/tokens.css` (D6).
 */

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";

type RenderState =
  | { kind: "idle" }
  | { kind: "rendered"; svg: string }
  | { kind: "error"; message: string };

let mermaidIdCounter = 0;

function nextMermaidId(): string {
  mermaidIdCounter += 1;
  // Mermaid uses the id both as the SVG root id and as a CSS selector
  // target while rendering; we keep it unique per node-view instance so
  // multiple Mermaid blocks in the same document don't collide on
  // remount.
  return `lattice-mermaid-${mermaidIdCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveTheme(): "default" | "dark" {
  if (typeof document === "undefined") return "default";
  return document.documentElement.dataset["theme"] === "dark" ? "dark" : "default";
}

export function MermaidEmbed(props: NodeViewProps) {
  const src = String(props.node.attrs["body"] ?? "");
  const [state, setState] = useState<RenderState>({ kind: "idle" });
  const idRef = useRef<string>(nextMermaidId());

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (src.trim() === "") {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolveTheme(),
          fontFamily: "var(--font-mono)",
        });
        const result = await mermaid.render(idRef.current, src);
        if (cancelled) return;
        setState({ kind: "rendered", svg: result.svg });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <NodeViewWrapper
      as="div"
      data-mermaid=""
      data-info="mermaid"
      contentEditable={false}
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md, 0.375rem)",
        margin: "var(--space-4, 1rem) 0",
        overflow: "auto",
        padding: "var(--space-3, 0.75rem) var(--space-4, 1rem)",
      }}
    >
      {state.kind === "rendered" ? (
        <div
          className="lattice-embed__svg"
          dangerouslySetInnerHTML={{ __html: state.svg }}
          style={{ display: "flex", justifyContent: "center" }}
        />
      ) : state.kind === "error" ? (
        <div
          data-mermaid-error=""
          style={{
            color: "var(--color-danger, #cc0000)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2, 0.5rem)",
          }}
        >
          <strong>Mermaid render failed</strong>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem" }}>
            {state.message}
          </div>
          <pre
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm, 0.25rem)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.8125rem",
              margin: 0,
              padding: "var(--space-2, 0.5rem)",
              whiteSpace: "pre-wrap",
            }}
          >
            <code>{src}</code>
          </pre>
        </div>
      ) : (
        <div
          aria-busy="true"
          className="lattice-embed__placeholder"
          style={{
            color: "var(--text-secondary, var(--color-fg-muted))",
            fontFamily: "var(--font-sans)",
            fontSize: "var(--text-sm)",
            padding: "var(--space-2, 0.5rem) 0",
          }}
        >
          Rendering diagram…
        </div>
      )}
    </NodeViewWrapper>
  );
}
