# ADR-0018: Search query grammar

- **Status**: Accepted
- **Date**: 2026-05-15
- **Deciders**: @goldr0g3r
- **Tags**: search, tantivy, query-parser, ux, v0.3

## Context

[ADR-0004](0004-tantivy-full-text-search.md) committed Lattice to
[Tantivy](https://github.com/quickwit-oss/tantivy) as the full-text engine.
[ROADMAP.md](../../ROADMAP.md) and the v0.3 epic
([#13](../../.github/issues/epics.yml)) require the search bar to accept:

- Free-text terms scored against `title` (boosted), `body`, and `tags`.
- Field-scoped filters — `tag:foo`, `path:Engineering/`,
  `created:>2026-01-01`.
- Quoted phrase queries (`"distributed systems"`).
- Prefix queries (`raft*`).
- Fuzzy queries (`raft~`, default edit distance 1).
- Boolean composition (implicit AND between terms, explicit `OR`, `-` for
  NOT).

Tantivy ships [`QueryParser`](https://docs.rs/tantivy/latest/tantivy/query/struct.QueryParser.html)
which already implements most of the lexical surface (Lucene-style:
`field:value`, `"phrase"`, `term*`, `term~1`, `+required`, `-excluded`,
`(a OR b)`). The decision is whether to (a) lean on `QueryParser` as the
sole grammar, (b) hand-roll a Lattice DSL that targets Tantivy primitives,
or (c) put a thin facade in front of `QueryParser` and only hand-roll the
operators it doesn't cover.

The friction with raw `QueryParser`: it has no native idea of dates
(`created:>2026-01-01`), no idea that `path:Engineering/` should match
the **prefix** of a stored `path` field, and emits errors that surface
as opaque strings to the user. We also want to keep the door open for
plugin-contributed operators (v0.9 SDK) — that requires owning the AST.

The friction with a fully hand-rolled DSL: we'd reinvent quote / prefix /
fuzzy / boolean parsing that Tantivy already implements correctly,
including operator precedence and escape rules — easy to get subtly
wrong, and a parser bug becomes a search-correctness bug.

## Decision

**We will use a hybrid: a thin hand-rolled `lattice-search` parser layer
that recognises Lattice-specific operators (`tag:`, `path:`,
`created:`, `updated:`) and rewrites everything else into Tantivy's
`QueryParser` input.** The hand-rolled layer owns the AST
(`Query::All`, `Query::Term`, `Query::Phrase`, `Query::Prefix`,
`Query::Fuzzy`, `Query::Field`, `Query::Date`, `Query::And`, `Query::Or`,
`Query::Not`) and produces a `tantivy::query::Query` boxed trait object
ready for the searcher.

Concretely:

- **Lexer**: produces tokens for `IDENT`, `STRING`, `COLON`, `WILDCARD`,
  `TILDE`, `LT`, `LE`, `GT`, `GE`, `LPAREN`, `RPAREN`, `OR`, `MINUS`,
  `WHITESPACE`. Strings handle `\"` / `\\` escapes.
- **Parser**: recursive descent, precedence `OR < AND < NOT < ATOM`,
  implicit AND between adjacent atoms.
- **Field-scoped atoms**: `tag:foo` → `Query::Field { field: "tags",
  value: Term("foo") }`; `path:Eng/` (trailing `/`) → prefix match;
  `created:>2026-01-01` → range query against the SQLite metadata side
  joined by `id` (see [ADR-0019](0019-graph-snapshot-data-shape.md) for
  the join model). Date literals accept `YYYY-MM-DD` and
  `YYYY-MM-DDTHH:MM:SSZ`.
- **Free-text fallback**: any unscoped term/phrase/prefix/fuzzy atom
  serialises back to Tantivy `QueryParser` syntax and gets parsed there
  — so we inherit Tantivy's well-tested scoring + tokenizer behaviour
  for the bulk of the query string.
- **Error surface**: `LatticeError::InvalidQuery { query, span, reason }`
  — the parser tracks byte offsets so the UI can underline the bad
  region (`feat/search-query-dsl` PR exposes this in the search modal
  v0.3.4).

The Tantivy default field list is `title^3, body, tags` (locked here
because the search-modal UX assumes it).

## Consequences

### Positive

- **Correctness inherited.** Quote / prefix / fuzzy / boolean handling
  comes from Tantivy's parser; we don't reinvent escape semantics.
- **Lattice-shaped operators.** `tag:`, `path:`, `created:`, `updated:`
  read naturally and lower cleanly to the SQLite metadata side that
  already indexes them ([`core/lattice-core/migrations/0001_init.sql`](../../core/lattice-core/migrations/0001_init.sql)).
- **Typed errors.** `LatticeError::InvalidQuery` surfaces a span so the
  UI can highlight; opaque Tantivy errors get wrapped at the boundary.
- **Plugin extensibility.** v0.9's plugin SDK can register additional
  field operators (e.g., `repo:`, `arxiv:`) by appending to a
  `FieldRegistry` rather than forking the parser.
- **Snapshot-testable.** The AST is plain Rust enums; `insta` snapshots
  pin a ~20-query corpus against the parse output (see acceptance on
  issue #42).

### Negative

- **Two grammars in users' heads.** Lattice-specific operators look
  field-scoped, but free-text falls through to Tantivy. We mitigate
  with documentation; the operator list is short.
- **Re-parsing.** Each query gets parsed twice — once by us, once by
  Tantivy for the free-text portion. Negligible (microseconds vs the
  index-side milliseconds), but worth noting.
- **AST migration risk.** Any breaking change to the AST forces every
  plugin operator to migrate. We pin the AST shape with `#[non_exhaustive]`
  and add new variants additively.

### Neutral

- We do **not** support Tantivy's `^boost` syntax in the hand-rolled
  layer for v0.3; all boosting comes from the locked default-field list.
  Re-introducing per-term boost is a v0.4 follow-up if power users ask.
- Range queries on numeric fields (`size:>1024`) are deferred to v0.7
  (typed blocks bring numeric fields).

## Alternatives considered

### Option A — Tantivy `QueryParser` only

- **Pros**: zero parser code; battle-tested by Quickwit.
- **Cons**: no date ranges; opaque errors; no way to scope to the
  SQLite metadata side without bolt-ons; plugin extensibility means
  forking the parser.
- **Why rejected**: forces a worse error UX and constrains v0.9 plugin
  story.

### Option B — Fully hand-rolled DSL targeting Tantivy primitives directly

- **Pros**: total control over surface and AST.
- **Cons**: every quote / prefix / fuzzy / escape bug is on us; large
  surface to test exhaustively; significant up-front cost.
- **Why rejected**: reinventing well-tested code for marginal gain.

### Option C — SQLite FTS5 with `tag:` translated to JOIN

- **Pros**: one storage layer.
- **Cons**: rejected up-front by [ADR-0004](0004-tantivy-full-text-search.md);
  no per-field BM25; no fuzzy; no English stemmer; CJK tokenisation is
  weak.
- **Why rejected**: contradicts [ADR-0004](0004-tantivy-full-text-search.md).

## References

- [Tantivy `QueryParser`](https://docs.rs/tantivy/latest/tantivy/query/struct.QueryParser.html)
- [Lucene query syntax](https://lucene.apache.org/core/9_5_0/queryparser/org/apache/lucene/queryparser/classic/package-summary.html) — the lexical baseline `QueryParser` inherits.
- [ADR-0004](0004-tantivy-full-text-search.md) — Tantivy commitment.
- [ADR-0002](0002-rust-core-sqlx-sqlite.md) — SQLite metadata partner
  for field-scoped filters that don't live in the inverted index.
- v0.3 issue [#42](../../.github/issues/v0.3-tasks.yml) — query DSL
  acceptance criteria this ADR locks.
