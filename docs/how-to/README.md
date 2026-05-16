# How-tos

> Recipes for the well-understood, recurring tasks you'll do in this
> repo. If a step in your day is "I always forget how to do X" —
> there should be a how-to here. If there isn't, write one.

## Index

| Recipe                                                                | When you'd reach for it                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------- |
| [Add an ADR](add-an-adr.md)                                           | A design decision is consequential enough to write down. |
| [Add a Tauri command](add-a-tauri-command.md)                         | Exposing a Rust function to the renderer.                |
| [Add a design token](add-a-design-token.md)                           | A new colour / spacing / font role.                      |
| [Add a TipTap extension](add-a-tiptap-extension.md)                   | A new editor block, mark, or input rule.                 |
| [Add a database migration](add-a-database-migration.md)               | The SQLite metadata schema needs a change.               |
| [Add a Markdown round-trip fixture](add-a-markdown-roundtrip-fixture.md) | A new pathological Markdown case to lock down.        |
| [Bump a dependency](bump-a-dependency.md)                             | A package update, security patch, or major version bump. |
| [Cut a release](cut-a-release.md)                                     | A `vX.Y.Z` tag.                                          |
| [Debug a flaky test](debug-a-flaky-test.md)                           | A test passes locally and fails on CI (or vice versa).   |
| [Profile with criterion](profile-with-criterion.md)                   | Investigating a perf regression or saving a baseline.    |
| [Triage a bug](triage-a-bug.md)                                       | A new bug report needs labels, milestones, an owner.     |

## Conventions

Every recipe follows the same structure:

1. **What it is** — one paragraph.
2. **When to do it** — in what triggering situation.
3. **Steps** — numbered, copy-pasteable, with the expected output
   when meaningful.
4. **Verify** — the command(s) that confirm the recipe worked.
5. **Common issues** — the failure modes we've seen, and the fix.
6. **References** — cross-links to ADRs, source files, related how-tos.

If you're writing a new recipe, copy [`add-an-adr.md`](add-an-adr.md)
as the template — it's the simplest one and the structure is the
clearest.

## What goes here, what goes in `development/`

How-tos are **operational**: imperative, repeatable, near-term-shaped.

The pages in [`../development/`](../development/) are **conceptual**:
the standards, the perf budget, the test pyramid, the release
process at the level of "what does releasing mean".

If you find yourself writing "first, understand the rationale" —
that's a `development/` page or an ADR. If it's "first, run X; then
edit Y" — that's a how-to.
