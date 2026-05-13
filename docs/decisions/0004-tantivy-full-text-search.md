# ADR-0004: Tantivy for full-text search

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: search, indexing, performance, rust

## Context

Search is the second-most-used feature in any PKM (after typing).
[ARCHITECTURE.md](../../ARCHITECTURE.md) budgets **<30 ms p99** for a query
across **10 000 notes**, with live re-indexing on save and rich operators
(`tag:foo`, `path:Engineering/`, `created:>2026-01-01`, fuzzy, phrase,
field-scoped). The indexer must:

- Tokenize **English prose, code identifiers, and CJK** acceptably out of
  the box (and let us swap tokenizers per field later).
- Stream incremental updates from the [`notify`](https://docs.rs/notify)
  file watcher without locking the writer.
- Run **in-process** (no extra daemon — we're a desktop app, not a server).
- Cross-compile to Windows, Linux, and Android.

## Decision

**We will use [Tantivy](https://github.com/quickwit-oss/tantivy)** as the
full-text search engine, embedded in the `core/lattice-search` crate
alongside the SQLite metadata store ([ADR-0002](0002-rust-core-sqlx-sqlite.md)).

Tantivy owns the inverted index on disk under `~/MyVault/.lattice/tantivy/`.
SQLite owns scalar metadata (paths, frontmatter, mtimes, tags as
relations). A search query plans against both: Tantivy for the text
scoring, SQLite for the filters and join-back to note rows.

## Consequences

### Positive

- **Speed.** Tantivy is consistently within 2× of Lucene in published
  benchmarks while shipping as a single Rust crate — easily inside our
  30 ms p99 budget on a 10 k-note index.
- **BM25 + custom scoring** out of the box; we can tune for our
  short-document corpus without forking.
- **First-class Rust.** No FFI, no daemon, no Java VM, no Python — runs
  on the same `tokio` runtime as the rest of the core.
- **Pluggable tokenizers** (English stemmer, ngram for fuzzy, code-aware,
  CJK) — we can pick per field (`body` vs `code` vs `path`).
- **Incremental indexing** is built in (merge policies, segment
  compaction); fits the "save and search 50 ms later" loop.
- **Used in production** by Quickwit and others at multi-TB scale —
  ample upside if we ever index a 100 k-note corpus.

### Negative

- **Index format is not stable across major versions** — a Tantivy
  upgrade may require a reindex. Mitigation: we treat the on-disk index
  as a **rebuildable cache** (same as `index.db` per
  [ADR-0002](0002-rust-core-sqlx-sqlite.md)) and version the index
  directory.
- **Schema migrations** require careful handling; we'll add a small
  versioning layer in `lattice-search`.
- **Smaller ecosystem than Lucene** — fewer ready-made analyzers
  (e.g., sophisticated phonetic, complex CJK segmentation). We accept the
  trade for being in-language.

### Neutral

- We could later expose Tantivy's BM25 weights in user settings for
  power users; not a v0.1 problem.
- A future "search across vaults" feature can keep one index per vault
  rather than a global one — simpler ownership story.

## Alternatives considered

### Option A — SQLite FTS5

- **Pros**: zero extra dependency, single file, fine for thousands of
  rows.
- **Cons**: weak tokenization for code identifiers and CJK, no BM25
  tuning, no per-field analyzers, harder to add features like fuzzy or
  phonetic. Performance is acceptable but ceiling is lower.
- **Why rejected**: search quality on code-and-prose vaults is a wedge
  feature; FTS5 caps it too early.

### Option B — MeiliSearch / Typesense as a sidecar

- **Pros**: amazing UX, typo-tolerance built in, popular APIs.
- **Cons**: separate daemon (extra process on every user machine, extra
  port, extra failure mode, extra installer step on Windows). Doesn't
  cross-compile to mobile cleanly.
- **Why rejected**: a desktop PKM should never ship a sidecar; it's a
  recipe for "user reports the search bar is broken" tickets.

### Option C — Lucene via JNI

- **Pros**: most mature FTS in existence.
- **Cons**: requires a JVM. Hard no for a Tauri 2 app whose pitch is
  "10 MB bundle, 40 MB idle".
- **Why rejected**: JVM dependency violates our perf budget.

### Option D — pgvector / Postgres FTS

- **Pros**: a future world where we offer hosted Lattice could share
  search infra with sync.
- **Cons**: not local-first; requires a server.
- **Why rejected**: violates [ADR-0006](0006-local-first-plain-markdown.md).

## References

- [Tantivy on GitHub](https://github.com/quickwit-oss/tantivy)
- [Tantivy vs Lucene benchmarks (Quickwit blog)](https://quickwit.io/blog/tantivy)
- [BM25 — Wikipedia](https://en.wikipedia.org/wiki/Okapi_BM25)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — performance budgets table.
- [ADR-0002](0002-rust-core-sqlx-sqlite.md) — pairing with SQLite metadata.
