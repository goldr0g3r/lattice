# User guide

> End-user documentation for Lattice. Lightweight and **forward-looking
> for now** — Lattice is pre-alpha at the time of writing, and these
> pages document the v0.1 → v0.2 surface as it lands. The
> [roadmap](../../ROADMAP.md) shows what arrives in each milestone.

If you're a developer, you probably want
[`../getting-started/`](../getting-started/README.md) instead.

## Pages

| Page                                          | What's in it                                                       |
| --------------------------------------------- | ------------------------------------------------------------------ |
| [`vault-basics.md`](vault-basics.md)          | What a vault is, where your notes live, how to back them up.       |
| [`markdown-flavor.md`](markdown-flavor.md)    | The Markdown subset Lattice reads and writes — wiki links, callouts, math, fenced embeds. |
| [`keyboard-shortcuts.md`](keyboard-shortcuts.md) | Every keyboard binding, organised by what you'd be doing.        |

## Quick reference

### What does Lattice do today?

As of the v0.1 milestone:

- **Open or create a vault** — a folder of Markdown files on your
  disk.
- **List, open, save, and create notes** in that vault.
- **A workspace shell** with a sidebar, picker rail, and editor pane.
- **A command palette** (`Ctrl+K` / `⌘K`) for keyboard-first
  navigation.
- **Light + dark themes** that follow your OS preference and respect
  an explicit choice.

What's coming, in order:

- **v0.2** — TipTap block editor, slash commands, wiki links,
  KaTeX math, Mermaid + Excalidraw embeds.
- **v0.3** — full-text search, backlinks, the graph view, daily
  notes.
- **v0.4** — the AI panel.
- **v0.5** — sync.

The roadmap is in [`../../ROADMAP.md`](../../ROADMAP.md).

## Where your data lives

Your notes are in your vault folder. Lattice doesn't have its own
storage; it reads and writes plain Markdown files in the location
you choose. See [`vault-basics.md`](vault-basics.md).

## Getting help

- **Bug?** [Open an issue](https://github.com/goldr0g3r/lattice/issues/new?template=bug_report.yml).
  Tell us your OS, Lattice version, and how to reproduce.
- **Feature request?** [Open a feature request](https://github.com/goldr0g3r/lattice/issues/new?template=feature_request.yml).
- **Question?** Search the [Discussions](https://github.com/goldr0g3r/lattice/discussions)
  tab; if it's not there, ask. We'll add it to the
  [FAQ](../faq.md).
