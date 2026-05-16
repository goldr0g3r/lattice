# FAQ

> Recurring questions, with answers grounded in the ADRs and the
> roadmap. If your question isn't here, open a GitHub Discussion or
> file a `type/docs` issue and we'll answer it both places.

## Product

### What is Lattice in one sentence?

A local-first, AGPL-licensed, AI-native personal knowledge manager
built for engineers and ML practitioners; ships on Windows, Linux, and
Android (post-v0.6). See [`vision.md`](vision.md).

### Why another note-taking app?

Every existing tool gives up at least one of {local-first, open
source, AI-native, engineer/ML-first, time-travel}. We refuse to give
up any of them. See the head-to-head matrix in
[`research/note-taking-landscape.md`](research/note-taking-landscape.md).

### Where do my notes live?

In a folder you choose, on your disk, as plain Markdown files. The
hidden subdirectory `<vault>/.lattice/` holds caches the app can
rebuild from your files. See [ADR-0006](decisions/0006-local-first-plain-markdown.md).

### Is anything sent to a server by default?

No. Lattice is local-first; nothing phones home unless you explicitly
enable telemetry or configure an AI / sync provider.

- **Telemetry:** off by default; details in [`telemetry.md`](telemetry.md).
- **AI:** opt-in per provider; runs against OpenAI, Anthropic, or a
  local Ollama instance. Your key, your endpoint.
- **Sync:** opt-in; the reference server is self-hostable. End-to-end
  encrypted via libsodium with user-held keys. See
  [ADR-0005](decisions/0005-yrs-crdt-sync.md).

### What's the license? Can I use Lattice at work?

[AGPL-3.0-or-later](../LICENSE). Using Lattice as a desktop app is
unaffected — the AGPL only triggers reciprocity for **redistribution**
or **network-service hosting**. If you fork Lattice and run it as a
SaaS, you must release your changes under the same license. See
[ADR-0007](decisions/0007-agpl-3-license.md).

### Will there be a hosted version?

Maybe later, as a convenience layer on top of the same open-source
sync server. Hosted is not, and will not become, the primary
distribution. See the non-goals in [`vision.md`](vision.md).

### Will Lattice ship on macOS / iOS?

Not in v1.0. Tauri 2 supports both, but desktop Windows + Linux +
Android first. macOS / iOS land when someone with an Apple developer
account picks up the milestone — community contributions welcome.

### When will <feature> land?

Check [`../ROADMAP.md`](../ROADMAP.md). The milestone owns the
feature; the version number after the bullet is firm-on-scope,
soft-on-date.

## Development

### What do I need installed to build the app?

Node 20+, pnpm 10+, Rust stable, the Tauri 2 prerequisites for your
OS, and disk space for `target/` and `node_modules/`. The full list,
with platform-specific notes, lives in
[`getting-started/prerequisites.md`](getting-started/prerequisites.md).

### Why pnpm? Why Turborepo? Why not Nx / Bazel?

Speed, strictness, smallest surface area. The trade-offs are written
out in [ADR-0008](decisions/0008-pnpm-turborepo-monorepo.md).

### Why Tauri 2 instead of Electron?

10× smaller bundle, 4× lower idle memory, native mobile path, single
codebase. The trade-offs (steeper Rust learning curve, smaller
ecosystem, three WebView engines) are written out in
[ADR-0001](decisions/0001-tauri-2-cross-platform-shell.md).

### Why TipTap and not Lexical / Slate / a custom editor?

ProseMirror's maturity, `y-prosemirror`'s ready-made CRDT integration,
and the size of TipTap's extension catalogue. See
[ADR-0003](decisions/0003-tiptap-prosemirror-editor.md).

### Why Markdown on disk and not a block database?

Because **users own their notes** and they need to open in `vim`,
`grep`, or whatever they used five years before Lattice and will use
five years after. The full argument and the rejected alternatives
(Notion-style block DB, Logseq-style EDN, SQLite-only) are in
[ADR-0006](decisions/0006-local-first-plain-markdown.md).

### Where do shared types between Rust and TypeScript come from?

`ts-rs` derives them from the Rust structs in `core/lattice-core/src/`
and writes the output to
[`packages/core-bindings/src/generated/`](../packages/core-bindings/src/generated/).
The CI step `Verify generated ts-rs bindings are committed` fails the
build if anyone forgot to run `cargo test -p lattice-core` and commit
the diff. See [`architecture/ipc-contract.md`](architecture/ipc-contract.md).

### How do I run tests?

```bash
pnpm test                                  # all JS/TS via Turborepo
cargo test --workspace --all-features      # all Rust
pnpm --filter @lattice/editor test         # one JS package
cargo test -p lattice-core                 # one Rust crate
```

