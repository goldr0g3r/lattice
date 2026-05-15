/**
 * Lattice fenced-block node-view dispatcher (v0.2 PR #6 — embeds slice,
 * issue #37).
 *
 * The TipTap `fenced` extension defined in `../extensions/fenced.ts`
 * calls `addNodeView() => latticeFencedNodeView()`. This module is what
 * receives the call and routes each node to one of three node-view
 * implementations based on the block's `info` attribute:
 *
 *   - `info === "mermaid"` → React node-view that renders a Mermaid SVG
 *     via the lazy-loaded `mermaid` package (see `./mermaid.tsx`).
 *   - `info === "excalidraw"` → React node-view that renders a read-only
 *     placeholder card for an Excalidraw scene (see `./excalidraw.tsx`).
 *   - anything else (`"" / "typescript" / "rust" / ...`) → the
 *     CodeMirror 6 node-view shipped in PR #55
 *     (see `../codemirror/node-view.ts`).
 *
 * # Design decisions (locked here as the canonical home for the slice)
 *
 * - **D1 — dispatch**: a single `fenced` node-view factory looks at
 *   `node.attrs.info` and picks one of: Mermaid (info ∈ {`"mermaid"`}),
 *   Excalidraw (info ∈ {`"excalidraw"`}), CodeMirror fallback (anything
 *   else). The CM6 path is **bit-identical** to PR #55's behaviour for
 *   non-embed languages — we delegate to the same
 *   [`latticeCodeMirrorNodeView`](../codemirror/node-view.ts) factory
 *   without re-wrapping it, so the language picker, escape-keymap, and
 *   `attrs.body` update plumbing are untouched. Info-string detection
 *   is case- and whitespace-insensitive (`" Mermaid "` is still a
 *   Mermaid block) to match the GFM info-string spec. Flipping
 *   `attrs.info` mid-life away from an embed kind requires the user to
 *   delete and re-insert the block — the editor's UI never offers a
 *   path to mutate that attribute in place (the CM6 picker only lists
 *   the preloaded / lazy CodeMirror languages, no embed kinds).
 *
 * - **D2 — Mermaid library**: `mermaid` ^11 (`mermaid.render(id, src)`
 *   returns `{ svg, bindFunctions? }`). Lazy-loaded via a dynamic
 *   `import("mermaid")` inside the React component's `useEffect`, so
 *   the heavy bundle stays out of the cold-start path until the first
 *   Mermaid block is rendered in a session.
 *
 * - **D3 — Excalidraw library**: `@excalidraw/excalidraw` ^0.18.
 *   Read-only embed: pass `viewModeEnabled` + `zenModeEnabled` once we
 *   mount the actual canvas. The body of the fenced block holds the
 *   path to the `.excalidraw.json` sidecar per
 *   [ADR-0017](../../../../../../docs/decisions/0017-excalidraw-embed-storage.md).
 *   **v0.2 ships a placeholder card** (`"Excalidraw: <path>"`) only;
 *   wiring the actual sidecar load is a follow-up PR that depends on
 *   the desktop shell exposing a `vault_read_file` IPC command (out of
 *   scope for this PR's allowed file boundary). The
 *   `@excalidraw/excalidraw` dep is still added in this PR so the
 *   follow-up doesn't have to pay the lockfile-bump cost.
 *
 * - **D4 — round-trip**: **zero changes** to the `fenced`
 *   `addAttributes` / `parseHTML` / `renderHTML` paths or the
 *   NoteDoc <-> ProseMirror converter pair. The corpus fixtures
 *   `mermaid-fence.md` and `excalidraw-fence.md` round-trip
 *   byte-identical with **zero fixture edits**; the 13-fixture
 *   conversion corpus in `../__tests__/conversion.test.ts` and the
 *   26-fixture Markdown round-trip in `../../markdown/__tests__/` stay
 *   green untouched.
 *
 * - **D5 — error UX**: Mermaid render failures surface inline as a
 *   `<div data-mermaid-error>` carrying the parser message and the raw
 *   source in a `<pre>` — the editor never crashes on a malformed
 *   diagram. See `./mermaid.tsx` for the error branch.
 *
 * - **D6 — design tokens**: per [ADR-0010](../../../../../../docs/decisions/0010-design-tokens-and-typography.md),
 *   no hard-coded colours / spacing. Each embed wrapper drives layout
 *   from CSS variables declared in `@lattice/ui/tokens.css` via
 *   inline `style={{ ... }}` so we don't have to touch `Editor.css` in
 *   this PR — that file is owned by the parallel
 *   `feat/desktop-shell-redesign` workstream and is out of bounds.
 *
 * - **D7 — SSR / jsdom**: Mermaid touches `window` and measures DOM
 *   nodes during render. The React component guards with
 *   `typeof document !== "undefined"` before invoking the library and
 *   only runs inside `useEffect` (never during SSR / module
 *   evaluation). Excalidraw's DOM bindings need `window` too — we keep
 *   the **placeholder-only** path for v0.2 so jsdom tests don't pull
 *   the package in at all. The conversion corpus test (node env) never
 *   instantiates a node-view because TipTap only calls `addNodeView()`
 *   from inside a live `EditorView`, and the editor view itself only
 *   mounts under jsdom in this package's `*.test.tsx` files — so
 *   neither library is loaded by the headless corpus.
 *
 * - **D8 — bundle weight**: both libraries are lazy-loaded via dynamic
 *   imports. Neither is imported at module top level. `mermaid` ^11
 *   lands as roughly **+1 MB minified pre-tree-shake** (Vite's
 *   per-route code-splitting keeps it out of the editor entry chunk —
 *   it loads on the first Mermaid block mount). `@excalidraw/excalidraw`
 *   ^0.18 is **+~280 KB minified core + ~600 KB of font/icon assets
 *   that ship on demand** from `@excalidraw/excalidraw/dist/` once
 *   the v0.2 follow-up canvas is wired. Cold-start of the editor is
 *   unchanged for users who never open a Mermaid or Excalidraw block.
 *   See `CHANGELOG.md` `[Unreleased] → Added` for the full per-feature
 *   breakdown.
 */

import { ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewRenderer } from "@tiptap/core";

import { latticeCodeMirrorNodeView } from "../codemirror/node-view";

import { ExcalidrawEmbed } from "./excalidraw";
import { MermaidEmbed } from "./mermaid";

const MERMAID_INFOS: ReadonlySet<string> = new Set(["mermaid"]);
const EXCALIDRAW_INFOS: ReadonlySet<string> = new Set(["excalidraw"]);

function normalise(info: string): string {
  return info.trim().toLowerCase();
}

/**
 * True when this fenced node's `info` should route to the Mermaid
 * embed (D1). Case- and whitespace-insensitive to mirror the GFM
 * info-string convention.
 */
export function isMermaidInfo(info: string): boolean {
  return MERMAID_INFOS.has(normalise(info));
}

/**
 * True when this fenced node's `info` should route to the Excalidraw
 * embed (D1). Case- and whitespace-insensitive to mirror the GFM
 * info-string convention.
 */
export function isExcalidrawInfo(info: string): boolean {
  return EXCALIDRAW_INFOS.has(normalise(info));
}

/**
 * Build the dispatcher TipTap calls from `Fenced.addNodeView()`. The
 * returned `NodeViewRenderer` routes per-instance based on
 * `node.attrs.info` (D1).
 *
 * The CodeMirror 6 fallback is constructed exactly once per editor
 * (mirroring the previous direct-wire in PR #55) so the CM6 chrome —
 * language picker options, escape keymap, language compartment — is
 * allocated once instead of per-node. The Mermaid / Excalidraw React
 * renderers are likewise constructed once per editor via TipTap's
 * `ReactNodeViewRenderer` factory; per-node mounting still goes
 * through `mermaidRenderer(props)` / `excalidrawRenderer(props)`.
 */
export function latticeFencedNodeView(): NodeViewRenderer {
  const codeMirrorRenderer = latticeCodeMirrorNodeView();
  const mermaidRenderer = ReactNodeViewRenderer(MermaidEmbed, { as: "div" });
  const excalidrawRenderer = ReactNodeViewRenderer(ExcalidrawEmbed, { as: "div" });

  return (props) => {
    const info = String(props.node.attrs["info"] ?? "");
    if (isMermaidInfo(info)) return mermaidRenderer(props);
    if (isExcalidrawInfo(info)) return excalidrawRenderer(props);
    return codeMirrorRenderer(props);
  };
}
