# Development

> Daily-workflow documentation for working in the Lattice repo.
> Standards, testing, performance, debugging, releases, GitHub
> governance — everything except the architectural deep-dives (those
> live in [`../architecture/`](../architecture/README.md)).

If you're brand new, read [`../getting-started/`](../getting-started/README.md)
first to get a working build.

## What's in this folder

| Page                                           | Read when…                                                |
| ---------------------------------------------- | --------------------------------------------------------- |
| [`monorepo.md`](monorepo.md)                   | You're orientating in `apps/`, `packages/`, `core/` for the first time. |
| [`coding-standards.md`](coding-standards.md)   | You're writing Rust or TypeScript and want the in-repo style. |
| [`testing.md`](testing.md)                     | You need to write or run tests at any layer.              |
| [`performance.md`](performance.md)             | You're touching code on the perf-budget hot path.         |
| [`debugging.md`](debugging.md)                 | A bug needs runtime evidence, not a re-read of the source. |
| [`release-process.md`](release-process.md)     | You're cutting a `vX.Y.Z` tag.                            |
| [`github-governance.md`](github-governance.md) | You're editing labels, milestones, or the Project board.  |

## The daily loop

The fastest inner loop, optimised for "edit code → see it in the
running app":

```bash
pnpm tauri:dev          # one terminal — leave running
```

In a second terminal, while the app stays open:

```bash
pnpm test --watch       # vitest in watch mode for the package you're touching
cargo test -p <crate>   # tight loop on a single Rust crate
```

When you're ready to push:

```bash
pnpm lint
pnpm typecheck
pnpm format
pnpm tokens:check
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

These are the same gates CI runs. Run them locally before pushing —
broken CI on `main` is everybody's problem.

## Workflow rules at a glance

The full conventions are in
[`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) and
[ADR-0009](../decisions/0009-conventional-commits-trunk-based.md).
The two-line summary:

- Branch from `main`. Name: `<type>/<short-slug>`.
- PR title: [Conventional Commits](https://www.conventionalcommits.org/)
  with one of the scopes from
  [`commitlint.config.cjs`](../../commitlint.config.cjs). The PR
  title becomes the squashed commit subject; write it well.

## Where to look first when something feels wrong

| Symptom                                       | First place to look                                                |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm tauri:dev` won't start                  | [`../getting-started/troubleshooting.md`](../getting-started/troubleshooting.md) |
| Test fails locally only / CI only             | [`debugging.md`](debugging.md) and [`../how-to/debug-a-flaky-test.md`](../how-to/debug-a-flaky-test.md) |
| `tokens:check` fails                          | [`../how-to/add-a-design-token.md`](../how-to/add-a-design-token.md) |
| AST snapshot drift                            | [`../how-to/add-a-markdown-roundtrip-fixture.md`](../how-to/add-a-markdown-roundtrip-fixture.md) |
| `cargo bench` regressed >10%                  | [`performance.md`](performance.md) and [`../how-to/profile-with-criterion.md`](../how-to/profile-with-criterion.md) |
| Conventional Commits / commitlint complaint   | [ADR-0009](../decisions/0009-conventional-commits-trunk-based.md)  |
| Branch protection check failed unexpectedly   | [`github-governance.md`](github-governance.md)                     |

## Pulling it all together

Most contributors will end up reading:

1. [`../getting-started/`](../getting-started/README.md) — once.
2. [`monorepo.md`](monorepo.md) and [`coding-standards.md`](coding-standards.md) — once.
3. [`testing.md`](testing.md) — every time they add a test.
4. [`debugging.md`](debugging.md) — every time something breaks at
   runtime.
5. The relevant [`../how-to/`](../how-to/README.md) recipe — for any
   well-understood workflow.

Treat this folder like the man pages for the project. If a how-to
exists, link to it from the change you make. If one is missing, add
it.
