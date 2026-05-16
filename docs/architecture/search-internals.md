# Search internals

> Tantivy + SQLite, the v0.3 search story. The deep dive that
> backs the [search milestone](../../ROADMAP.md). Decision context:
> [ADR-0004 — Tantivy for full-text search](../decisions/0004-tantivy-full-text-search.md),
> [ADR-0002 — Rust + sqlx + SQLite for the core](../decisions/0002-rust-core-sqlx-sqlite.md).
>
> **Status (pre-v0.3):** the [`core/lattice-search/`](../../core/lattice-search/)
> crate is a stub today. This page captures the **target**
> architecture that v0.3 implements, so a contributor picking up the
> milestone has the playbook.

## Two-engine layout

Search is a **join across two indexes**:

- **Tantivy** ([`<vault>/.lattice/tantivy/`](../decisions/0004-tantivy-full-text-search.md))
  owns the inverted text index. It scores tokens against documents
  using BM25, returns ranked `(doc_id, score)` pairs.
- **SQLite** ([`<vault>/.lattice/index.db`](data-model.md#sqlite-index--vaultlatticeindexdb))
  owns the scalar metadata — paths, frontmatter, tags, links,
  attachments — and the join key (`note_id`) Tantivy uses.

A query plan looks like:

```text
user query "transformer tag:papers created:>2026-01-01"
            │
            ├── parse → { text: "transformer", filters: [tag=papers, created>2026-01-01] }
            │
            ├── filters → SQLite WHERE clause → set of candidate note_ids
            │
            ├── text  → Tantivy query restricted to those candidate ids → ranked hits
            │
            └── join back → SQLite SELECT enriching each hit with title, path, snippet
```

The split is deliberate: text is what Tantivy is good at; everything
else is what SQLite is good at. Neither engine is asked to do the
other's job.

## Tantivy schema (target)

One document per note. Fields:

| Field       | Type           | Indexed | Stored | Tokenizer                                 |
| ----------- | -------------- | ------- | ------ | ----------------------------------------- |
| `id`        | text           | yes     | yes    | raw                                       |
| `path`      | text           | yes     | yes    | path-segments                             |
| `title`     | text           | yes     | yes    | english + stemmer                         |
| `body`      | text           | yes     | no     | english                                   |
| `code_body` | text           | yes     | no     | code-aware (camelCase / snake_case split) |
| `tags`      | text           | yes     | yes    | raw                                       |
| `created`   | i64 (epoch ms) | yes     | yes    | —                                         |
| `updated`   | i64 (epoch ms) | yes     | yes    | —                                         |

Highlights:

- **Two body fields** (`body`, `code_body`) so prose stemming
  doesn't ruin code-identifier matches. The serialiser routes plain
  paragraphs to `body`, fenced code-block content to `code_body`.
- **Path-segments tokenizer** for `path:Engineering/`: splits on
  `/` so a `path:Engineering` filter matches both
  `Engineering/Distributed Systems.md` and
  `Engineering/Notes/foo.md`.
- **Raw `id` and `tags`** so exact lookups don't go through the
  English analyzer.
- **`body` is not stored** — we keep snippets via Tantivy's
  highlighter at query time, sourced from `body`.

The schema is versioned in `lattice-search`; bumping the schema
requires a reindex (which is cheap since the on-disk index is a
**rebuildable cache**).

## Indexing

### When to (re)index

| Trigger                                   | What happens                                                   |
| ----------------------------------------- | -------------------------------------------------------------- |
| `vault_open` on a fresh `.lattice/`       | Full scan — for each `.md`, parse, upsert SQLite + Tantivy.    |
| Watcher `IndexEvent::{Modified, Created}` | Per-note upsert into both indexes within the perf budget.      |
| Watcher `IndexEvent::Deleted`             | Delete the document by `id` from both indexes.                 |
| Watcher `IndexEvent::Renamed`             | One delete + one create (the `id` from frontmatter is stable). |
| User "Reindex vault"                      | Drop Tantivy directory + truncate SQLite tables → full scan.   |

### Atomicity

Tantivy and SQLite have separate write paths; there's no two-phase
commit between them. We accept a small window of inconsistency — if
the process dies between writing SQLite and committing the Tantivy
segment, the next search may include or omit one note. The integrity
check at startup detects this and re-indexes the offending note.

### Throughput

Tantivy commits are batched per file-watcher debounce tick (per
[ADR-0014](../decisions/0014-file-watcher-debounce.md)) so a `git
checkout` storm doesn't produce one segment per file:

```rust
let mut writer = index.writer(64 * 1024 * 1024)?; // 64 MiB
for event in batch {
    apply_event(&mut writer, event)?;
}
writer.commit()?;
```

The 64 MiB writer heap fits in our 200 MB idle budget; bump only if
profiling shows commit latency dominates.

## Query parsing

Operators we support in v0.3:

| Operator     | Example                              | Translates to                                  |
| ------------ | ------------------------------------ | ---------------------------------------------- |
| Free text    | `transformer attention`              | `body:(transformer attention)` (BM25 ranked)   |
| Tag          | `tag:papers`                         | SQL `INNER JOIN note_tags WHERE name='papers'` |
| Path         | `path:Engineering/`                  | SQL `WHERE path LIKE 'Engineering/%'`          |
| Date         | `created:>2026-01-01`, `updated:<7d` | SQL `WHERE created > ?`                        |
| Phrase       | `"local-first software"`             | Tantivy `PhraseQuery`                          |
| Field-scoped | `title:lattice`                      | Tantivy term query on `title` only             |
| Fuzzy        | `transfomer~`                        | Tantivy `FuzzyTermQuery`                       |
| Boolean      | `tag:rust AND -tag:legacy`           | Combine via Tantivy `BooleanQuery`             |

The query parser lives in `lattice-search::query::parse`; it returns
a `(text_query: TantivyQuery, scalar_filters: Vec<ScalarFilter>)`
pair that the executor combines.

We deliberately keep the syntax familiar to grep / Elasticsearch
users; a "search syntax help" tooltip in the UI documents the full
grammar.

## Ranking

Tantivy's default BM25 with these knobs:

- **`title` boost**: 3× — a hit in the title is much more relevant
  than a hit in the body.
- **`tags` boost**: 2× — tagged matches outrank passing mentions.
- **Recency boost** (post-launch tunable): `f(updated) =
exp(-(now - updated) / 30 days)` multiplier.

The boosts live in a small config struct, not hard-coded, so we can
tune per user feedback in v0.4 without re-indexing.

## Snippets

Tantivy's built-in `SnippetGenerator` produces a HTML-safe snippet
with `<b>` around matches. The renderer styles `<b>` via the design
tokens.

Snippet length: 240 chars. We pick the highest-scoring window per
document.

## Performance budget

From [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md#performance-budgets):

| Operation                         | Budget      |
| --------------------------------- | ----------- |
| Search (10 k notes, simple query) | < 30 ms p99 |

A criterion bench `bench_search.rs` lands with the v0.3 milestone
covering:

- 10 k-note vault, single-token query.
- 10 k-note vault, multi-token + scalar filter.
- 10 k-note vault, fuzzy 1-edit-distance query.

Regression-gated by the same workflow as the v0.1 benches; see
[`../development/performance.md`](../development/performance.md).

## Index location & versioning

```text
<vault>/.lattice/
├── index.db                                 SQLite metadata
└── tantivy/
    ├── version.txt                          schema version (e.g. "1")
    ├── meta.json                            Tantivy meta
    ├── *.fast / *.idx / *.pos / …           Tantivy segment files
    └── …
```

`version.txt` is checked at vault open. If it disagrees with the
running `lattice-search`'s expectation, we trigger a reindex. The
disagreement is logged at `info!` so a debugger can see why a vault
took 30 s to open after a Tantivy upgrade.

## What v0.3 does **not** include

- **Cross-vault search.** Each vault has its own Tantivy index; we
  don't federate.
- **Search-across-history** (v0.9 feature) — search hits link to the
  current note, not to a historical version.
- **Vector search / semantic similarity.** Lands separately in v0.4
  via `fastembed-rs` + a dedicated vector store. Tantivy stays the
  lexical-search engine.

## Future work

- **Phonetic / Soundex** matching on titles (post-v0.5).
- **Per-language analysers** (Spanish, German, Japanese) — Tantivy
  supports these; we'll add per-vault `language` config in
  Settings.
- **Query telemetry** (opt-in) so we can see common queries and tune
  ranking per real workloads.
- **Search index handoff to plugins** — read-only API so a
  `tag-cloud` plugin can iterate the term dictionary without
  breaking out of the WASM sandbox.
