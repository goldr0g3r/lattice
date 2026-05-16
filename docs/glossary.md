# Glossary

> Terms we use precisely throughout the codebase. When a word means
> something specific in Lattice, it lives here. If you're reading code
> or an ADR and a term is unclear, this is the first place to check.

## A

### ADR — Architecture Decision Record

A short Markdown file in [`docs/decisions/`](decisions/) that captures
**one** architecturally significant choice (Context → Decision →
Consequences → Alternatives). See [`decisions/README.md`](decisions/README.md)
for the lifecycle and [`how-to/add-an-adr.md`](how-to/add-an-adr.md) to
write one.

### Affected detection

Turborepo's `--filter=...[origin/main]` selector that runs only the
tasks impacted by changes since `main`. Used by CI and `pnpm lint` /
`test` / `typecheck` locally on large PRs to skip work for unchanged
packages. See [`development/monorepo.md`](development/monorepo.md).

### AGPL-3.0

The GNU Affero General Public License v3.0. The project's chosen
license; closes the SaaS-hosting loophole that plain GPL leaves open.
See [ADR-0007](decisions/0007-agpl-3-license.md).

### Attachment

A binary file (image, PDF, Excalidraw export) referenced from a note.
Lives under `<vault>/.lattice/attachments/<note-id>/`. See
[ADR-0016](decisions/0016-attachment-storage.md).

## B

### Backlink

A link from another note pointing **at** the current note. Computed
from the `links` table by filtering on `dst = <current note id>`.
First-class panel ships in v0.3.

### Baseline (criterion)

A snapshotted benchmark result used to gate regressions. Stored under
`core/lattice-core/benches/baselines/` and compared on every PR run via
`cargo bench -- --baseline main`. See
[`how-to/profile-with-criterion.md`](how-to/profile-with-criterion.md).

### Block (editor)

The smallest top-level unit in the TipTap document — a paragraph,
heading, list, callout, code-block, table, or embed. Equivalent to a
ProseMirror block-level node.

## C

### Callout

A blockquote variant rendered with an icon + colour, written as
`> [!info]` / `> [!warn]` / `> [!tip]`. GitHub-compatible syntax. See
[ADR-0015](decisions/0015-markdown-flavor-and-serialization.md).

### CommonMark

The Markdown spec we round-trip against. We add GFM tables / task
lists / strikethrough / autolinks plus a small set of Lattice
extensions; see [ADR-0015](decisions/0015-markdown-flavor-and-serialization.md).

### Conventional Commits

The PR-title and commit-message format the repo enforces. Type +
optional scope + subject — `feat(editor): wiki-link autocomplete`.
See [ADR-0009](decisions/0009-conventional-commits-trunk-based.md).

### Core (Rust)

The Rust workspace under [`core/`](../core/). Owns vault FS, Markdown
parser, SQLite index, file watcher, search, AI provider abstraction,
and CRDT sync. See [`architecture/core-overview.md`](architecture/core-overview.md).

### CRDT — Conflict-free Replicated Data Type

