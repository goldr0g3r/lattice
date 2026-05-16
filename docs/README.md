# Lattice documentation

> Welcome. This folder is the **handbook** for Lattice — what we're
> building, why we're building it that way, and how to work in the
> repo. The top-level [`README.md`](../README.md) is the marketing
> face; everything substantive lives here.

If you only have five minutes, read the [Vision](vision.md) and the
[Glossary](glossary.md). If you're new to the codebase, jump to
[Getting started](getting-started/README.md).

## Map

```text
docs/
├─ README.md                  ← you are here
├─ vision.md                  one-page north star
├─ glossary.md                terms we use precisely
├─ faq.md                     answers to recurring questions
├─ telemetry.md               event registry + privacy stance
│
├─ getting-started/           clone → build → run → contribute
├─ development/               daily workflow, standards, performance, releases
├─ architecture/              deep-dives that build on top of ARCHITECTURE.md
├─ how-to/                    recipes for common dev tasks
├─ user-guide/                end-user docs (lightweight pre-alpha)
├─ research/                  market scans, prior art, references
└─ decisions/                 ADRs — every architecturally significant choice
```

## By goal — "I want to…"

### …understand what Lattice is

| Read this                                                                | Why                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| [`vision.md`](vision.md)                                                 | One-page product north star and non-goals.               |
| [`research/note-taking-landscape.md`](research/note-taking-landscape.md) | Where Lattice sits among Obsidian, Notion, Logseq, etc.  |
| [`../ROADMAP.md`](../ROADMAP.md)                                         | Milestone-by-milestone scope from v0.1 → v1.0.           |
| [`faq.md`](faq.md)                                                       | Quick answers — license, telemetry, AI, mobile, plugins. |

### …get the app running locally

| Read this                                                                 | Why                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`getting-started/prerequisites.md`](getting-started/prerequisites.md)    | Tooling matrix — Node, pnpm, Rust, Tauri, OS deps.   |
| [`getting-started/first-build.md`](getting-started/first-build.md)        | Step-by-step first dev session.                      |
| [`getting-started/troubleshooting.md`](getting-started/troubleshooting.md) | Common setup failures and fixes.                    |

### …contribute to the codebase

| Read this                                                              | Why                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md)                             | Branching, commits, PR workflow.                             |
| [`development/coding-standards.md`](development/coding-standards.md)   | Rust + TypeScript style guide.                               |
| [`development/testing.md`](development/testing.md)                     | Test pyramid: vitest, cargo test, golden-corpus, Playwright. |
| [`development/monorepo.md`](development/monorepo.md)                   | How pnpm + Turborepo + Cargo are wired.                      |
| [`development/performance.md`](development/performance.md)             | Perf budgets, criterion, regression gating.                  |
| [`development/debugging.md`](development/debugging.md)                 | DevTools, `tracing`, Tauri inspector.                        |
| [`development/release-process.md`](development/release-process.md)     | How a `vX.Y.Z` tag becomes a signed installer.               |
| [`development/github-governance.md`](development/github-governance.md) | Labels / milestones / Project v2 as code.                    |

### …understand how Lattice works internally

| Read this                                                               | Why                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md)                              | High-level diagram, repo layout, perf budgets.                               |
| [`architecture/data-model.md`](architecture/data-model.md)              | Vault layout, frontmatter, indexes.                                          |
| [`architecture/ipc-contract.md`](architecture/ipc-contract.md)          | Rust → TS surface via Tauri commands and `ts-rs`.                            |
| [`architecture/core-overview.md`](architecture/core-overview.md)        | Tour of the Rust workspace.                                                  |
| [`architecture/frontend-overview.md`](architecture/frontend-overview.md) | React app structure, shell, routing.                                        |
| [`architecture/editor-internals.md`](architecture/editor-internals.md)  | TipTap, ProseMirror schema, CodeMirror nesting, Markdown round-trip.         |
| [`architecture/search-internals.md`](architecture/search-internals.md)  | Tantivy + SQLite query plan (v0.3+).                                         |
| [`architecture/sync-internals.md`](architecture/sync-internals.md)      | Yjs / `yrs`, `.note.crdt` sidecars, server protocol (v0.5+).                 |
| [`architecture/security.md`](architecture/security.md)                  | Threat model and mitigations in depth.                                       |

### …perform a specific task

The [`how-to/`](how-to/README.md) folder is a cookbook of recipes:

- [Add an ADR](how-to/add-an-adr.md)
- [Add a Tauri command](how-to/add-a-tauri-command.md)
- [Add a design token](how-to/add-a-design-token.md)
- [Add a TipTap extension](how-to/add-a-tiptap-extension.md)
- [Add a database migration](how-to/add-a-database-migration.md)
- [Add a Markdown round-trip fixture](how-to/add-a-markdown-roundtrip-fixture.md)
- [Bump a dependency](how-to/bump-a-dependency.md)
- [Cut a release](how-to/cut-a-release.md)
- [Debug a flaky test](how-to/debug-a-flaky-test.md)
- [Profile with criterion](how-to/profile-with-criterion.md)
- [Triage a bug](how-to/triage-a-bug.md)

### …understand a past decision

Every architecturally significant choice has an
[ADR](decisions/README.md). Browse the [index](decisions/README.md#index)
or grep the directory:

```bash
rg -l "tokenizer|BM25" docs/decisions/
```

If a decision is missing, that means we haven't made it explicitly —
flag it on the next PR by writing a new ADR.

## Conventions

- **One H1 per file** (markdownlint `MD025`). The H1 is the title.
- **Code fences are language-tagged** (`MD040`). Use `text` for plain
  output, `bash` for shell, `powershell` for PowerShell.
- **Cross-link liberally** — the network of links is the value, not the
  pages themselves. Prefer a link to copy-paste.
- **Path mentions get backticks**: `packages/ui/src/tokens.css`.
- **Code references with line numbers** are written as
  `path/to/file.rs:42` so the reader can click straight there.
- **No emojis in body copy.** The product surface uses them sparingly;
  the docs don't.
- **No marketing voice.** Be concrete. Cite an ADR or a code line for
  every "we will" statement.

## Maintenance

This `docs/` tree is **part of the contract**. Treat it like the code:

- A PR that changes behaviour also updates the relevant doc(s).
- New milestones get a changelog row in [`../CHANGELOG.md`](../CHANGELOG.md)
  *and* the relevant doc page (e.g. v0.5 sync → re-read
  [`architecture/sync-internals.md`](architecture/sync-internals.md)).
- Stale docs get fixed or deleted, never left to mislead.

When in doubt, file a `type/docs` issue and link the symbol or feature
the doc is missing. We treat doc gaps as bugs.
