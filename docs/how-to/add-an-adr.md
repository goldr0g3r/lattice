# How to add an ADR

> An **Architecture Decision Record** is a short Markdown file that
> captures one architecturally significant decision: the context, the
> chosen option, the consequences, and the alternatives considered.
>
> Background and lifecycle live at
> [`../decisions/README.md`](../decisions/README.md).

## When to write one

Reach for an ADR when:

- The decision **constrains future code** — picking a database, a
  license, a wire protocol, a serialisation format.
- The decision **rejects** a plausible alternative someone might
  ask about later. ADRs are mostly written for future-you who will
  ask "why didn't we do X?" two years from now.
- A reviewer's "why like this?" comment would otherwise go in a
  Slack DM and disappear.

Don't reach for an ADR when:

- The change is local to one file or function. A doc comment is
  enough.
- The decision is reversible without rippling through the
  codebase. Just do it.
- It's a one-off operational tweak (debounce window, cache size).
  These belong in code comments referencing an existing ADR or the
  relevant doc page.

## Steps

### 1. Pick the next number

```bash
ls docs/decisions/ | sort | tail -1
```

Take the next free four-digit number. ADR numbers are **append-only**;
never reuse one even if an ADR is deprecated.

### 2. Copy the template

```bash
cp docs/decisions/0000-template.md docs/decisions/00NN-<kebab-title>.md
```

The kebab-title is short and concrete:
`0018-plugin-sandbox-capability-model.md`,
not `0018-plugins.md` or `0018-how-plugins-work.md`.

### 3. Fill it in

The template has six sections. Stay disciplined about each:

- **Context** — one or two paragraphs. What changed in the world?
  What are the forces? Why now? Link to the issue, the PR, the
  upstream news.
- **Decision** — one paragraph in active voice: "We will use X
  because Y." If the decision is non-obvious, add a short rationale.
- **Consequences** — Positive / Negative / Neutral bullet lists.
  Be honest about the negatives; the value of the ADR is the
  trade-offs, not the upsides.
- **Alternatives considered** — at least two, with **Pros /
  Cons / Why rejected** for each. If you can't list a reason a
  reasonable engineer would have picked an alternative, you didn't
  research it enough.
- **References** — links to benchmarks, prior art, GitHub issues,
  blog posts, papers. Cite specific commits / PRs if applicable.

### 4. Update the index

Add a row to the table at the bottom of
[`docs/decisions/README.md`](../decisions/README.md):

```markdown
| 00NN | [Decision title](00NN-decision-title.md) | Accepted | YYYY-MM-DD |
```

Keep the rows sorted by number.

### 5. Open the PR

Title the PR `docs(adr): NNNN <decision title>`. Fill the PR
template. Tag relevant reviewers — `@goldr0g3r` for v0.1, plus
domain experts (e.g. `@frontend-team` for UI ADRs once we have one).

The PR description is a great place to **summarise the decision**
for reviewers who don't want to read the whole ADR — the merit of
the decision is what gets debated, not the ADR's prose.

## Verify

Before pushing the branch:

```bash
pnpm exec markdownlint-cli2 docs/decisions/00NN-*.md
git diff --stat docs/decisions/
```

The `--stat` should show **two** files: the new ADR and the updated
`README.md`. If it shows only one, you forgot to update the index.

## Common issues

### `MD040: Fenced code blocks should have a language specified`

Add a language tag to every fenced block: `bash`, `text`, `json`,
`rust`, `tsx`. Use `text` for plain output / pseudo-code.

### Reviewer asks "did you consider X?"

If X is a real alternative, add it to **Alternatives considered**
with the reasoning. ADRs are alive during review for exactly this
reason.

### The decision evolves during review

That's fine — re-read the **Decision** paragraph after each
significant change to the conversation. If the paragraph still
matches what's in your head, ship it. If not, rewrite the paragraph.

### The ADR conflicts with an existing one

If your decision **supersedes** an existing ADR, edit the older
ADR's `Status:` to `Superseded by ADR-NNNN` and link forward. The
older ADR's body **does not change** — that's the historical record.

Cross-link both ways from the new ADR's body and from the older
ADR's `Status:` line.

## References

- [`docs/decisions/README.md`](../decisions/README.md) — lifecycle,
  index.
- [`docs/decisions/0000-template.md`](../decisions/0000-template.md) —
  the template you'll copy.
- [MADR](https://adr.github.io/madr/) — the format we trim.
- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  — the PR-title format (`docs(adr): NNNN …`).
