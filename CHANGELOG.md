# Changelog

All notable changes to **Lattice** will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
