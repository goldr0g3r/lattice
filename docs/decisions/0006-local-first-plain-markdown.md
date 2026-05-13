# ADR-0006: Local-first plain Markdown as source of truth

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: storage, file-format, local-first, markdown, portability

## Context

Every PKM in the market falls into one of two storage camps:

1. **Block-DB model** (Notion, Reflect, Anytype): notes live in a
   proprietary database, paragraphs are blocks with IDs, exports are
   lossy. Sync and rich features are easy; portability and longevity
   are weak. Users do not own their data in any meaningful sense.
2. **Files-on-disk model** (Obsidian, Joplin, Logseq, Bear): each note
   is a Markdown (or near-Markdown) file in a user-owned folder.
   Portability and Git-friendliness are strong; certain features
   (multi-block transclusions, true real-time collab) take more work.

Lattice's principles ([ROADMAP.md](../../ROADMAP.md)) make the choice
for us — "local-first, always" and "your files are yours" rule out
camp 1 — but the **flavor** of Markdown and the role of the on-disk
file vs. the editor's internal state needs to be nailed down before we
write a single line of editor code.

## Decision

**Notes are plain Markdown files** with YAML frontmatter, stored under
a user-chosen **vault folder**. The on-disk `.md` is the **source of
truth** for everything except optional CRDT sync state.

- One note = one `.md` file. Files keep human-readable names.
- Frontmatter holds typed metadata (`id`, `tags`, `type`, `created`,
  `updated`, `aliases`); the body is GitHub-Flavored Markdown plus a
  small superset (wiki-links, callouts, mermaid, KaTeX).
- The editor ([TipTap / ProseMirror, ADR-0003](0003-tiptap-prosemirror-editor.md))
  parses `.md` on open and serializes back on save. A
  `tests/markdown-roundtrip/` golden corpus gates every parser change.
- Indexes (`~/MyVault/.lattice/index.db`, Tantivy, attachments) are
  **rebuildable caches** derived from disk.
- When sync is enabled ([ADR-0005](0005-yrs-crdt-sync.md)), a sibling
  `.note.crdt` carries the Yjs state; the `.md` is regenerated on save
  and is still authoritative for non-sync clients.

## Consequences

### Positive

- **Users own their data.** Open any note in `vim`, VS Code, Obsidian,
  or `cat`. No lock-in.
- **Git-friendly.** Diff, blame, merge, GitHub render — all the existing
  developer workflow plugs in for free (this feeds the v0.9 time-travel
  feature too).
- **Future-proof.** Markdown is not going anywhere; in 20 years the
  files still open.
- **Plays with everything.** Pandoc export, static-site generators,
  `grep`-able from the terminal, scriptable from Python.
- **Backup is `rsync`** — no app needed to recover a vault.
- **Power users will respect us.** The Obsidian community, our beachhead,
  literally chose Obsidian over Notion for this reason.

### Negative

- **Markdown round-trip is the contract from hell.** Tables with pipes
  inside code spans, nested HTML, footnotes, list-in-blockquote
  combinations are full of edge cases. Mitigation: golden-file test
  suite per [ADR-0003](0003-tiptap-prosemirror-editor.md).
- **Rich blocks have to render down to Markdown.** Lattice-specific
  blocks (Dataset, Model, Experiment, Citation) serialize as fenced
  blocks with frontmatter-style metadata so they degrade to readable
  Markdown in any other editor.
- **No native real-time multiplayer on disk.** Yjs solves it for the
  editor view, but two clients editing the same file at the same
  millisecond on a shared filesystem will race. Mitigation: file watcher
  + last-writer-wins on disk + CRDT for cross-device, plus a "vault
  conflict" UI for the pathological case (Obsidian Sync handles this
  the same way).
- **Index is a separate layer.** Tantivy + SQLite must stay consistent
  with disk; if they drift, search results lie. Mitigation: file
  watcher + integrity check on startup; the user can always
  "Reindex vault" to nuke and rebuild.

### Neutral

- We pick **CommonMark + GFM tables + footnotes + math + wiki-links +
  callouts** as the dialect; everything else round-trips as raw text.
- Frontmatter format is **YAML**, not TOML or JSON — matches Obsidian
  expectations.
- Vault folder layout is **user-controlled**; we don't impose any
  structure beyond the hidden `.lattice/` directory.

## Alternatives considered

### Option A — Proprietary block DB (Notion-style)

- **Pros**: cleanest rich-content model, easy backlinks, easy collab.
- **Cons**: vendor lock-in, lossy export, "where do my notes live?"
  is unanswerable.
- **Why rejected**: violates our top principle.

### Option B — JSON / EDN blocks on disk (Logseq-style)

- **Pros**: structured, easy to query, no parser ambiguity.
- **Cons**: not human-readable, not Git-diff-friendly, breaks the
  "open in any editor" promise.
- **Why rejected**: portability and tool interop are the wedge.

### Option C — SQLite-only with periodic Markdown export

- **Pros**: rich queries on day one, no parser complexity.
- **Cons**: the export becomes a stale, lossy second-class citizen;
  user trust collapses the first time the export and the DB disagree.
- **Why rejected**: source of truth must be the human-readable file.

### Option D — Org-mode files on disk

- **Pros**: richer semantics than Markdown, beloved by some.
- **Cons**: vanishingly small editor ecosystem outside Emacs; users
  expect Markdown.
- **Why rejected**: market mismatch.

## References

- [Local-first software manifesto — Ink & Switch](https://www.inkandswitch.com/local-first/).
- [CommonMark](https://commonmark.org/), [GitHub-Flavored Markdown](https://github.github.com/gfm/).
- [Obsidian "your files are yours"](https://obsidian.md/) — beachhead UX precedent.
- [`pulldown-cmark`](https://github.com/raphlinus/pulldown-cmark) — parser of choice.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — data-model section.
- [ADR-0003](0003-tiptap-prosemirror-editor.md), [ADR-0005](0005-yrs-crdt-sync.md).
