# Architecture

> Living document. Updated as we ship. ADRs in [`docs/decisions/`](docs/decisions/).

## High-level

```text
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (UI)                          │
│   React 18 + TS + Vite + Tailwind + shadcn/ui                │
│   TipTap editor · CodeMirror 6 · Cytoscape · Excalidraw      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC (typed bridge, codegen)
┌──────────────────────────┴──────────────────────────────────┐
│                     Lattice Core (Rust)                      │
│   Vault FS · Markdown parser · SQLite store · Tantivy index  │
│   Yjs CRDT (yrs) · File watcher · AI provider abstraction    │
└─────┬──────────────────────────────────┬────────────────────┘
      │                                  │
┌─────┴──────────┐                ┌──────┴───────────┐
│ Local Storage  │                │ Sync (optional)  │
│  Files + .db   │                │ y-sync + Axum    │
└────────────────┘                └──────────────────┘
```

## Repo layout (target)

```text
lattice/
├─ apps/
│  ├─ desktop/          # Tauri 2 desktop shell (Windows, Linux)
│  └─ mobile/           # Tauri 2 mobile shell (Android)
├─ packages/
│  ├─ ui/               # shared React components (shadcn-derived)
│  ├─ editor/           # TipTap setup, schemas, extensions
│  ├─ core-bindings/    # auto-generated TS bindings from Rust core
│  └─ config/           # eslint, tsconfig, tailwind presets
├─ core/                # Rust workspace
│  ├─ lattice-core/     # main library (FS, index, CRDT)
│  ├─ lattice-search/   # Tantivy wrapper
│  ├─ lattice-ai/       # provider abstraction (OpenAI/Anthropic/Ollama)
│  └─ lattice-sync/     # CRDT sync client
├─ server/              # optional self-hostable sync server (Axum)
├─ extensions/
│  └─ web-clipper/      # browser extension (v0.8)
├─ docs/
│  ├─ vision.md
│  └─ decisions/        # ADRs
├─ .github/
│  ├─ workflows/
│  ├─ ISSUE_TEMPLATE/
│  └─ PULL_REQUEST_TEMPLATE.md
├─ ROADMAP.md
└─ README.md
```

## Data model (storage)

**Source of truth: the user's filesystem.**

```text
~/MyVault/
├─ .lattice/                  # private to the app
│  ├─ index.db                # SQLite (metadata, FTS via Tantivy on the side)
│  ├─ tantivy/                # search index
│  ├─ history/                # per-note Git-like history (v0.9)
│  └─ attachments/            # binary blobs not embedded in MD
├─ Engineering/
│  ├─ Distributed Systems.md
│  └─ Rust patterns.md
├─ AIML/
│  ├─ Transformers.md
│  └─ Datasets/
│     └─ ImageNet.md
└─ Bookmarks/
   └─ 2026-05-13 — A great paper.md
```

- **Notes are Markdown.** YAML frontmatter for typed metadata (id, tags, type, created, updated, aliases).
- **Index DB** is derivable from disk; if it's deleted, we re-build it.
- **Yjs CRDT state** lives next to the file as a sibling `.note.crdt` (only created when sync is enabled).

## Core API surface (Rust → TS via Tauri commands)

| Command | Purpose |
| --- | --- |
| `vault.open(path)` | Open / create a vault |
| `vault.list(filter)` | List notes with optional tag/path/text filter |
| `note.read(id)` | Read a note's frontmatter + body |
| `note.write(id, doc)` | Save a note (atomic write + index update) |
| `note.history(id)` | List historical versions (v0.9) |
| `search.query(q)` | Tantivy query, returns ranked hits |
| `graph.snapshot(scope)` | Return nodes/edges for graph view |
| `ai.chat(messages, providerKey)` | Streamed chat over vault context |
| `sync.start(serverUrl, key)` | Begin CRDT sync |

All commands are codegen'd into TypeScript types via [`ts-rs`](https://github.com/Aleph-Alpha/ts-rs).

## Performance budgets

| Operation | Budget |
| --- | --- |
| Cold start (desktop) | < 400 ms |
| Open a 10k-note vault | < 1.5 s |
| Search (10k notes, simple query) | < 30 ms p99 |
| Save + index a note | < 50 ms p99 |
| Graph snapshot (1k nodes) | < 100 ms |
| Memory (10k-note vault, idle) | < 200 MB |

CI enforces these via [`criterion`](https://github.com/bheisler/criterion.rs) benches gating PRs.

## Security model

- **Local by default.** No telemetry until the user opts in.
- **AI keys** stored in OS keychain (`keyring` crate).
- **Sync** is end-to-end encrypted with libsodium; server sees ciphertext.
- **Plugins** run in WASM with capability-based permissions (FS read/write are explicit grants).
- **CSP** locked down in the WebView; no remote code execution in the renderer.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Build & release

- **CI**: GitHub Actions matrix — `ubuntu-latest`, `windows-latest`, plus Android via `cargo-ndk`.
- **Releases**: tagged `vX.Y.Z` → `release.yml` builds + signs + uploads artifacts.
- **Auto-update**: Tauri updater plugin, signed manifests.

## Open questions (tracked as issues)

- Final pick of editor schema (Markdown-first vs JSON-first)
- DuckDB embedding strategy (in-process vs sidecar)
- Mobile editor: TipTap vs native-flavored alternative
