# ADR-0003: TipTap (ProseMirror) as the editor

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: editor, ui, prosemirror, tiptap, codemirror, markdown

## Context

The editor is **the product**. Users will spend 90% of their time inside
it. We need:

- Block-based editing (paragraphs, headings, lists, callouts, code, quotes,
  tables, embeds) with **slash commands**.
- **Markdown round-trip** with no data loss — load `.md` from disk, edit,
  save back, `git diff` is empty for unchanged regions.
- **Wiki links** (`[[link]]`) with autocomplete, backlinks, unlinked-mention
  detection.
- **Embedded code blocks** with first-class syntax highlighting (~100 langs),
  and eventually runnable cells.
- **LaTeX (KaTeX)**, **Mermaid**, **Excalidraw** as inline embeds.
- **Real-time collaboration** later via Yjs (see [ADR-0005](0005-yrs-crdt-sync.md)).
- A schema we own and can extend with **plugins** ([WASM, v0.9](../../ROADMAP.md)).

## Decision

**We will use TipTap 2.x (built on ProseMirror)** as the editor framework,
with **CodeMirror 6** embedded inside code-block nodes for proper
syntax highlighting and language-aware editing.

The TipTap schema is **JSON-first internally**, with a Markdown
parser/serializer pair owning the round-trip contract enforced by a
golden-file test suite (`tests/markdown-roundtrip/`).

## Consequences

### Positive

- **ProseMirror is the gold standard** for structured rich-text editing —
  used by Atlassian, Notion, GitLab, NYT, GitHub. Mature, battle-tested.
- **TipTap's batteries** (extensions for headings, lists, links, mentions,
  tables, collab, suggestions) save us months.
- **CRDT-ready** via `@tiptap/extension-collaboration` + `y-prosemirror`.
- **CodeMirror 6 nesting** gives us proper code editing inside the block
  editor — search/jump/multi-cursor inside code, plus the full CM6 plugin
  ecosystem.
- **Custom blocks** (Dataset, Model, Experiment, Citation, Bookmark) are
  just new ProseMirror nodes — clean extension model.
- React bindings via `@tiptap/react`, but the schema is framework-agnostic
  if we ever want to share it with mobile-native code.

### Negative

- **ProseMirror's learning curve is real** — schemas, plugins, decorations,
  transactions take time to grok.
- **Markdown round-trip is the hardest sub-problem** in this entire codebase.
  Mitigation: a `tests/markdown-roundtrip/` corpus of pathological inputs
  (tables with pipes inside code, nested HTML, weird footnotes) gating every
  PR that touches the parser/serializer.
- **Bundle size**: ProseMirror + TipTap + CodeMirror is ~300 KB gzipped.
  Acceptable for a desktop app; we'll code-split CM6 on mobile.

### Neutral

- We control the schema; vendor lock-in is bounded.
- Mobile may need a slimmer view-only renderer for performance on weak
  devices — revisit in v0.6.

## Alternatives considered

### Option A — Lexical (Meta)

- **Pros**: faster than ProseMirror in some benchmarks, modern API.
- **Cons**: younger ecosystem, weaker collab story, fewer ready-made
  extensions, less battle-tested for our exact use case.
- **Why rejected**: ProseMirror's maturity and CRDT story matter more than
  marginal perf.

### Option B — Slate

- **Pros**: lightweight, React-native API.
- **Cons**: fewer batteries; collab story is DIY; less production usage at
  the size we need.
- **Why rejected**: TipTap's extensions save more time than Slate's
  simpler API.

### Option C — CodeMirror 6 only

- **Pros**: one editor for text and code; fast.
- **Cons**: block-level editing (drag-and-drop blocks, slash menus,
  embeds, tables) is not what CM is built for.
- **Why rejected**: we want a block editor, not a text editor with
  Markdown coloring.

### Option D — Quill

- **Pros**: easy embed.
- **Cons**: effectively abandoned, no real schema model, no collab story.
- **Why rejected**: dead.

### Option E — Build our own on `contenteditable`

- **Why rejected**: that way lies madness. ProseMirror exists because
  `contenteditable` is a swamp.

## References

- [TipTap docs](https://tiptap.dev/)
- [ProseMirror guide](https://prosemirror.net/docs/guide/)
- [CodeMirror 6](https://codemirror.net/)
- [Y-ProseMirror](https://github.com/yjs/y-prosemirror)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — Open questions: editor schema.
