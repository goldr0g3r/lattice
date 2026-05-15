# ADR-0020: Backlinks staleness model

- **Status**: Accepted
- **Date**: 2026-05-15
- **Deciders**: @goldr0g3r
- **Tags**: graph, backlinks, watcher, performance, v0.3

## Context

The v0.3 backlinks panel (issue
[#44](../../.github/issues/v0.3-tasks.yml)) renders, for every open
note, the set of notes that link to it (backlinks) plus the set of
notes that **mention** its title without a `[[wiki-link]]` (unlinked
mentions). Both populate from the SQLite `links` table seeded by the
v0.1 watcher pipeline.

The v0.3 epic locks a **≤1 s refresh latency** after a save; that
window is the budget for "the user saves a note with a new
`[[Target]]` in it and the panel showing the open Target note must
display this new backlink".

Two extremes bracket the design space:

- **Synchronous extraction** — `note_write` returns only after the
  Markdown is parsed, links extracted, the `links` table mutated, and
  the panel re-queried. Gives the user a tight Save→see-backlink loop
  (~50 ms p99) at the cost of every save now blocking on parsing +
  SQLite write inside the IPC handler.
- **Eventual extraction** — `note_write` returns as soon as the bytes
  land on disk; the watcher's debounce tick (Linux 250 / Windows 100 /
  macOS 200 ms — [ADR-0014](0014-file-watcher-debounce.md)) re-parses
  and updates the table. The save IPC stays fast (<10 ms typical) but
  the panel sees the new link "in the next debounce window".

A third hybrid emerged in v0.2 design review: the editor knows it just
wrote, so it can immediately fire a panel-side "reload backlinks for
this note id" request without waiting on the index pipeline.

## Decision

**We will treat backlink extraction as eventual: the file watcher is
the single producer of `links` table rows, with the editor save path
firing an in-process refresh hint after the watcher debounce window
elapses.** The backlinks panel renders from SQLite (a) on mount, (b)
on every `vault://index` event whose `path` matches an open note id,
and (c) on a debounced timer 50 ms after each `note_write` (so the
panel doesn't lag behind the user's own save by the full watcher
debounce floor).

Concretely:

- `note_write` (Tauri command) returns as soon as the atomic write
  succeeds — it does **not** parse the Markdown for links.
- The watcher's `IndexEvent::Modified` for the same path triggers a
  `links` table update inside `lattice-core::indexer` (new module,
  ships in [v0.3 PR C](../../.github/issues/v0.3-tasks.yml)
  feat(search): live re-indexing on save).
- After the SQLite commit, the indexer fires a fresh `vault://index`
  event with `kind: BacklinksRefreshed` that the panel subscribes to;
  the panel re-queries the `links` table for the open note id.
- Inside the editor, the save handler additionally fires
  `setTimeout(() => requestBacklinksRefresh(), 50)` so the panel
  doesn't appear stale for the entirety of the watcher debounce window
  on the user's own save. The watcher event later wins idempotently.

The implementation guarantee: a user who edits note `A` to add
`[[B]]`, hits Save, and has note `B` open in another pane sees the
backlink to `A` appear in B's backlinks panel **within
`max(50 ms, watcher_debounce + 100 ms)`** — well inside the 1 s budget
on every supported platform.

Unlinked mentions are computed differently — they piggy-back on the
Tantivy index: a backlinks-panel mount on note `B` issues a Tantivy
query for `B`'s title across `body` with `tags:^B^` excluded, then
subtracts the wiki-link hits. This runs ~5 ms on a 10 k-note vault
([benches in v0.3 PR B](../../.github/issues/v0.3-tasks.yml)
feat(search): Tantivy index) and refreshes on the same triggers as
backlinks.

## Consequences

### Positive

- **Save stays fast.** `note_write` returns within the v0.1 50 ms
  budget; no IPC handler does Markdown parsing on the hot path.
- **Single source of truth.** Only the watcher writes to `links`; we
  don't have two code paths that can disagree on extraction rules.
- **Plays well with external edits.** A `git checkout` or external
  `vim` save fires the watcher event the same way an in-app save
  does — backlinks are correct for both, by construction.
- **No new IPC verb for the panel.** The existing `vault://index`
  event stream extends with `BacklinksRefreshed`; the panel is one
  subscriber among others (the note list refresh, the graph snapshot
  invalidator).
- **Hint-driven refresh.** The 50 ms `setTimeout` covers the gap
  between user save and watcher event, so the perceived latency on
  the active note matches the synchronous model.

### Negative

- **Brief window of staleness.** Between save and the watcher
  pipeline's commit, a quick context switch to the linked note's
  panel could miss the new edge for ~150–350 ms (platform debounce +
  parse + SQLite). The 50 ms editor hint covers the same-process
  case; external observers (a second Lattice window in v0.5) see the
  full window. We accept this as the eventual-consistency price.
- **Indexer responsibility creep.** The "live re-index" indexer now
  owns link extraction in addition to Tantivy doc upsert. We
  co-locate them in one module
  ([`lattice-core::indexer`](../../core/lattice-core/src/lib.rs)) so
  the responsibility is explicit.
- **Unlinked-mention runs a Tantivy query per backlinks-panel mount.**
  At <5 ms per query on a 10 k-note vault this is well under budget,
  but it does scale with vault size — we revisit if the search bench
  shows tail-latency growth.

### Neutral

- The `BacklinksRefreshed` event is opt-in for subscribers; existing
  consumers of `vault://index` (the note list) ignore it via a
  `kind` filter.
- We do not deduplicate against the user's editor still being
  mid-edit — a save during a save was already the editor's own
  concern (debounced 250 ms in the WorkspaceShell, per
  [PR #58](https://github.com/goldr0g3r/lattice/pull/58)).

## Alternatives considered

### Option A — Synchronous extraction on `note_write`

- **Pros**: backlinks always fresh by the time the IPC returns;
  no race window.
- **Cons**: parsing + SQLite write on the hot save path; trades the
  v0.1 50 ms budget for backlink freshness the user almost never
  observes (they're typing into the source note, not staring at the
  target note's panel).
- **Why rejected**: wrong trade — we already have an eventual
  pipeline (the watcher) and bypassing it is duplication.

### Option B — Pure eventual, no editor-side hint

- **Pros**: simplest implementation.
- **Cons**: on Linux the user could wait 250 ms + extraction +
  commit before seeing their own change reflected — feels laggy on
  the active note.
- **Why rejected**: the 50 ms `setTimeout` covers the user-perceived
  case at trivial cost.

### Option C — Per-note debounce inside the editor, no watcher coupling

- **Pros**: even tighter feedback on the active note.
- **Cons**: doubles the extraction logic (editor and watcher both
  parsing); two writers to `links` reintroduces the consistency bug
  Option B was meant to avoid.
- **Why rejected**: violates the single-source-of-truth invariant.

### Option D — Stream link diffs directly from the editor's `onChange`

- **Pros**: zero save-to-panel latency.
- **Cons**: every keystroke runs through the link extractor;
  unbounded CPU cost while typing.
- **Why rejected**: way over-budget for the marginal UX win.

## References

- [ADR-0014](0014-file-watcher-debounce.md) — debounce window that
  defines the eventual-consistency floor.
- [ADR-0004](0004-tantivy-full-text-search.md) — Tantivy index that
  powers the unlinked-mention query.
- [`core/lattice-core/migrations/0001_init.sql`](../../core/lattice-core/migrations/0001_init.sql)
  — `links` table schema this ADR writes against.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — perf budgets table.
- v0.3 issue [#44](../../.github/issues/v0.3-tasks.yml) — backlinks
  panel acceptance criteria this ADR locks.
