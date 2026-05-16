# Core overview

> Tour of the Rust workspace under [`core/`](../../core/). What each
> crate owns, what it exposes, and where to look first.
>
> Decision context:
> [ADR-0002 — Rust + sqlx + SQLite for the core](../decisions/0002-rust-core-sqlx-sqlite.md),
> [ADR-0008 — pnpm + Turborepo monorepo](../decisions/0008-pnpm-turborepo-monorepo.md).

## Workspace shape

The Rust workspace has five members:

```text
core/
├─ lattice-core/      The bulk of the work — vault, FS, MD, DB, watcher, telemetry
├─ lattice-search/    Tantivy wrapper (v0.3+)
├─ lattice-ai/        Provider abstraction + RAG (v0.4+)
└─ lattice-sync/      yrs CRDT + reference client (v0.5+)

apps/desktop/src-tauri/   The desktop app's Rust binary (a workspace member, not in core/)
```

Workspace-level pinning lives in the root [`Cargo.toml`](../../Cargo.toml):

- One `[workspace.dependencies]` table — version drift is impossible.
- One `[profile.release]` block — every binary gets the same LTO /
  strip / opt-level treatment.

## `lattice-core` — the heart

The crate at [`core/lattice-core/`](../../core/lattice-core/). All
the "what is the vault, how do we read and write notes, how do we
keep the index honest" logic lives here. Exposed to the Tauri shell
and to other core crates as an ordinary library.

### Modules

```text
core/lattice-core/src/
├─ lib.rs            crate root, re-exports, version
├─ config.rs         <user-config-dir>/lattice/config.json reader/writer
├─ db.rs             sqlx connection pool + migrations
├─ error.rs          LatticeError, LatticeResult
├─ logging.rs        tracing-subscriber + tracing-appender wiring
├─ markdown/         parser + serializer (NoteDoc round-trip)
├─ notes.rs          notes::list / read / write / create_blank
├─ telemetry.rs      opt-in JSONL emitter
├─ types.rs          shared types (Note, Tag, Link, Attachment, …)
├─ vault.rs          Vault open / create / switch / close
└─ watcher.rs        notify-debouncer-full wrapper + IndexEvent
```

Public re-exports from `lib.rs` are the **only** stable surface;
treat anything else as private.

### Public surface (selected)

| Type / fn                                   | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `Vault`                                     | Owns the vault root + the SQLite pool. `open`/`create`/`info`/`close`. |
| `LatticeError` / `LatticeResult`            | Error type that crosses the IPC boundary.                              |
| `IndexEvent`, `IndexEventKind`              | Watcher payload sent to the index + the renderer.                      |
| `Watcher::start`                            | Spin up the background watch task; drop the handle to stop.            |
| `notes::list / read / write / create_blank` | The four IO primitives every note command boils down to.               |
| `NoteSummary` / `NoteContent`               | DTOs for the picker rail and the editor pane.                          |
| `TelemetryClient` / `TelemetrySettings`     | Opt-in emitter + persisted settings shape.                             |

### Lifecycle

The typical sequence per process:

1. **`logging::init`** — set up `tracing` with the daily-rotating
   JSONL appender.
2. **`config::read`** — pull `last_vault` and the telemetry
   settings.
3. **`Vault::open(path)`** — open SQLite, run migrations, return a
   `Vault` handle.
4. **`Watcher::start(path, callback)`** — spawn the FS watcher with
   the per-OS debounce defaults
   ([ADR-0014](../decisions/0014-file-watcher-debounce.md)).
5. **(loop)** Tauri commands call into `notes::*` / `vault::info`,
   logging each entry/exit.
6. **`vault.close().await` + `drop(watcher)`** — graceful shutdown
   on app close.

`config.last_vault` is updated on every successful `vault_open` so a
re-launch auto-reopens. See
[`apps/desktop/src-tauri/src/commands/vault.rs`](../../apps/desktop/src-tauri/src/commands/vault.rs)
for the wiring.

### Database

