# Changelog

All notable changes to **Lattice** will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **v0.1 PR #5** — Design-token round-trip + parity guard: `scripts/check-token-parity.mjs`
  parses `packages/ui/src/tokens.css` and `packages/config/tailwind-preset/index.cjs`,
  asserts every `var(--token)` reference resolves to a declared token (and vice versa),
  with documented exclusions for font-stack vars consumed via `fontFamily`. New
  `pnpm tokens:check` script; Vitest unit test in `packages/ui/src/tokens.test.ts`
  exercises the same invariant; `CONTRIBUTING.md` "Design tokens" section walks
  contributors through adding a new token.
- **v0.1 PR #4** — React + Vite + TailwindCSS + shadcn/ui scaffolding:
  Vite 6 + React 18 in `apps/desktop` (`vite.config.ts`, `tailwind.config.ts`,
  `postcss.config.cjs`, strict-mode `index.html` + `src/{main,App,styles}.tsx`),
  Tailwind preset wired to ADR-0010 token CSS, and 11 shadcn-derived
  primitives in `packages/ui/src/components/`: `Button`, `Card`, `Dialog`,
  `DropdownMenu`, `Input`, `Separator`, `Sheet`, `Tabs`, `Tooltip`, `Toaster`
  (sonner), and `Command` (cmdk). Storybook is deferred to a small v0.2
  follow-up per the "one-liner if time-pressed" clause in
  [.github/issues/v0.1-tasks.yml](.github/issues/v0.1-tasks.yml).
- **v0.1 PR #2** — Rust `lattice-core` crate with sqlx + SQLite per
  [ADR-0002](docs/decisions/0002-rust-core-sqlx-sqlite.md): connection-pool
  bootstrap (`db::init_pool` / `init_in_memory`), embedded `Migrator` reading
  `core/lattice-core/migrations/0001_init.sql` (notes / tags / note_tags /
  links / attachments tables + indexes), serialisable `LatticeError` enum with
  `From` impls for `io::Error`, `sqlx::Error`, and `sqlx::migrate::MigrateError`,
  `Note` / `Tag` / `Link` / `LinkKind` / `Attachment` IPC types deriving `ts_rs::TS`
  exported into `packages/core-bindings/src/generated/` and re-exported from
  `@lattice/core-bindings`, and `insta` snapshot coverage of all
  `LatticeError` JSON variants under `core/lattice-core/tests/error_snapshot.rs`.
- **v0.1 PR #1** — pnpm + Turborepo monorepo scaffolding per
  [ADR-0008](docs/decisions/0008-pnpm-turborepo-monorepo.md):
  workspace skeleton (`apps/desktop`, `packages/ui`, `packages/core-bindings`,
  `packages/config/{eslint,tailwind,tsconfig}-preset`), Rust workspace `Cargo.toml`
  with stub crates (`core/lattice-{core,search,ai,sync}`), root toolchain
  (`tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.cjs`, `vitest.config.ts`,
  `.nvmrc`, `.npmrc`, `.prettierignore`), shared Tailwind preset wired to
  ADR-0010 design tokens, and root scripts (`lint`, `typecheck`, `test`,
  `format`, `tauri`, `tauri:dev`, `tauri:build`).
- Initial project scaffolding: README, ARCHITECTURE, ROADMAP, CONTRIBUTING,
  CODE_OF_CONDUCT, SECURITY, `.editorconfig`, `.gitignore`.
- `.github/` community health files: `CODEOWNERS`, pull-request template,
  bug-report and feature-request issue templates, issue-template config.
- This `CHANGELOG.md` (Keep a Changelog format).
- Architecture Decision Record framework (`docs/decisions/`) with ADRs
  0001–0010 covering: Tauri 2 shell, Rust + `sqlx` + SQLite core, TipTap
  (ProseMirror) editor, Tantivy search, Yjs/`yrs` CRDT sync, local-first
  Markdown source of truth, AGPL-3.0 license, pnpm + Turborepo monorepo,
  Conventional Commits + squash-merge + trunk-based git workflow, and
  the design tokens & typography system.
- Product vision (`docs/vision.md`) and competitive landscape research
  (`docs/research/note-taking-landscape.md`) — 14-product analysis
  defining the Lattice wedge (local-first + open-source + AI-native +
  engineer/ML-first + time-travel).
- Governance config-as-code in `.github/`: 40-label taxonomy
  (`labels.yml`), 10 milestones (`milestones.yml`), 28 issue specs
  across epics + v0.1 + v0.2 tasks (`issues/*.yml`), and `gh`-CLI
  scripts to mirror them into the live repo (`scripts/sync-labels`,
  `sync-milestones`, `bootstrap-repo`, `bootstrap-project`,
  `bootstrap-issues`).
- CI baseline (`.github/workflows/`): `ci.yml` (meta + frontend + rust,
  matrix Linux + Windows, conditional jobs on monorepo presence),
  `commitlint.yml` (PR-title validation), `stale.yml`, `label-sync.yml`,
  `labeler.yml`, `release.yml` stub; `.github/dependabot.yml` (weekly
  bumps for actions, npm, cargo); `commitlint.config.cjs`,
  `.markdownlint-cli2.jsonc`, `.yamllint.yml` lint configs;
  `.gitattributes` for LF normalisation.
- `docs/development/github-governance.md` — playbook for the
  config-as-code system.

### Infrastructure

- Branch protection on `main`: 1 approving review required, dismiss-stale
  reviews, require code-owner reviews, required status checks `ci / meta`
  and `commitlint`, required linear history, required conversation
  resolution, no force-pushes, no deletions.
- Repo settings: Discussions enabled, squash-merge only, auto-delete head
  branches, 11 topics, description set.
- Project v2 "Lattice — Roadmap" with Area / Priority / Size custom
  SingleSelect fields (Status and Milestone are GitHub-managed defaults).

[Unreleased]: https://github.com/goldr0g3r/lattice/compare/HEAD...HEAD
