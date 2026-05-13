# Vision

> One page. Read it before opening a PR. Refresh it when the world changes.

## North star

**The personal knowledge manager that engineers and ML practitioners
actually want — local-first, open, AI-native, blazing fast.**

Lattice is the note-taking app for the people who already use the
terminal, ship in Git, read papers, and run experiments. Their notes
are not pastel kanban cards; their notes are markdown files, snippets,
diagrams, and citations. They have a thousand of them. They want them
forever, on every machine they own, searchable in 30 ms, augmented by
a model they choose to trust, and stored in plain files on a disk they
control.

## One-year horizon (v1.0)

By the end of the year following v0.1, Lattice will be:

- **Shipping on Windows, Linux, and Android** as signed installers and
  an F-Droid build, with auto-update on desktop.
- **Fast** — cold start under 400 ms, search under 30 ms p99 across a
  10 000-note vault, save-and-index under 50 ms p99.
  ([ARCHITECTURE.md](../ARCHITECTURE.md))
- **Genuinely AI-native** — BYO key for cloud providers (OpenAI,
  Anthropic) **and** a first-class Ollama path so an entire vault can
  be embedded, queried, and summarised without anything leaving the
  device.
- **Engineer + ML-practitioner first** — `.ipynb` import, typed
  `Dataset` / `Model` / `Experiment` blocks, DOI / arXiv lookup, a
  citation graph, code-aware backlinks into Git repos.
- **Extendable** — WASM-sandboxed plugin SDK, theme marketplace, public
  contract for the Tauri-IPC surface.
- **Optionally sync-able** — self-hostable Axum + `y-sync` server,
  libsodium E2EE, S3-compatible blob store, one-tap deploy guides.

## Non-goals (for v1.0)

We're explicit about what we're **not** doing so that scope creep
doesn't kill velocity:

- **No real-time multiplayer** with presence cursors. Sync, yes;
  Figma-style co-editing, no. (Post-v1.0 if demand is loud.)
- **No macOS or iOS builds in v1.0.** Tauri 2 can do them; we choose
  to ship desktop Windows+Linux+Android first. macOS/iOS lands when
  someone with an Apple developer account picks up the milestone.
- **No hosted SaaS as primary distribution.** Local-first is the
  identity. A Lattice Cloud may exist later as a convenience layer on
  top of the same open server — never as a replacement.
- **No closed-source modules.** Every binary that ships under the
  Lattice name is AGPL-3.0 ([ADR-0007](decisions/0007-agpl-3-license.md)).
- **No Electron renderer** ever. ([ADR-0001](decisions/0001-tauri-2-cross-platform-shell.md))
- **No mandatory account** to use the app. Ever.

## Target users

We optimise for three personas — in priority order. Any feature that
helps **only** persona #4 ("a designer organising mood boards") is
deprioritised.

1. **The systems / back-end engineer** with 1 000+ markdown notes
   already living somewhere (Obsidian vault, a `notes/` folder, an
   abandoned Notion workspace). Switches editors for fun. Wants
   speed, plain files, keyboard everything, and `grep`.
2. **The ML practitioner** juggling papers, datasets, model checkpoints,
   training runs, and half-finished blog drafts. Needs typed
   research objects, citation graphs, `.ipynb` rendering, and
   AI-over-vault that doesn't leak their pre-print to a vendor.
3. **The staff / principal engineer** maintaining a personal
   architecture library — ADRs, design docs, post-mortems, oncall
   playbooks. Wants reliability and longevity above all else; if
   Lattice is gone tomorrow, the files still open in `vim`.

## Principles (the five rules we don't break)

These are the same five rules in [ROADMAP.md](../ROADMAP.md), restated
here as the **acceptance test** every PR must pass:

1. **Local-first, always.** Your files are yours; sync is optional;
   nothing phones home by default.
2. **Fast first, features second.** Every release ships with a perf
   budget. Crossing the budget blocks the release.
3. **Engineer + ML practitioner first.** Code, math, papers, datasets,
   experiments are first-class — not bolt-ons.
4. **Plugin-friendly.** Whatever we build, you can replace or extend
   via a WASM-sandboxed plugin. Our own features are written against
   the same SDK we ship.
5. **Open + transparent.** All planning happens in public issues; all
   decisions land in ADRs; the license stays OSI-approved
   ([ADR-0007](decisions/0007-agpl-3-license.md)).

## How we win

Read the competitive landscape: [docs/research/note-taking-landscape.md](research/note-taking-landscape.md).
TL;DR: every existing tool gives up at least one of {local-first,
open-source, AI-native, engineer/ML-first}. Lattice insists on all four.

## How we'll know we're succeeding

Quantitative, by v1.0:

- **10 000 GitHub stars** (industry benchmark for "real OSS project,
  not hype").
- **Median user vault size > 500 notes** (means people are actually
  living in it, not testing).
- **Cold-start, search, save budgets** ([ARCHITECTURE.md](../ARCHITECTURE.md))
  green on CI for the last 30 release tags.
- **>20 published community plugins.**

Qualitative:

- A meaningful number of Obsidian users have switched.
- A meaningful number of ML researchers cite Lattice in their workflow
  posts.
- The maintainers don't hate it.