Schema migrations live in
[`core/lattice-core/migrations/`](../../core/lattice-core/migrations/),
applied via `sqlx::migrate!`. The v0.1 schema is in
[`0001_init.sql`](../../core/lattice-core/migrations/0001_init.sql)
and described under
[`data-model.md#sqlite-index--vaultlatticeindexdb`](data-model.md#sqlite-index--vaultlatticeindexdb).

Adding a migration is a recipe:
[`../how-to/add-a-database-migration.md`](../how-to/add-a-database-migration.md).

### Markdown round-trip

The hardest single contract in the codebase. `markdown::parse(s)`
returns a `NoteDoc`; `markdown::serialize(&doc)` returns the
original `s` (byte-identical) for fixtures in
[`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/).

The matching TS implementation in
[`packages/editor/src/markdown/`](../../packages/editor/src/markdown/)
must produce the **same** AST and serialise to the **same** bytes.
The dual-pipeline assertion is what makes the editor safe.

Deep dive: [`editor-internals.md`](editor-internals.md).

### Watcher

`Watcher::start` wires `notify-debouncer-full` to a closure that
emits `IndexEvent`s. The debounce window is per-OS (Linux 250 ms,
Windows 100 ms, macOS 200 ms) per
[ADR-0014](../decisions/0014-file-watcher-debounce.md), overridable
via `watcher.debounce_ms` in the vault config.

The closure runs on a background thread; its only job is to pack
the event into the typed `IndexEvent` and forward it (over a
`tokio::sync::mpsc::channel(64)` to the index, and via
`AppHandle::emit` to the renderer).

### Telemetry

Off by default. When enabled, events stream to
`<vault>/.lattice/logs/telemetry.jsonl`. The full shape is in
[`../telemetry.md`](../telemetry.md);
[ADR-0012](../decisions/0012-telemetry-event-schema-versioning.md)
governs schema evolution.

## `lattice-search` (v0.3)

[`core/lattice-search/`](../../core/lattice-search/). Stub today;
flesh out per the v0.3 milestone.

Planned shape:

```rust
pub struct Index { … }

impl Index {
    pub async fn open(path: &Path) -> LatticeResult<Self>;
    pub async fn upsert(&self, note: &NoteForIndex) -> LatticeResult<()>;
    pub async fn delete(&self, id: &str) -> LatticeResult<()>;
    pub async fn query(&self, q: &str, opts: QueryOpts) -> LatticeResult<Vec<Hit>>;
}
```

Tantivy owns the inverted index under
`<vault>/.lattice/tantivy/`. Filters (`tag:`, `path:`, `created:`)
join back to SQLite for scalar fields. See
[ADR-0004](../decisions/0004-tantivy-full-text-search.md) and the
deep dive at [`search-internals.md`](search-internals.md).

## `lattice-ai` (v0.4)

[`core/lattice-ai/`](../../core/lattice-ai/). Stub today.

Planned shape:

```rust
pub trait Provider {
    async fn chat(&self, messages: &[Message]) -> Result<ChatStream, AiError>;
    async fn embed(&self, text: &str) -> Result<Vec<f32>, AiError>;
}

pub struct OpenAi { … }
pub struct Anthropic { … }
pub struct Ollama { … }
```

Keys live in the OS keychain via the `keyring` crate. Local
embeddings use `fastembed-rs`. RAG over the vault is composed in the
desktop shell, not in this crate.

## `lattice-sync` (v0.5)

[`core/lattice-sync/`](../../core/lattice-sync/). Stub today.

Planned shape:

```rust
pub struct SyncClient { … }

impl SyncClient {
    pub async fn connect(server: &Url, key: &SecretKey) -> Result<Self, SyncError>;
    pub async fn push(&self, note_id: &str, doc: &yrs::Doc) -> Result<(), SyncError>;
    pub async fn subscribe<F>(&self, on_update: F) -> SubscriptionHandle;
}
```

Wire format is `y-sync` over WebSocket; transport encryption is TLS,
payload encryption is libsodium with user-held keys
([ADR-0005](../decisions/0005-yrs-crdt-sync.md)). Deep dive at
[`sync-internals.md`](sync-internals.md).

## Cross-cutting conventions

These show up in every crate:

- `#![forbid(unsafe_code)]` at every `lib.rs`.
- `#![warn(missing_docs)]` in libraries; doc comments on every
  public item.
- `tracing` for logs; never `println!` outside examples.
- Tests use `tempfile::TempDir`; never write to `target/`.
- Errors are typed (`thiserror::Error`), and any error that crosses
  IPC implements `From<MyError> for LatticeError`.
- `#[derive(TS)]` plus `#[ts(export, export_to = "...")]` on every
  type that's exposed to the renderer.

The full coding style is in
[`../development/coding-standards.md`](../development/coding-standards.md).
