<div align="center">

# Lattice

**A modern, local-first, AI-native personal knowledge management app
built for engineers and ML practitioners.**

Your notes are plain Markdown files on your disk. The app is fast, beautiful,
and runs on Windows, Linux, and Android.

[![CI](https://github.com/goldr0g3r/lattice/actions/workflows/ci.yml/badge.svg)](https://github.com/goldr0g3r/lattice/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tauri 2](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-stable-orange?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)

[Vision](docs/vision.md) ·
[Roadmap](ROADMAP.md) ·
[Architecture](ARCHITECTURE.md) ·
[Contributing](CONTRIBUTING.md)

</div>

---

## Why Lattice?

Obsidian gives you ownership but no AI. Notion gives you collaboration but
locks your data away. Reflect bakes in AI but isn't local-first. None of them
are built around how engineers and ML practitioners actually work —
with code, math, datasets, papers, models, and experiments.

**Lattice** combines what makes each of those great and adds first-class
support for the things engineers care about.

## Highlights

### Foundations (every great PKM has these)
- 📝 **Block-based + Markdown editor** (TipTap / ProseMirror) with slash commands
- 🔗 `[[Wiki links]]`, backlinks panel, and unlinked-mention surfacing
- 🕸️ **Interactive graph view** — local and global
- 📂 **Local-first plain files** — Markdown on disk, Git-friendly, your files are yours
- 🔎 **Full-text search** with fuzzy matching and operators (powered by Tantivy)
- 🏷️ Tags, nested folders, favorites, pinned notes
- 🎨 Dark / light / custom themes, command palette, keyboard-first UX

### Built for engineers & ML practitioners
- 💻 **First-class code blocks** (CodeMirror 6) — 100+ languages, runnable snippets
- 🧮 **LaTeX + Mermaid + Excalidraw** native
- 📚 **Citations & paper notes** — DOI / arXiv lookup, BibTeX export, "Connected Papers"-style graph
- 🪐 **Jupyter `.ipynb` import & render**
- 📊 **Dataset cards** — typed objects with schema, splits, license, source
- 🤖 **Model cards** — params, dataset, benchmark scores, links
- 🧪 **Experiment log** — ML run notes (optional W&B / MLflow pull)

### AI panel (bring your own key)
- Chat with your vault (RAG over your notes)
- Summarize, generate flashcards, find related notes
- Works with OpenAI / Anthropic / **Ollama (local models)** — your choice, your key

### Bookmarking superpowers
- 🌐 **Web clipper** browser extension — saves clean Markdown, not HTML soup
- 📰 Readability extraction + offline archival
- 🎥 **YouTube / podcast bookmarking** with transcript + timestamped highlights
- 🧠 AI-suggested tags & duplicate detection
- 📥 "Read later" queue with spaced-repetition resurface

### One-of-a-kind features
- ⏳ **Time-travel** — every save is a Git-style commit; visual diff & blame
- 🖼️ **Live canvas** — infinite canvas where every node is a real note
- 🧷 **Code-aware backlinks** — link to a specific symbol/line in a Git repo
- 🗃️ **Workspace as data** — `SELECT title FROM notes WHERE tag = 'aiml'` via DuckDB-on-SQLite
- 🔌 **Plugin SDK** (WASM-sandboxed) from day one

## Tech stack

| Layer | Choice |
| --- | --- |
| Shell (desktop + Android) | **Tauri 2** |
| Core (shared library) | **Rust** — SQLite (`sqlx`), Tantivy (search), `yrs` (Yjs CRDT), `pulldown-cmark`, `notify` |
| Frontend | **React 18 + TypeScript + Vite** |
| Styling | **TailwindCSS + shadcn/ui** (Radix primitives) |
| Editor | **TipTap** (ProseMirror) + **CodeMirror 6** |
| Graph | **Cytoscape.js** / `react-force-graph` |
| Sketches / math / diagrams | **Excalidraw**, **KaTeX**, **Mermaid** |
| State / data | **Zustand**, **TanStack Query** |
| Sync server (optional) | **Axum** + `y-sync` over WebSocket, S3-compatible blob store, E2EE via libsodium |
| Monorepo | **pnpm + Turborepo**; Rust workspace |
| CI / release | **GitHub Actions** — matrix Win / Linux / Android |

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design and
[`docs/decisions/`](docs/decisions/) for the ADRs.

## Platforms

| Platform | Status |
| --- | --- |
| Windows 10/11 (x86_64) | 🛠️ Planned for v0.1 |
| Linux (x86_64, AppImage + .deb) | 🛠️ Planned for v0.1 |
| Android 10+ | 🛠️ Planned for v0.6 |
| macOS | 🔮 Community-supported, post v1.0 |
| iOS | 🔮 Post v1.0 |

## Project status

🚧 **Pre-alpha — actively scaffolding.**
Track everything in the [Lattice Project board](../../projects) and the
[Roadmap](ROADMAP.md).

## Getting started (development)

> Prerequisites: **Node 20+**, **pnpm 9+**, **Rust stable**, **Tauri 2 CLI**.
> See the full [development guide](CONTRIBUTING.md#development-setup).

```bash
git clone https://github.com/goldr0g3r/lattice.git
cd lattice
pnpm install
pnpm tauri dev
```

(Build wiring lands in milestone **v0.1 — Foundation**. Until then, this
README documents the target.)

## Contributing

We love contributions of all kinds — code, design, docs, ideas.
Start with [CONTRIBUTING.md](CONTRIBUTING.md) and the
[good-first-issue](../../labels/good%20first%20issue) label.

## License

[AGPL-3.0](LICENSE) — copyleft. If you run a modified version of Lattice
as a network service, you must share your changes.
