# ADR-0009: Conventional Commits + squash-merge + trunk-based development

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: git, workflow, ci, automation, governance

## Context

We need a single, mechanical version-control workflow that supports:

- **Automated changelogs** without manual curation.
- **Automated semver bumps** at release time
  ([release.yml](../../.github/workflows/) lands in v0.1).
- **Quick recovery from a bad commit** — finding the offending change
  in 2 minutes, not 20.
- **Stable `main`** that's always installable — `git checkout main && pnpm tauri dev`
  works at every commit.
- **A workflow that scales** from one maintainer (today) to a small
  contributor team (v1.0) without re-tooling.
- A **PR title** that's good enough to be the squashed commit message,
  to keep `main` history clean.

The workflow needs to be in place before PR #5 ([CI workflows](../../.github/workflows/))
adds commit-lint and dependabot — both expect Conventional Commits.

## Decision

We adopt three reinforcing conventions:

1. **[Conventional Commits 1.0](https://www.conventionalcommits.org/)**
   for PR titles (which become squashed commit messages on `main`) and
   for direct commits on a feature branch (best-effort, only PR titles
   are enforced).
   - Allowed `type`s: `feat`, `fix`, `docs`, `style`, `refactor`,
     `perf`, `test`, `build`, `ci`, `chore`, `revert`.
   - Allowed `scope`s (from `commitlint.config.cjs`): `repo`, `editor`,
     `search`, `graph`, `ai`, `sync`, `mobile`, `ui`, `ux`, `ci`,
     `docs`, `core`, `sdk`, `bookmarking`, `engineering-ml`, `desktop`,
     `android`, `release`, `deps`, `adr`, `github`.
   - **Breaking changes** are flagged either with `!` after the scope
     (`feat(core)!: …`) or with a `BREAKING CHANGE:` footer.

2. **Squash-merge only** via GitHub's UI / API (`merge_commit_allowed:
   false`, `rebase_merge_allowed: false`, `squash_merge_allowed:
   true`). PR titles become the one canonical commit on `main`.

3. **Trunk-based development** — short-lived feature branches off
   `main`, no long-lived `develop` / `release` branches. Releases are
   tagged commits on `main` (`vX.Y.Z`) cut by the release workflow.

The PR template enforces a checklist; `commitlint.yml` blocks PR-titles
that don't conform; CODEOWNERS auto-requests reviewers.

## Consequences

### Positive

- **Automated CHANGELOG** at release time from squashed commit
  messages (`feat`, `fix`, `perf` show up under "Added", "Fixed",
  "Performance", etc., per Keep-a-Changelog).
- **Automated semver bumps**: `feat` → minor, `fix`/`perf` → patch,
  `!` or `BREAKING CHANGE:` → major. The release workflow can compute
  the next version with zero human input.
- **Clean linear `main`** is `git log --oneline` joy. Bisect is trivial.
- **Quick blame on regressions** — one commit per feature; revert is
  one click.
- **PR title hygiene improves** because the title is now the artifact
  contributors will see in `git log` forever, not just on the PR page.
- **CI is simpler** — no need to handle merge commits, no need to deal
  with `git rebase` weirdness; the merge button is the only path.
- **Automation friendly** — `dependabot`, `labeler`, release-please-style
  tooling all key off Conventional Commits.

### Negative

- **Squash loses intra-branch granularity.** A PR with five commits
  becomes one commit. We mitigate by encouraging contributors to
  write one PR per logical change — but the in-branch commit history
  is still useful while reviewing and is preserved on the PR page.
- **Conventional Commits has a learning curve.** Mitigation: PR template
  reminds; `commitlint.yml` gives a clear error on bad titles.
- **`!`-flagged breaking changes can be missed** if the contributor
  forgets. Mitigation: code review + a `breaking-change` label + CI
  check (added in v0.2 as part of the release-cutting workflow).

### Neutral

- **Tags are signed?** Optional for v0.1; recommended at v1.0. The
  release workflow signs artifacts even if the tag is unsigned.
- **PR titles can be amended** post-creation; the squash-merge picks the
  latest title at merge time.

## Alternatives considered

### Option A — git-flow (long-lived `develop`, `release/*`, `hotfix/*`)

- **Pros**: traditional, well-documented.
- **Cons**: heavyweight for a project that ships continuous releases
  off `main`. Merges back-and-forth between branches breed conflicts
  and "what's actually in the release?" questions.
- **Why rejected**: built for a different release cadence than ours.

### Option B — Rebase-and-merge only

- **Pros**: preserves intra-branch history in `main`.
- **Cons**: `main` accumulates a flood of tiny commits ("fix typo",
  "wip"). CHANGELOG generation becomes lossy unless every individual
  commit also conforms to Conventional Commits — which is a much
  bigger ask of contributors than "one good PR title".
- **Why rejected**: PR-title-as-squash is the lowest-friction way to
  get a clean history.

### Option C — No convention; freeform commits

- **Pros**: zero friction.
- **Cons**: no automation possible; CHANGELOG and semver become manual;
  blame stories rot fast.
- **Why rejected**: the upside of Conventional Commits is enormous
  for a small marginal cost.

### Option D — gitmoji or other emoji-driven conventions

- **Pros**: visually distinctive.
- **Cons**: weaker ecosystem support, less machine-friendly for
  changelog automation.
- **Why rejected**: Conventional Commits is the standard the tooling
  ecosystem has converged on.

## References

- [Conventional Commits 1.0 spec](https://www.conventionalcommits.org/en/v1.0.0/)
- [commitlint](https://commitlint.js.org/)
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
- [SemVer 2.0](https://semver.org/)
- [Trunk Based Development](https://trunkbaseddevelopment.com/)
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — contributor-facing rules.
- [`CHANGELOG.md`](../../CHANGELOG.md) — Keep-a-Changelog seed.
