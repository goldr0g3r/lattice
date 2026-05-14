# ADR-0017: Excalidraw embed storage format

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: editor, excalidraw, attachments, embeds, v0.2

## Context

v0.2 PR #5 embeds Excalidraw as a first-class editor node. Excalidraw's
own data model is a JSON scene file (`.excalidraw.json`); rendering it
requires the Excalidraw runtime. We need an on-disk story that:

- Survives `git diff` (so changes to a diagram are inspectable).
- Renders as *something* in non-Lattice readers (so a user opening the
  `.md` in vim or GitHub sees a placeholder, not "broken image").
- Keeps the editor experience editable (so re-opening in Lattice gives
  full Excalidraw editing, not a flattened raster).

[ADR-0016](0016-attachment-storage.md) decided that binary attachments
live under `<vault>/.lattice/attachments/<note-id>/`. This ADR is the
Excalidraw-specific concretisation of that policy.

## Decision

**Each Excalidraw embed serialises as a pair: the editable
`<name>.excalidraw.json` sidecar plus a rendered `<name>.png` snapshot,
both under `<vault>/.lattice/attachments/<note-id>/`.** The Markdown
reference points at the PNG:

```markdown
![Diagram](.lattice/attachments/abc-123/system-arch.png)
```

The editor knows that any image whose URL has a sibling
`<basename>.excalidraw.json` is an editable Excalidraw node and opens
the JSON in the Excalidraw runtime on click. The PNG re-renders on every
save so the snapshot stays in sync with the JSON.

## Consequences

### Positive

- **Non-Lattice readers see a diagram.** GitHub, Obsidian, vim+image
  preview, etc. all render the PNG. The reader doesn't know Excalidraw
  exists.
- **Editable in Lattice.** Click → JSON loads in the Excalidraw node →
  edit → save re-emits the PNG.
- **Git-diff-friendly content.** The `.excalidraw.json` is text; small
  edits produce small diffs. The PNG is binary and may bloat diffs, but
  the JSON is the authoritative source.
- **Cheap to delete.** The pair shares the `<note-id>` subdirectory
  with the note; removing the note removes both files.

### Negative

- **Two files per embed.** Storage roughly 2× the minimum, and the
  per-attachment ID space is denser. Acceptable: Excalidraw scenes are
  typically <50 KB JSON + <200 KB PNG.
- **PNG can drift.** If a user edits `<name>.excalidraw.json` outside
  Lattice and doesn't re-render the PNG, the snapshot is stale. The
  on-save re-render path keeps Lattice users in sync; out-of-band edits
  re-render the next time Lattice opens the note.
- **Cross-tool round-trip is asymmetric.** Other tools can render the
  PNG but can't edit the JSON. That's fine for v0.2; we accept the
  one-way story.

### Neutral

- The PNG renders at a default DPI; if a user needs a vector export
  later, an `<name>.svg` can be added without changing the contract.
- We don't store the Excalidraw library state (fonts, plugins) — the
  JSON references built-in primitives only.

## Alternatives considered

### Option B — Inline base64 PNG only (no JSON)

- **Pros:** simplest possible storage; one file per embed.
- **Cons:** not editable — re-opening in Lattice shows a flat raster,
  not an Excalidraw scene. Defeats the point of having Excalidraw at
  all.
- **Why rejected:** loses editability.

### Option C — SVG with embedded JSON metadata

- **Pros:** one file; SVG renders in browsers; JSON metadata recoverable.
- **Cons:** Excalidraw's SVG export is lossy for some node types
  (transforms, certain fonts); the metadata trick is fragile across
  tools that re-save the SVG.
- **Why rejected:** less reliable round-trip than the JSON+PNG pair.

### Option D — JSON only, render at view time

- **Pros:** smallest storage; always consistent.
- **Cons:** non-Lattice readers see a `.json` link, not a picture. The
  "renders as something in vim" promise breaks.
- **Why rejected:** cross-tool degradation matters.

## References

- [Excalidraw file format](https://docs.excalidraw.com/docs/codebase/json-schema) —
  the JSON schema this ADR persists.
- [@excalidraw/excalidraw npm](https://www.npmjs.com/package/@excalidraw/excalidraw) —
  the embedded runtime the editor uses.
- [ADR-0016](0016-attachment-storage.md) — the attachment directory
  this stores into.
- [ADR-0015](0015-markdown-flavor-and-serialization.md) — the Markdown
  flavor that emits the image reference.
- [v0.2 sub-plan](.cursor/plans/v0.2-editor-subplan.plan.md) — PR #5
  acceptance.