The longer story — vitest, Playwright, criterion benches, the golden
corpus — is in [`development/testing.md`](development/testing.md).

### How do I add a new ADR?

Copy [`decisions/0000-template.md`](decisions/0000-template.md) to
the next free `NNNN-<kebab>.md`, fill it in, open a PR titled
`docs(adr): NNNN <decision title>`. Step-by-step in
[`how-to/add-an-adr.md`](how-to/add-an-adr.md).

### My PR title got rejected by CI. What's the format?

`<type>(<scope>): <subject>` where `type` is one of `feat | fix |
docs | style | refactor | perf | test | build | ci | chore | revert`
and `scope` is one of the values listed in
[`commitlint.config.cjs`](../commitlint.config.cjs). Examples:

- `feat(editor): wiki-link autocomplete`
- `fix(core)!: handle empty frontmatter`
- `docs(adr): 0018 plugin sandbox capability model`

See [ADR-0009](decisions/0009-conventional-commits-trunk-based.md).

### How do branch-protection checks work?

`main` requires `ci / meta`, `ci / frontend (ubuntu-latest |
windows-latest)`, `ci / rust (ubuntu-latest | windows-latest)`,
`ci / desktop-build (ubuntu-latest | windows-latest)`, and
`commitlint`. See
[`development/github-governance.md`](development/github-governance.md)
for re-applying protection after a CI rename.

### A `tokens:check` failure says "missing" or "extra" — what does it mean?

You changed `packages/ui/src/tokens.css` without updating
`packages/config/tailwind-preset/index.cjs`, or vice versa. The two
files must declare the same set of token names. Edit them together;
re-run `pnpm tokens:check`. Recipe:
[`how-to/add-a-design-token.md`](how-to/add-a-design-token.md).

### A `Verify markdown round-trip AST snapshots` step failed in CI

Your editor / parser change altered the parsed shape of one of the
fixtures in [`tests/markdown-roundtrip/`](../tests/markdown-roundtrip/).
Re-generate the AST locally and commit the diff:

```bash
cargo run --example dump_ast -- tests/markdown-roundtrip/<fixture>.md \
  > tests/markdown-roundtrip/<fixture>.expected.json
```

If you didn't intend to change the AST, that means you broke the
round-trip; revert and reach for
[`development/debugging.md`](development/debugging.md).

### How do I open a Cursor / VS Code session that "just works"?

Workspace settings ship with `.vscode/settings.json` (when committed).
For Cursor, the `.cursor/rules/` files attach automatically. Quick
list of recommended extensions:

- **Rust Analyzer** for Rust IntelliSense
- **Tauri** (official) for `tauri.conf.json` schema
- **ESLint**, **Prettier**, **Tailwind CSS IntelliSense**
- **EditorConfig**

### Where are issues / milestones / labels managed?

Config-as-code in `.github/`. Don't click around in the GitHub UI —
the next sync run overwrites your change. See the
[github-governance](development/github-governance.md) page.

## Operational

### How big does the vault get?

For a 10 000-note vault: ~50 MB of Markdown, ~80 MB of `index.db` +
Tantivy. Attachments are not bounded by us — they're whatever you
paste. The performance budgets at
[`../ARCHITECTURE.md#performance-budgets`](../ARCHITECTURE.md#performance-budgets)
target this scale.

### Can I use Git on my vault?

Yes — that's the whole point of plain Markdown on disk. Use a normal
Git repo on the vault folder; ignore `.lattice/index.db`,
`.lattice/tantivy/`, and `.lattice/logs/` if you don't want them
committed. The v0.9 Time-Travel feature uses the same Git semantics
internally for per-note diff and blame.

### Where does the SQLite database live?

`<vault>/.lattice/index.db`. Schema migrations are in
[`core/lattice-core/migrations/`](../core/lattice-core/migrations/).
If the file is corrupted you can delete it; the watcher rebuilds.
Never put data you can't afford to lose in `.lattice/` — that's the
**cache** by design.

### The app crashed. What do I send the maintainers?

Reproduce, then attach:

- The contents of `<user-config-dir>/lattice/log/<latest>.log`
  (structured `tracing` output).
- The OS / version / Lattice version (`Settings → About`).
- A minimal vault that triggers the crash, if possible.

Open a `type/bug` issue with the
[bug-report template](../.github/ISSUE_TEMPLATE/).

### Is there a private vulnerability disclosure path?

Yes. **Don't** open a public issue for security bugs. Use GitHub's
private vulnerability reporting per [`../SECURITY.md`](../SECURITY.md).
