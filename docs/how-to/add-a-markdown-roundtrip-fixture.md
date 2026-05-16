# How to add a Markdown round-trip fixture

> The golden corpus at
> [`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/) is
> the contract that locks the editor's Markdown round-trip.
> Background: [ADR-0015](../decisions/0015-markdown-flavor-and-serialization.md);
> deep dive at
> [`../architecture/editor-internals.md#markdown-pipeline`](../architecture/editor-internals.md#markdown-pipeline).

## When to do it

You're:

- Fixing a parser or serialiser bug — write the failing case first.
- Adding a new Markdown feature (callouts, math, fenced embed) —
  lock the on-disk shape with a fixture.
- Hardening the parser against a pathological input someone reported.

The corpus is **append-only**: existing fixtures don't change unless
the bytes-on-disk contract intentionally changes (rare and ADR-worthy).

## What goes in a fixture

One self-contained `.md` file that demonstrates one phenomenon. The
existing fixtures, with what each locks down:

| Fixture                        | Locks down                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `simple.md`                    | Sanity baseline — everyone parses this the same.                                                |
| `headings.md`                  | All six ATX heading levels (we don't emit setext on round-trip).                                |
| `lists-nested.md`              | Three-level nesting; mixed ordered / unordered.                                                 |
| `tables-with-pipes-in-code.md` | GFM tables with backtick-fenced inline code that contains literal `\|`.                         |
| `footnotes.md`                 | GFM footnotes; out-of-order definitions; multi-paragraph footnotes.                             |
| `frontmatter-edges.md`         | Empty frontmatter, multi-line scalars, preserved key order.                                     |
| `hard-line-breaks.md`          | Two-space line breaks vs `\` syntax.                                                            |
| `wiki-links.md`                | `[[Title]]` and `[[Title\|Alias]]`.                                                             |
| `callouts.md`                  | `> [!info]` / `> [!warn]` / `> [!tip]` blocks.                                                  |
| `math-inline-block.md`         | `$x$` and `$$x$$`.                                                                              |
| `mermaid-fence.md`             | ` ```mermaid ` fenced block.                                                                    |
| `excalidraw-fence.md`          | ` ```excalidraw ` fenced block (per [ADR-0017](../decisions/0017-excalidraw-embed-storage.md)). |
| `html-snippet.md`              | Raw HTML passthrough (`<details>`).                                                             |

Pick a kebab-case filename that names the phenomenon, not the bug
that prompted you to add it (`tables-with-pipes-in-code.md`, not
`fixes-issue-42.md`).

## Steps

### 1. Write the fixture

```bash
$EDITOR tests/markdown-roundtrip/<phenomenon>.md
```

Three rules:

- **One concept per fixture.** A "kitchen sink" file mixes failure
  modes; we want each fixture to fail one diagnostic at a time.
- **Realistic content.** No `lorem ipsum`. Use prose / code / data
  similar to what real users would write.
- **No final-line ambiguity.** End with `\n` (a trailing newline).
  Most editors do this; check by `xxd | tail -2`.

### 2. Generate the AST snapshot

The Rust serialiser provides a `dump_ast` example for this:

```bash
cargo run --quiet --example dump_ast -- \
  tests/markdown-roundtrip/<phenomenon>.md \
  > tests/markdown-roundtrip/<phenomenon>.expected.json
```

Inspect the output. If it matches what you expected, the fixture is
ready.

If it **doesn't** match — the AST has surprising shape — that's
either the parser misreading your fixture (a bug to fix before
committing) or your mental model being wrong (fix the fixture or
the docs).

### 3. Run both pipelines locally

Both Rust and TS must agree:

```bash
cargo test -p lattice-core --test markdown_roundtrip
pnpm --filter @lattice/editor test
```

The Rust test verifies the round-trip + the AST snapshot. The TS
test verifies the round-trip on the JS side; if it has a separate
expected-AST snapshot, the test path will tell you where.

### 4. Commit

```bash
git add tests/markdown-roundtrip/<phenomenon>.md \
        tests/markdown-roundtrip/<phenomenon>.expected.json
git commit -m "test(editor): markdown round-trip fixture for <phenomenon>"
```

If your PR is also fixing a bug:

```bash
git commit -m "fix(editor): preserve <phenomenon> on round-trip"
```

…and the fixture lands in the same commit.

## When a fixture fails on CI

You opened a PR; CI's
`Verify markdown round-trip AST snapshots` step (in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) failed.
Two scenarios:

### You changed the parser intentionally

Re-generate the AST snapshots locally:

```bash
for f in tests/markdown-roundtrip/*.md; do
  [ "$(basename "$f")" = "README.md" ] && continue
  cargo run --quiet --example dump_ast -- "$f" \
    > "${f%.md}.expected.json"
done
git add tests/markdown-roundtrip/
git commit -m "feat(editor): refresh round-trip AST snapshots for <reason>"
```

PowerShell:

```powershell
Get-ChildItem tests\markdown-roundtrip\*.md |
  Where-Object Name -ne 'README.md' |
  ForEach-Object {
    $expected = $_.FullName -replace '\.md$', '.expected.json'
    cargo run --quiet --example dump_ast -- $_.FullName | Set-Content $expected
  }
```

Push; CI re-runs against the refreshed snapshots.

### You broke the parser

The change was unintended — review the diff in
`tests/markdown-roundtrip/*.expected.json`. Each `.expected.json`
diff shows precisely what the AST shape changed to. Find the
fixture that drifted, fix the parser / serialiser, re-run the test
suite locally until everything is green again.

## Common issues

### `cargo run --example dump_ast` doesn't exist

Make sure you're at the repo root and the example is registered in
[`core/lattice-core/Cargo.toml`](../../core/lattice-core/Cargo.toml):

```toml
[[example]]
name = "dump_ast"
path = "examples/dump_ast.rs"
```

The file lives at `core/lattice-core/examples/dump_ast.rs`.

### The fixture round-trips on Rust but not TS (or vice versa)

The two sides agreed on the AST but not the byte-level output —
that's a serialiser bug. Compare the two outputs:

```bash
cargo run --example dump_ast -- tests/markdown-roundtrip/<f>.md  # AST
# look for the parser stage that produces a different shape
```

Then dive into [`packages/editor/src/markdown/serializer.ts`](../../packages/editor/src/markdown/serializer.ts)
or [`core/lattice-core/src/markdown/serializer.rs`](../../core/lattice-core/src/markdown/serializer.rs)
to find the per-node case that emitted the wrong bytes.

### Markdown lint complains about the fixture

The corpus is excluded from markdownlint via
[`.markdownlint-cli2.jsonc`](../../.markdownlint-cli2.jsonc):

```jsonc
"ignores": [
  // …
  "tests/markdown-roundtrip/**",
]
```

Don't fight it. Fixtures are byte-identical contract data; lint
rules conflict with the canonical syntax we want to lock down (e.g.
`MD028 — blank line in blockquote` in `callouts.md`).

### A fixture is "obviously wrong" CommonMark

That can happen — the corpus includes `frontmatter-edges.md` and
`tables-with-pipes-in-code.md` precisely because the spec is
under-specified for those cases. The corpus encodes what **Lattice**
does, which is sometimes a stricter or stricter-feeling subset of
the spec. Document the choice in the fixture's header comment if
the behaviour would surprise a reasonable reader.

## References

- [`tests/markdown-roundtrip/README.md`](../../tests/markdown-roundtrip/README.md) — the corpus's own README.
- [ADR-0015 — Markdown flavor](../decisions/0015-markdown-flavor-and-serialization.md)
- [`../architecture/editor-internals.md#markdown-pipeline`](../architecture/editor-internals.md#markdown-pipeline) — how the parser + serialiser are wired.
- [CommonMark 0.31 spec](https://spec.commonmark.org/0.31/)
- [GitHub-Flavored Markdown spec](https://github.github.com/gfm/)
