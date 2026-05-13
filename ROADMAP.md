# Roadmap

> Lattice ships in small, useful releases. Each milestone is a self-contained
> capability bundle. Dates are aspirational; scope is firm.

## Guiding principles

1. **Local-first, always.** Your files are yours; sync is optional.
2. **Fast first, features second.** Every release has a perf budget.
3. **Engineer + ML practitioner first.** Code, math, papers, models, datasets are first-class.
4. **Plugin-friendly.** Anything we build, you can replace.
5. **Open + transparent.** All planning happens in public issues.

---

## v0.1 — Foundation 🏗️

> Build the skeleton. No user-visible features beyond opening a note.

- [ ] pnpm + Turborepo monorepo (`apps/desktop`, `apps/mobile`, `packages/ui`, `packages/core-bindings`, `core/` Rust workspace)
- [ ] Tauri 2 desktop shell builds on Windows + Linux in CI
- [ ] React + Vite + TailwindCSS + shadcn/ui set up
- [ ] Rust `core/` crate with SQLite schema migration (`sqlx`)
- [ ] Vault concept: open / create / switch a folder of Markdown files
- [ ] Basic file watcher (`notify`) + reactive index
- [ ] Logging, error model, telemetry opt-in
- [ ] Initial visual identity: typography, color tokens, Lattice logo

## v0.2 — The Editor ✍️

> Type a note. Make it look beautiful.

- [ ] TipTap block editor (paragraphs, headings, lists, quotes, code blocks)
- [ ] Slash command menu
- [ ] CodeMirror 6 embedded code blocks with syntax highlighting
- [ ] Markdown round-trip (parse on load, serialize on save) — no data loss
- [ ] `[[Wiki links]]` autocomplete + click-to-navigate
- [ ] LaTeX (KaTeX), Mermaid, Excalidraw embeds
- [ ] Drag-and-drop images (stored as files next to the note)
- [ ] Command palette (⌘K / Ctrl+K)

## v0.3 — Navigation, Search, Graph 🔎

> Find anything. See everything.

- [ ] Full-text index with Tantivy; live re-indexing on save
- [ ] Search modal with operators (`tag:`, `path:`, `created:`, fuzzy)
- [ ] Backlinks panel + unlinked-mention detection
- [ ] Tag tree, folder tree, favorites, pinned
- [ ] Local + global **graph view** (Cytoscape.js) — filters, color by tag
- [ ] Daily-notes plugin

## v0.4 — AI Panel 🤖

> Bring your own key. Or run it locally.

- [ ] Pluggable AI provider system (OpenAI, Anthropic, Ollama)
- [ ] Chat-with-your-vault (local embeddings via `fastembed-rs`, RAG)
- [ ] Per-note actions: summarize, generate flashcards, find related
- [ ] AI-suggested tags + titles
- [ ] Prompt library (user-editable)
- [ ] Privacy: nothing leaves the device unless explicitly enabled per provider

## v0.5 — Sync (Self-hostable) 🔁

> Sync your vault across devices, end-to-end encrypted.

- [ ] CRDT data layer (Yjs / `yrs`) backing the editor doc model
- [ ] Reference sync server (Axum + `y-sync` over WebSocket)
- [ ] S3-compatible blob store for media
- [ ] E2EE with libsodium; user holds the keys
- [ ] Conflict-free multi-device editing
- [ ] One-tap deploy guides (Fly.io, Railway, Docker)

## v0.6 — Android 📱

> Lattice in your pocket.

- [ ] Tauri 2 Android build green in CI
- [ ] Touch-first UI: bottom sheets, swipe nav, large hit targets
- [ ] Mobile editor adapted from desktop (TipTap mobile gestures)
- [ ] Share sheet integration (share-to-Lattice)
- [ ] Offline-first, syncs when online
- [ ] F-Droid + APK distribution; Play Store (post-stability)

## v0.7 — Engineering & ML superpowers 🧠

> The features that make Lattice unique.

- [ ] Jupyter `.ipynb` import + render
- [ ] **Dataset** & **Model** typed objects with schema panels
- [ ] Experiment log template + W&B / MLflow optional fetcher
- [ ] DOI / arXiv lookup → auto paper note with metadata + BibTeX export
- [ ] "Connected Papers"-style citation graph
- [ ] **Code-aware backlinks** — link to symbol/line in a Git repo, refresh on push

## v0.8 — Bookmarking 🌐

> Save the web like an engineer.

- [ ] Browser extension (Chrome / Firefox / Edge)
- [ ] Readability extraction + offline archive
- [ ] YouTube / podcast clipper with transcript + timestamps
- [ ] AI tag suggestions, duplicate detection
- [ ] "Read later" queue + spaced-repetition resurface

## v0.9 — Power features 🛠️

- [ ] **Time-travel** view (Git-style diff & blame per note)
- [ ] **Live canvas** (infinite, Excalidraw-derived, nodes back real notes)
- [ ] **Workspace as data** — DuckDB-on-SQLite, SQL queries over your notes
- [ ] Plugin SDK (WASM-sandboxed) + plugin marketplace stub
- [ ] Theme marketplace + community themes

## v1.0 — Public Beta 🎉

- [ ] Performance budget enforced (cold start <400 ms, search <30 ms p99)
- [ ] Accessibility audit (WCAG 2.2 AA)
- [ ] i18n scaffolding + first 3 locales
- [ ] Signed installers + auto-update on Windows / Linux
- [ ] Public beta launch, Hacker News post, docs site live

---

## Beyond v1.0 (ideas, unranked)

- macOS / iOS builds
- Real-time multiplayer (presence cursors)
- E2EE shareable public pages
- Voice notes + Whisper transcription
- Notebook-style runnable Python cells (via Pyodide / WASM kernel)
- HuggingFace integration (model & dataset cards auto-pull)
- Mobile widget for "today's note"
