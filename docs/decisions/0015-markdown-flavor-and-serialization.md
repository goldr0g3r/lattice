# ADR-0015: Markdown flavor and custom-node serialization

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: editor, markdown, serialization, round-trip, v0.2

## Context

v0.2 PR #1 ships the Markdown parser/serializer pair that the TipTap
editor ([ADR-0003](0003-tiptap-prosemirror-editor.md)) reads and writes.
The v0.2 epic locks the **golden-corpus round-trip** as the gate:
every fixture under `tests/markdown-roundtrip/` parses + serialises
**byte-identical** to the input. To make that gate definable we need to
pin which Markdown grammar the serializer emits.

Three forces are in play:

- **`grep`-and-vim friendly** ([ADR-0006](0006-local-first-plain-markdown.md))
  — the on-disk format must look like Markdown a human can edit by hand.
- **Block-richness** — TipTap exposes callouts, math, wiki-links,
  Excalidraw embeds, and (later) typed Dataset / Model / Experiment
  blocks. Vanilla CommonMark doesn't cover them.
- **Cross-tool readability** — Obsidian, GitHub, Bear, and other
  Markdown readers should render a Lattice file as gracefully as
  possible even when they don't know about Lattice extensions.

## Decision

**Lattice's serializer emits a strict CommonMark + GFM superset plus a
small, documented set of Lattice extensions.** Concretely:

- **Base grammar:** CommonMark 0.31 + GitHub-Flavored Markdown extensions
  (tables, task lists, strikethrough, autolinks).
- **Frontmatter:** YAML between `---` fences at the top of the file; key
  order preserved on round-trip.
- **Lattice extensions** (defined inline so other tools can ignore them
  gracefully):
  - `[[Wiki Title]]` for wiki-links (mark, not a block).
  - `> [!info]` / `> [!warn]` / `> [!tip]` callouts (GitHub-compatible).
  - Inline math `$...$`, block math `$$...$$`.
  - Fenced `mermaid` and `excalidraw` info-string blocks for diagram
    embeds.
  - Custom block nodes (post-v0.2: Dataset, Model, Experiment, Citation)
    serialise to fenced blocks with a `lattice:<kind>` info-string and
    a JSON payload as the body so a non-Lattice reader sees a code
    block, not garbage.

The TS serializer ([`packages/editor/src/markdown/serializer.ts`](packages/editor/src/markdown/serializer.ts))
and the Rust serializer ([`core/lattice-core/src/markdown/serializer.rs`](core/lattice-core/src/markdown/serializer.rs))
both target this grammar; the v0.2 PR #1 corpus enforces byte-identical
round-trip across both.

## Consequences

### Positive

- **Round-trip is provable.** Every corpus file parses + serialises to
  itself; the gate is a one-line CI assert.
- **Non-Lattice readers degrade gracefully.** Wiki-links, callouts,
  fenced math/diagram blocks all render to *something* in any
  CommonMark+GFM reader, even if not as prettily as in Lattice.
- **Forward-compatible for typed blocks.** Dataset / Model / Experiment
  ride the `lattice:<kind>` fenced-block convention — adding a new kind
  is additive, no grammar bump.
- **Cross-tool migrations stay cheap.** A user moving in from Obsidian
  keeps `[[Wiki links]]` and fenced `mermaid` blocks working; a user
  moving out to plain CommonMark loses the rich rendering but keeps
  content.

### Negative

- **Custom-node serialization is non-canonical.** A reader that opens a
  Lattice file in vim sees fenced blocks with a `lattice:dataset`
  info-string and JSON inside — readable but not editable in the rich
  sense. Mitigation:
  custom nodes are opt-in (v0.7+); v0.2's editor only emits the small
  set above.
- **The TS + Rust serializers must agree.** Two implementations doubles
  the chance of drift. Mitigation: the golden-corpus test runs the same
  fixtures through both and asserts identical output.

### Neutral

- We don't adopt Pandoc Markdown's full surface (citations, footnotes
  with arbitrary IDs, raw LaTeX blocks). Citations land in v0.7 as a
  typed block, not as Pandoc `@key` references.
- HTML passthrough (raw `<details>` etc.) is allowed but not encouraged;
  the corpus includes a `html-snippet.md` fixture to lock the behaviour.

## Alternatives considered

### Option A — CommonMark only (strict)

- **Pros:** smallest possible surface; trivially portable.
- **Cons:** no tables, no task lists, no callouts. Half the v0.2 block
  set has no Markdown representation, defeating the round-trip promise.
- **Why rejected:** insufficient coverage.

### Option B — CommonMark + GFM (no Lattice extensions)

- **Pros:** GitHub-renderable everywhere.
- **Cons:** no wiki-links (which the v0.2 sub-plan calls "the social
  glue of the vault"), no math, no callouts beyond plain blockquotes.
- **Why rejected:** loses too much editor surface.

### Option D — Pandoc Markdown (full)

- **Pros:** richest grammar in common use; bibliographies, footnotes,
  definitions, raw LaTeX.
- **Cons:** enormous surface area; round-trip with all features is
  effectively undefined; very few readers render the full grammar.
- **Why rejected:** the corpus would have to cover too many edge cases
  for the v0.2 budget. Revisit for v0.7's citation work if Pandoc-style
  `@cite` references prove useful.

## References

- [CommonMark 0.31 spec](https://spec.commonmark.org/0.31/)
- [GitHub-Flavored Markdown spec](https://github.github.com/gfm/)
- [GitHub callout syntax (`[!note]` / `[!warning]`)](https://github.com/orgs/community/discussions/16925)
- [Obsidian wiki-link syntax](https://help.obsidian.md/Linking+notes+and+files/Internal+links)
- [ADR-0003](0003-tiptap-prosemirror-editor.md) — the editor that
  consumes / produces this grammar.
- [ADR-0006](0006-local-first-plain-markdown.md) — disk-as-source-of-truth.
- [v0.2 sub-plan](.cursor/plans/v0.2-editor-subplan.plan.md) — PR #1
  acceptance: byte-identical golden-corpus round-trip.
