# ADR-0016: Image and attachment storage

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: editor, attachments, storage, vault-layout, v0.2

## Context

v0.2 PR #5 (KaTeX / Mermeid / Excalidraw embeds) and the drag-and-drop
image path from the v0.2 epic both need a place on disk for binary
payloads: pasted PNGs, Excalidraw exports, future YouTube thumbnails,
etc. The `Vault` ([v0.1 PR #6](../../core/lattice-core/src/vault.rs))
already creates a `.lattice/attachments/` subdirectory; the question is
whether attachments go *there* (centralised, opaque) or beside each note
(sibling, transparent) — or somewhere else entirely.

This needs to be pinned before PR #5 codes the image-link path and
before PR #1's serializer decides how to write `![alt](path)` URLs.

## Decision

**Attachments live in `<vault>/.lattice/attachments/<note-id>/<filename>`,
referenced from Markdown as `![alt](.lattice/attachments/<note-id>/<filename>)`.**

- The path is **vault-relative**, so `git mv`-ing a note keeps the
  attachment link working.
- The per-`<note-id>` subdirectory keeps attachment counts manageable on
  large vaults and makes "delete a note + its assets" trivial.
- Filenames are slugged from the original upload name plus a short
  content-hash suffix to avoid collisions: `paste-2026-05-14-9f3a.png`.

Frontmatter never references attachment paths; only Markdown links do.

## Consequences

### Positive

- **Centralised** — easy to back up, gitignore-able if a user wants to,
  one mental location for "where do my pasted images live".
- **Survives renames** — moving a note within the vault doesn't break
  its image links because they're all vault-relative under `.lattice/`.
- **Cheap to clean** — "remove orphaned attachments" is a single
  `find .lattice/attachments -type d -empty` style sweep.
- **Plays with `grep`** — `grep -r "attachments/abc-123"` finds every
  reference to a given asset.

### Negative

- **Less obvious in a file manager** — a user browsing the vault in
  Explorer / Finder won't see images next to their note. Mitigation: the
  editor's "Reveal in file system" action opens the right subdir;
  documented in CONTRIBUTING.
- **Vault-relative paths only render in Lattice and tools that resolve
  `.lattice/` paths.** Obsidian's "attachment folder" setting can be
  pointed at `.lattice/attachments`, but other Markdown readers will
  show broken images. Mitigation: documented; users who care can swap
  the strategy via a v0.4-ish setting.

### Neutral

- The folder is created lazily on first attachment write per note, not
  preemptively in `Vault::open`.
- Binary blobs ARE committed to `.lattice/attachments/` by default; the
  user's vault `.gitignore` can override if they prefer LFS or external
  storage.

## Alternatives considered

### Option A — Sibling `attachments/` next to each note

- **Pros:** images visible in file manager next to the note; intuitive.
- **Cons:** explodes the vault directory listing; renaming a note
  requires renaming its sibling folder too; deeply nested note paths
  produce deeply nested attachment folders.
- **Why rejected:** centralisation wins on cleanup and predictability;
  the "visible in file manager" benefit is solved by the Reveal action.

### Option C — Inline data URIs in Markdown

- **Pros:** zero file-management; the `.md` is fully self-contained.
- **Cons:** explodes `.md` size (a 200 KB PNG becomes a 270 KB line of
  base64); breaks the readability promise of plain Markdown; `git diff`
  on a note becomes useless once any image touches it.
- **Why rejected:** violates the "plain files" wedge.

### Option D — Per-vault configurable

- **Pros:** lets power users choose centralised vs sibling.
- **Cons:** the editor has to handle both shapes; the corpus has to
  cover both; the support burden doubles.
- **Why rejected:** revisit in v0.4 once user feedback shows demand;
  v0.2 picks one and ships.

### Option E — External blob store (S3 / IPFS)

- **Pros:** decouples binary size from the vault repo.
- **Cons:** breaks local-first; introduces a network dependency at
  read time.
- **Why rejected:** out of scope for v0.2; the v0.5 sync server may add
  an optional offload later for users who need it.

## References

- [v0.1 PR #6](../../core/lattice-core/src/vault.rs) — the `.lattice/`
  subdirectory that this ADR populates.
- [ADR-0006](0006-local-first-plain-markdown.md) — plain-file
  philosophy.
- [Obsidian "attachment folder path" setting](https://help.obsidian.md/Editing+and+formatting/Attachments) —
  reference for the cross-tool readability story.
- [v0.2 sub-plan](.cursor/plans/v0.2-editor-subplan.plan.md) — PR #5
  acceptance.
