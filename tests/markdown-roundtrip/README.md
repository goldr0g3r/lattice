# Markdown round-trip golden corpus

> Test fixtures for v0.2 PR #1 (`feat(editor): Markdown round-trip + golden-corpus test suite`).
> Decision: [ADR-0015](../../docs/decisions/0015-markdown-flavor-and-serialization.md).

## Acceptance gate

For every `<name>.md` file in this directory, both the Rust and the
TypeScript serialiser must round-trip byte-identical:

```text
parse(file) -> NoteDoc -> serialise(NoteDoc) -> output
assert output == file
```

CI runs the corpus through both serialisers; any drift fails the
`feat(editor): Markdown round-trip` PR check.

## Corpus structure

Each fixture is a single `.md` file. Filenames are kebab-case and
describe the pathological case under test, e.g.:

- `simple.md` — sanity baseline
- `headings.md` — all six heading levels + setext variants
- `lists-nested.md` — three-level nesting, mixed ordered / unordered
- `tables-with-pipes-in-code.md` — GFM tables where a cell contains
  backtick-fenced inline code with literal `|`
- `footnotes.md` — GFM footnotes, including out-of-order definitions
- `frontmatter-edges.md` — empty frontmatter, multi-line scalars,
  preserved key order
- `hard-line-breaks.md` — two-space line breaks vs `\` syntax
- `wiki-links.md` — `[[Title]]` and `[[Title|Alias]]`
- `callouts.md` — `> [!info]` / `> [!warn]` / `> [!tip]`
- `math-inline-block.md` — `$x$` and `$$x$$`
- `mermaid-fence.md` — ` ```mermaid ` fenced block
- `excalidraw-fence.md` — ` ```excalidraw ` fenced block (per [ADR-0017](../../docs/decisions/0017-excalidraw-embed-storage.md))
- `html-snippet.md` — raw `<details>` block
- `lattice-typed-block.md` — future-proofing for v0.7 typed nodes

## Adding a new fixture

1. Drop the `.md` file into this directory.
2. Run `cargo test -p lattice-core --test markdown_roundtrip` locally
   and `pnpm --filter @lattice/editor test` to confirm both sides
   accept it.
3. Commit the fixture. The CI runs the same two suites.

If a fixture fails: either the serialiser needs fixing (most common),
or the fixture is itself ambiguous and needs to be tightened.
