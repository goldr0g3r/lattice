# ADR-0013: Vault-conflict resolution UX

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: ux, watcher, conflict, editor, v0.1, v0.2

## Context

Lattice watches the user's filesystem (PR #7,
[ADR-0014](0014-file-watcher-debounce.md)). It is normal for a vault to be
edited by tools other than Lattice — `vim`, an Obsidian sync, a Dropbox
conflict resolver, a Git rebase. The watcher will surface these as
`vault://index` events; the question this ADR answers is **what does the
user see when an external write happens to a note that has unsaved in-app
changes?**

In v0.1 the in-app editor doesn't exist yet (PR #2 ships the read-only
metadata index; the TipTap editor lands in v0.2). So the only writes from
*inside* Lattice in v0.1 are vault-creation operations (`Vault::create`
seeding `.lattice/`). There is no "unsaved buffer" to lose. We still need
to make the decision now because PR #7 (file watcher) and v0.2's editor
need a defined contract.

## Decision

**For v0.1: the watcher always treats the on-disk file as authoritative.**
Any external change is re-read silently. There is no prompt, no UI surface,
because there is no in-app draft to defend.

**For v0.2 (when the TipTap editor lands): if the watcher reports a
`Modified` event for a note that has an unsaved in-app draft, the editor
will surface a non-blocking, dismissable prompt** with three actions:

1. **Keep mine** — write the in-app draft over the on-disk file. Triggers
   the standard save path.
2. **Take theirs** — discard the in-app draft and re-load from disk.
3. **Show diff & merge** — open a side-by-side diff (re-using the v0.9
   time-travel diff component) where the user picks per-hunk.

A future ADR (post-v0.5 once Yjs CRDT lands per
[ADR-0005](0005-yrs-crdt-sync.md)) may revisit this with automatic
CRDT-driven three-way merge for files under sync.

## Consequences

### Positive

- **No spurious prompts in v0.1.** The watcher integrates cleanly without
  pulling in UI infrastructure that doesn't exist yet.
- **Honest "your files are yours" stance.** Disk-side edits never get
  silently overwritten by Lattice (the editor explicitly asks).
- **Reuses v0.9 components.** The diff-and-merge view is the same one
  used for time-travel; no second diff system to maintain.
- **Forward-compatible.** When sync (v0.5) ships, files under CRDT sync
  can skip the prompt and do a CRDT merge; files not under sync keep
  the v0.2 UX. Same data model.

### Negative

- **The v0.2 prompt is more code than "last writer wins".** Mitigation:
  ship the prompt as a simple shadcn `Dialog` first; the per-hunk merge
  view lands later if usage data shows people reach for it.
- **No protection for "in-progress" multi-window edits in v0.1.** A user
  who opens the same note twice (which we don't currently support
  anyway) wouldn't see a warning. v0.2's editor enforces a single open
  buffer per note, sidestepping the issue.

### Neutral

- The setting `editor.conflict_resolution` lands in v0.2 with values
  `prompt` (default), `keep_mine`, `take_theirs`. v0.1 doesn't read it.
- The watcher event payload (`IndexEvent`) already includes the path and
  kind needed; no schema change required.

## Alternatives considered

### Option A — Last-writer-wins, silent (forever)

- **Pros**: zero UI surface; simplest possible code.
- **Cons**: silently loses in-app drafts when an external edit lands
  mid-typing. Users will lose work and blame Lattice for it.
- **Why rejected**: violates the "your files are yours" promise the
  moment Lattice's writer wins over a user's `vim` write.

### Option C — Three-way auto-merge (Git-style, no prompt)

- **Pros**: zero modal interruption.
- **Cons**: Markdown three-way merges produce surprising results in
  block-rich content (lists, tables, code-fences). Silent merges are
  worse than silent overwrites because they look correct until they
  aren't.
- **Why rejected**: revisit post-v0.5 only for files under CRDT sync,
  where the merge has a real algebra behind it.

### Option D — Lock the file on the OS during editing

- **Pros**: prevents the conflict from happening.
- **Cons**: file locks are advisory on most filesystems; `vim` and most
  CLI tools ignore them; we'd give a false sense of security. Plus,
  locking is hostile to the "plain text on disk" philosophy.
- **Why rejected**: wrong layer + false safety.

## References

- [ARCHITECTURE.md](../../ARCHITECTURE.md) — Data model: vault is the
  source of truth.
- [ADR-0005](0005-yrs-crdt-sync.md) — CRDT for sync; future home of
  automatic merges.
- [ADR-0006](0006-local-first-plain-markdown.md) — "your files are
  yours" stance that motivates the prompt-rather-than-overwrite policy.
- [ADR-0014](0014-file-watcher-debounce.md) — the watcher this prompt
  hangs off.
- [Epic: v0.2 — The Editor](../../.github/issues/epics.yml) — where the
  prompt UI lands.
