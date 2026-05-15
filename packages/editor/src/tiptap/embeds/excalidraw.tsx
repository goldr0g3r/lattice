/**
 * Excalidraw read-only embed React node-view (v0.2 PR #6 — embeds slice,
 * issue #37).
 *
 * For v0.2 this renders a **placeholder card** that surfaces the
 * `.excalidraw.json` sidecar path stored in the fenced block's `body`
 * (per [ADR-0017](../../../../../../docs/decisions/0017-excalidraw-embed-storage.md)
 * the body is the relative attachment path; the matching
 * `.excalidraw.json` is what the editor will load once the desktop
 * shell exposes a `vault_read_file` IPC command). The placeholder card
 * intentionally does NOT instantiate `<Excalidraw>` yet — read-only
 * canvas mounting depends on having actual scene JSON to feed it, and
 * the vault-IO IPC is out-of-scope for this PR's file boundary (no
 * `apps/desktop/` or Rust edits in this slice).
 *
 * # TODO (follow-up PR — depends on `vault_read_file` IPC)
 *
 *   - Add a `useEffect` that resolves `body` against the current vault
 *     root, invokes the desktop shell's `vault_read_file` (or the
 *     equivalent web-target IO) to load the sibling `.excalidraw.json`,
 *     and stuffs the parsed scene into local state.
 *   - Replace the placeholder body below with a lazy-loaded
 *     `<Excalidraw />` instance configured per D3:
 *     `viewModeEnabled` + `zenModeEnabled` + `initialData={ elements,
 *     appState }`. Dynamic-import `@excalidraw/excalidraw` inside the
 *     effect (D8) and guard with `typeof document !== "undefined"` (D7).
 *   - The underlying `@excalidraw/excalidraw` package is already added
 *     to `packages/editor/package.json` in this PR so the follow-up
 *     doesn't pay the lockfile-bump cost.
 *
 * The placeholder still carries `data-excalidraw` on the wrapper so
 * the dispatcher routing test, any future visual regression snapshots,
 * and downstream tooling have a stable hook today.
 */

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export function ExcalidrawEmbed(props: NodeViewProps) {
  const path = String(props.node.attrs["body"] ?? "").trim();

  return (
    <NodeViewWrapper
      as="div"
      data-excalidraw=""
      data-info="excalidraw"
      contentEditable={false}
      style={{
        background: "var(--bg-elevated)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-md, 0.375rem)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2, 0.5rem)",
        margin: "var(--space-4, 1rem) 0",
        padding: "var(--space-4, 1rem)",
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: "var(--text-primary, var(--color-fg))",
          display: "flex",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-sm)",
          gap: "var(--space-2, 0.5rem)",
        }}
      >
        <strong>Excalidraw:</strong>
        <code
          data-excalidraw-path=""
          style={{ background: "transparent", fontFamily: "var(--font-mono)", padding: 0 }}
        >
          {path || "(no sidecar path)"}
        </code>
      </div>
      <p
        style={{
          color: "var(--text-secondary, var(--color-fg-muted))",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-xs)",
          margin: 0,
        }}
      >
        Read-only canvas preview lands once <code>vault_read_file</code> IPC ships
        (see <code>@lattice/editor/embeds/excalidraw.tsx</code> TODO).
      </p>
    </NodeViewWrapper>
  );
}