The data structure family used for sync ([Yjs](https://docs.yjs.dev/),
specifically the Rust port [`yrs`](https://github.com/y-crdt/y-crdt))
that lets two devices edit the same note offline and merge without
manual conflict resolution. See [ADR-0005](decisions/0005-yrs-crdt-sync.md).

## D

### Daily note

A note named `YYYY-MM-DD.md` opened with one keystroke; first-class
template ships in v0.3.

### Debounce window

The interval the file watcher waits between coalescing rapid `notify`
events into a single `IndexEvent` batch. Per-OS defaults — Linux
250 ms, Windows 100 ms, macOS 200 ms. See
[ADR-0014](decisions/0014-file-watcher-debounce.md).

### Design token

A named CSS custom property in [`packages/ui/src/tokens.css`](../packages/ui/src/tokens.css)
exposing a semantic role (`--accent-primary`, `--bg-canvas`, etc.).
The Tailwind preset surfaces every token as a utility class. Parity
between the two is enforced by `pnpm tokens:check`. See
[ADR-0010](decisions/0010-design-tokens-and-typography.md).

## F

### Fenced block

A Markdown code fence with an info-string. Lattice uses three special
info-strings on top of the language ones:
`mermaid` (diagram), `excalidraw` (sketch),
`lattice:<kind>` (typed-block payload).

### Frontmatter

The YAML block between `---` fences at the top of a note. Holds typed
metadata: `id`, `tags`, `type`, `created`, `updated`, `aliases`. Key
order is preserved on round-trip.

### FOUT — Flash of Unstyled Text

The brief moment on cold start where the OS fallback font paints
before our self-hosted Newsreader / Inter / JetBrains Mono swap in.
We accept it; FOIT is worse. See [ADR-0011](decisions/0011-font-loading-strategy.md).

## G

### Golden corpus

The set of Markdown fixtures under
[`tests/markdown-roundtrip/`](../tests/markdown-roundtrip/) that
**must** parse + serialise byte-identical through both the Rust and
the TS pipeline. See [`how-to/add-a-markdown-roundtrip-fixture.md`](how-to/add-a-markdown-roundtrip-fixture.md).

### Graph view

The Cytoscape-backed visual rendering of `(note, link)` rows from
the SQLite index. Local (one-hop neighbourhood) and global (entire
vault). Ships in v0.3.

## I

### Index

Two indexes derived from the on-disk vault, both treated as a
**rebuildable cache**:

- **`index.db`** — SQLite metadata: notes, tags, links,
  attachments. Schema in
  [`core/lattice-core/migrations/`](../core/lattice-core/migrations/).
- **`tantivy/`** — Full-text inverted index. See
  [ADR-0004](decisions/0004-tantivy-full-text-search.md) and
  [`architecture/search-internals.md`](architecture/search-internals.md).

### IPC — Inter-Process Communication

The Tauri-provided typed bridge between the Rust core and the React
renderer. Commands are defined in
[`apps/desktop/src-tauri/src/commands/`](../apps/desktop/src-tauri/src/commands/);
return types are codegen'd to TypeScript via `ts-rs`. See
[`architecture/ipc-contract.md`](architecture/ipc-contract.md).

## L

### Lattice extension (Markdown)

A small superset of CommonMark + GFM that we serialise:
`[[Wiki Title]]`, `> [!info]` callouts, `$math$` / `$$math$$`,
fenced `mermaid` / `excalidraw`, and (post-v0.7) `lattice:<kind>`
typed-block fences. Defined in
[ADR-0015](decisions/0015-markdown-flavor-and-serialization.md).

### Local-first

The architectural stance that every meaningful operation completes
without network access. The vault lives on disk; sync is opt-in;
nothing phones home by default. See
[ADR-0006](decisions/0006-local-first-plain-markdown.md) and
[`vision.md`](vision.md).

## M

### Migration

A numbered SQL file in [`core/lattice-core/migrations/`](../core/lattice-core/migrations/)
applied at vault open. Run by `sqlx::migrate!`. Filenames are
`<NNNN>_<title>.sql`. See [`how-to/add-a-database-migration.md`](how-to/add-a-database-migration.md).

### Monorepo

The single Git repo containing all artifacts (desktop app, mobile app,
shared packages, Rust core, sync server, browser extension, docs). pnpm
workspace + Turborepo on the JS side, a Cargo workspace on the Rust
side. See [ADR-0008](decisions/0008-pnpm-turborepo-monorepo.md).

## N

### NoteDoc

The serialisable, editor-agnostic document shape used to round-trip a
note between disk Markdown and the TipTap ProseMirror document.
Defined in `packages/editor/src/markdown/` and the matching
`lattice_core::markdown` module on the Rust side.

### `notify` / `notify-debouncer-full`

The Rust crates that watch the vault filesystem. Wraps inotify
(Linux), `ReadDirectoryChangesW` (Windows), and FSEvents (macOS) into
a uniform stream. See [ADR-0014](decisions/0014-file-watcher-debounce.md).

## P

### Perf budget

A target latency for a critical operation enforced by criterion benches
in CI. See the table in
[`../ARCHITECTURE.md`](../ARCHITECTURE.md#performance-budgets) and
[`development/performance.md`](development/performance.md).

### Plugin (WASM)

A user-installable extension running in a WASM sandbox with
capability-based permissions. SDK ships in v0.9; the contract is
documented under `docs/legal/plugins.md` (TBD). See
[`../ROADMAP.md`](../ROADMAP.md) v0.9 row.

### ProseMirror

The structured rich-text editing toolkit beneath TipTap. Provides the
schema, transaction, and state-management primitives. Long-running and
battle-tested; chosen for editor maturity. See
[ADR-0003](decisions/0003-tiptap-prosemirror-editor.md).

## R

### Round-trip

Parsing a Markdown file into the editor's internal model, then
serialising back out, **and** asserting the bytes are identical to the
input. The single hardest contract in the repo. Enforced by the
golden corpus.

## S

### Schema (Markdown)

The set of allowed block + inline node types in the editor. See
[`packages/editor/src/tiptap/schema.ts`](../packages/editor/src/tiptap/schema.ts)
for the TipTap schema and the parser/serialiser pair on each side.

### Schema (telemetry)

The shape of one telemetry event. Versioned per-event with
`schema_minor`, additive only. Registered in
[`telemetry.md`](telemetry.md) and locked by
[ADR-0012](decisions/0012-telemetry-event-schema-versioning.md).

### Slash command

The `/` menu that appears in the editor for inserting blocks
(heading, list, code, callout, math, mermaid, etc.). Implemented via
TipTap's suggestion plugin.

### Source of truth

The on-disk Markdown file. Indexes are caches; CRDT sidecar `.crdt`
files exist only when sync is enabled. See
[ADR-0006](decisions/0006-local-first-plain-markdown.md).

### Squash-merge

The only merge strategy on `main`. PR title becomes the canonical
commit subject. See [ADR-0009](decisions/0009-conventional-commits-trunk-based.md).

## T

### `ts-rs`

The Rust crate that derives TypeScript type definitions from Rust
structs, used to keep the IPC contract in sync. Output lands in
[`packages/core-bindings/src/generated/`](../packages/core-bindings/src/generated/).
See [`architecture/ipc-contract.md`](architecture/ipc-contract.md).

### Tantivy

The Rust full-text search engine embedded in
[`core/lattice-search/`](../core/lattice-search/). See
[ADR-0004](decisions/0004-tantivy-full-text-search.md).

### Tauri 2

The cross-platform shell that ships the React UI inside an OS-native
WebView with a Rust backend. See
[ADR-0001](decisions/0001-tauri-2-cross-platform-shell.md).

### Telemetry

Optional, opt-in event stream emitted to a JSONL file under
`<vault>/.lattice/logs/telemetry.jsonl`. Off by default. See
[`telemetry.md`](telemetry.md) and
[ADR-0012](decisions/0012-telemetry-event-schema-versioning.md).

### TipTap

The headless block-editor framework on top of ProseMirror. Lattice
uses TipTap 2.x with custom extensions for wiki-links, callouts, math,
fenced diagram embeds, and slash commands.

### Token parity

Invariant enforced by [`scripts/check-token-parity.mjs`](../scripts/check-token-parity.mjs):
every token declared in `tokens.css` must be referenced from the
Tailwind preset and vice versa. Runs as `pnpm tokens:check`.

### Trunk-based development

The branching model: short-lived feature branches off `main`,
squash-merged back. No long-lived `develop` / `release` branches.
See [ADR-0009](decisions/0009-conventional-commits-trunk-based.md).

## V

### Vault

A user-chosen folder of Markdown files plus a hidden `.lattice/`
subdirectory for caches. Opened, created, switched, or closed via the
`vault_*` Tauri commands.

### Vault-relative path

A path under the vault root, written without the leading vault folder.
Used in attachment links so `git mv`-ing a note doesn't break image
references. Example: `.lattice/attachments/abc-123/diagram.png`.

## W

### Watcher

The background task started by `Watcher::start()` that converts file
system events from `notify-debouncer-full` into typed `IndexEvent`
values delivered to the index + the renderer. See
[`core/lattice-core/src/watcher.rs`](../core/lattice-core/src/watcher.rs)
and [ADR-0014](decisions/0014-file-watcher-debounce.md).

### Wiki link

The `[[Title]]` (or `[[Title|Alias]]`) link syntax. Resolved against
the note titles index; click navigates to the target note.

## Y

### Yjs / `yrs`

Yjs is the JavaScript CRDT library; `yrs` is its Rust port. Wire
format is binary-compatible. We use both — the renderer uses
`y-prosemirror`, the core uses `yrs` for sync state. See
[ADR-0005](decisions/0005-yrs-crdt-sync.md).
