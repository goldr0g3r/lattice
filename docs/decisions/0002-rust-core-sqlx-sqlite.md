# ADR-0002: Rust + sqlx + SQLite for the core

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: core, storage, language, database, performance

## Context

The Lattice core has to do a lot of work that the UI cannot:

- Parse and serialize Markdown losslessly.
- Maintain a derived **SQLite metadata index** + a **Tantivy** FTS index.
- Watch the filesystem and react to external edits (Obsidian-style).
- Speak CRDT for optional sync ([ADR-0005](0005-yrs-crdt-sync.md)).
- Embed AI providers, vector search, plugin sandboxing.
- Be shared across desktop (Win, Linux) and mobile (Android) via Tauri.

The core language and the data layer are joint decisions because the
data layer's ergonomics depend on the host language's async/error model.

## Decision

**We will write the core in Rust** as a Cargo workspace (`core/lattice-core`,
`core/lattice-search`, `core/lattice-ai`, `core/lattice-sync`), and **persist
metadata in SQLite via `sqlx`** with compile-time-verified queries.

User notes themselves stay on disk as Markdown (see
[ADR-0006](0006-local-first-plain-markdown.md)); the SQLite database lives
under `~/MyVault/.lattice/index.db` and is treated as a **rebuildable cache**.

## Consequences

### Positive

- **Performance.** Rust's zero-cost abstractions + SQLite's tuned C engine
  let us hit our perf budgets (search <30 ms p99, save+index <50 ms p99)
  without exotic tricks.
- **Memory safety** in a long-running process that owns the user's data —
  no GC pauses, no use-after-free.
- **Compile-time SQL** via `sqlx::query!` catches schema drift at build time.
- **Single core, three targets.** Rust cross-compiles cleanly to Windows,
  Linux, and Android (via `cargo-ndk`).
- **Async story** with `tokio` is mature; file watching, FTS, and IPC are
  all async-friendly.
- **Ecosystem fit.** Tantivy, `yrs`, `pulldown-cmark`, `notify`, `keyring`,
  `libsodium` bindings are all first-class Rust crates.
- **Rebuildable index.** If `index.db` corrupts, we delete and re-scan;
  the user's notes are unaffected.

### Negative

- **Higher contributor barrier.** Rust + async + SQL is a steep stack;
  we'll mitigate with `good first issue` tags on docs/UI work.
- **Build times.** Cold `cargo build` of the workspace can be 1–3 min;
  mitigated with `sccache` and CI caching.
- **Async SQLite quirks.** `sqlx` with SQLite uses a connection pool that
  serializes writes — fine for our workload, but a footgun for newcomers.

### Neutral

- We could later swap `sqlx` for `sea-orm` or raw `rusqlite` without changing
  storage shape; the schema is the contract.
- DuckDB is **not** the metadata store; it ships later as a *sidecar* for
  the "Workspace as data" SQL-over-notes feature (v0.9).

## Alternatives considered

### Option A — Node.js / TypeScript core

- **Pros**: every web dev can contribute; one language for the whole stack.
- **Cons**: GC pauses, single-threaded story for CPU-bound indexing,
  weaker FFI for native crypto/keyring, ~5× memory for the same workload.
- **Why rejected**: the perf budgets are non-negotiable.

### Option B — Rust + raw `rusqlite`

- **Pros**: synchronous, lighter dependency.
- **Cons**: synchronous in an async core means thread-pool shenanigans;
  no compile-time query checking.
- **Why rejected**: `sqlx`'s ergonomics + compile-time SQL are worth the
  trade.

### Option C — DuckDB as primary metadata store

- **Pros**: amazing analytics; one engine for "Workspace as data".
- **Cons**: OLAP, not OLTP — write amplification for our save-a-note
  workload; larger binary; harder to bundle on mobile.
- **Why rejected**: DuckDB ships in v0.9 as a sidecar **on top of** SQLite,
  not as a replacement.

### Option D — Embedded key-value (sled, redb, RocksDB)

- **Pros**: simple writes.
- **Cons**: no SQL → we'd hand-roll secondary indexes, joins, migrations.
  Tantivy already handles FTS; SQL is the right tool for the metadata
  schema we have.
- **Why rejected**: complexity bait.

## References

- [`sqlx` docs](https://docs.rs/sqlx)
- [SQLite "Appropriate Uses"](https://sqlite.org/whentouse.html)
- [Tantivy](https://github.com/quickwit-oss/tantivy)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — Data model section
