# Contributing to Lattice

First off — thanks for being here. Lattice is a community project, and every
issue, PR, design suggestion, and bug report makes it better.

## Code of conduct

Be kind. The full code of conduct lives in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Ways to contribute

| You want to… | Start here |
| --- | --- |
| Report a bug | [Open a bug report](../../issues/new?template=bug_report.yml) |
| Suggest a feature | [Open a feature request](../../issues/new?template=feature_request.yml) |
| Pick up a small task | Browse [`good first issue`](../../labels/good%20first%20issue) |
| Improve docs | Edit and PR — no issue needed for typo fixes |
| Help with design / UX | Comment on issues labeled [`area/ux`](../../labels/area%2Fux) |
| Build a plugin | Wait for the SDK in v0.9, or follow the discussion |

## Development setup

> Prerequisites: **Node 20+**, **pnpm 9+**, **Rust stable + rustup**,
> **Tauri 2 CLI** (`cargo install tauri-cli --version "^2.0"`).
> Platform-specific Tauri deps: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
git clone https://github.com/goldr0g3r/lattice.git
cd lattice
pnpm install
pnpm tauri dev
```

For the mobile shell (v0.6+), install Android Studio SDK + NDK and run:

```bash
pnpm tauri android init
pnpm tauri android dev
```

## Branching & commits

- Base your branch on `main`.
- Branch naming: `type/short-slug` (e.g. `feat/wiki-link-autocomplete`, `fix/graph-crash`).
- Commit messages follow **Conventional Commits**:
  - `feat: add slash command menu`
  - `fix(editor): preserve trailing newline on save`
  - `chore(ci): bump tauri action`
  - `docs(roadmap): clarify v0.4 scope`
- Squash-merge on merge; the PR title becomes the commit subject.

## Pull request workflow

1. Open a draft PR early. It's a great way to get feedback.
2. Link the issue (`Closes #123`).
3. Fill in the PR template (it auto-loads).
4. Ensure CI is green:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `cargo fmt --check && cargo clippy --workspace -- -D warnings && cargo test --workspace`
5. A maintainer reviews. We aim for first response within 72 h.
6. Squash-merge when approved.

## Coding standards

### Rust

- `rustfmt` on save (enforced in CI).
- `clippy` with `-D warnings`.
- Public APIs are documented; doctests where reasonable.
- Errors are typed (`thiserror`); no unwrap in library code.

### TypeScript / React

- ESLint + Prettier (enforced in CI).
- Functional components + hooks; no class components.
- Type strictness: `"strict": true` and no `any` (use `unknown` and narrow).
- Tailwind for styling; avoid inline `style={}` except for dynamic values.
- Imports ordered; absolute paths via `@/*`.

### Tests

- Rust: unit tests in-module + integration tests in `tests/`. Use `insta` for snapshots.
- Frontend: **Vitest** for unit, **Playwright** for E2E.
- Performance: benches gated on `core/` regressions (`criterion`).

## Issue triage labels

We use a tidy label taxonomy. See [the label list](../../labels).

- `type/*` — bug, feature, task, docs, refactor, chore
- `area/*` — editor, search, graph, ai, sync, mobile, ci, ux, docs
- `priority/*` — p0 (drop everything) → p3 (whenever)
- `status/*` — needs-triage, ready, in-progress, blocked, needs-design
- `good first issue`, `help wanted`, `discussion`

## Releasing (maintainers)

1. Bump version in workspace `Cargo.toml` + `package.json`.
2. Update `CHANGELOG.md`.
3. Tag `vX.Y.Z` and push — `release.yml` does the rest.

Thanks again for contributing. 💜
