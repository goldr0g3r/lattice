# ADR-0005: Yjs (`yrs`) for CRDT sync

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: sync, crdt, collaboration, offline-first

## Context

Sync (v0.5) and eventual multi-device editing are non-negotiable
features. The data layer needs to:

- Merge concurrent edits to the same note **without manual conflict
  resolution** when two devices both modify a file offline.
- Plug into the editor ([TipTap / ProseMirror, ADR-0003](0003-tiptap-prosemirror-editor.md))
  so per-keystroke state can be reconciled, not just whole-file diffs.
- Run **on the device** — no central server is required; sync is opt-in
  ([ADR-0006](0006-local-first-plain-markdown.md)).
- Move ciphertext only when sync is enabled (E2EE with libsodium).
- Cross-compile to Android.

We need to pick a CRDT library now because the **editor schema** (next
PR in v0.2) needs to know if it's authored against `y-prosemirror` or
something else, and the **on-disk format** for sync state hangs off it.

## Decision

**We will use [Yjs](https://github.com/yjs/yjs)** as the CRDT model,
with the Rust port [`yrs`](https://github.com/y-crdt/y-crdt) inside
`core/lattice-sync`, and `y-prosemirror` on the editor side.

Sync state lives next to each note as a sibling `.note.crdt` file
**only when sync is enabled**. The Markdown file remains the source of
truth on disk for the non-sync case; with sync on, the Yjs doc state is
authoritative and the `.md` is regenerated on every save.

The reference sync server (v0.5, [ADR per-server-TBD]) speaks `y-sync`
over WebSocket via Axum.

## Consequences

### Positive

- **Editor integration is solved.** `y-prosemirror` is the de-facto
  binding for ProseMirror — collab, presence, awareness, snapshots all
  work without writing a transport layer.
- **Battle-tested.** Yjs runs Figma-like apps, Notion-style editors,
  Linear — it's the most production-proven CRDT.
- **`yrs` is binary-compatible with Yjs** — same wire format, so a Rust
  core and a JS client can sync without translation layers.
- **Local-first by design.** Each device holds the full state graph;
  the server is a relay, not a source of truth.
- **Incremental updates** are tiny (delta encoded); great for low-bandwidth
  mobile sync (v0.6).
- **History for free.** Yjs's update log is naturally append-only — that
  feeds the v0.9 "time-travel" feature without extra plumbing.

### Negative

- **Memory cost.** Each open Yjs doc carries metadata (item IDs, vector
  clocks). On a 10 k-note vault we open per note as needed — but a
  reckless "open them all" call would blow our 200 MB idle budget.
  Mitigation: lazy-open + drop after inactivity.
- **Markdown round-trip remains the contract.** Yjs is the source of
  truth for the editor's view, but we still serialize to `.md` on every
  save so the file is git-friendly and tool-friendly. This is the
  hardest sub-problem in the codebase (also called out in
  [ADR-0003](0003-tiptap-prosemirror-editor.md)).
- **Schema evolution.** Adding new ProseMirror node types requires
  versioning the Yjs schema; a bad migration could orphan history.
- **GC.** Yjs's tombstone-based history can grow unbounded; we'll add a
  periodic GC pass on note close.

### Neutral

- **Per-note doc** vs **per-vault doc**: we pick per-note for blast-radius
  reasons (rename of one note doesn't rewrite global state) and pay the
  cost of metadata-per-note in a separate sidecar Yjs doc.
- **Awareness** (presence cursors) ships post-v1.0 — Yjs supports it,
  we just don't need it for v0.5's single-user multi-device case.

## Alternatives considered

### Option A — Automerge

- **Pros**: JSON-first model, cleaner API for non-text data.
- **Cons**: heavier doc model (rich history baked in), weaker editor
  bindings, no equivalent of `y-prosemirror`. Slower convergence on the
  exact "rich-text in a block editor" use case we care about.
- **Why rejected**: editor integration is the deal-breaker; Yjs wins
  there decisively.

### Option B — Custom Operational Transform (OT)

- **Pros**: ultimate control.
- **Cons**: OT requires a central server to enforce a total order;
  contradicts local-first. Years of engineering to match a CRDT's
  guarantees.
- **Why rejected**: rope-yourself trap.

### Option C — JSON Patch + last-write-wins

- **Pros**: trivial to implement.
- **Cons**: silent data loss on concurrent edits; users will hit it
  within a week of multi-device use.
- **Why rejected**: violates the "sync just works" promise.

### Option D — Diamond Types

- **Pros**: very fast on linear text, smaller updates than Yjs.
- **Cons**: editor bindings are immature, JS/TS interop is rougher,
  smaller community. Promising but not yet at production-mass.
- **Why rejected**: revisit at v1.0 if Yjs hits a perf ceiling; not the
  right v0.5 bet.

## References

- [Yjs documentation](https://docs.yjs.dev/)
- [`yrs` (Rust port)](https://github.com/y-crdt/y-crdt)
- [`y-prosemirror`](https://github.com/yjs/y-prosemirror)
- ["Local-First Software" — Ink & Switch, 2019](https://www.inkandswitch.com/local-first/)
- Martin Kleppmann et al., *A Conflict-Free Replicated JSON Datatype* (CRDTs paper trail).
- [ADR-0003](0003-tiptap-prosemirror-editor.md) — editor framework choice.
- [ADR-0006](0006-local-first-plain-markdown.md) — on-disk truth.
