# ADR-0008: pnpm + Turborepo monorepo

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: monorepo, build, tooling, javascript

## Context

[ARCHITECTURE.md](../../ARCHITECTURE.md) targets **one repo, many
artifacts** — a desktop Tauri app, a mobile Tauri app, shared UI and
editor packages, codegen'd TS bindings off a Rust workspace, an Axum
sync server, a browser extension, and docs. That means:

- Multiple JS/TS workspaces with **internal dependencies** between
  them (`apps/desktop` depends on `packages/ui`, which depends on
  `packages/config`, etc.).
- **Symlinked node_modules** so a single `pnpm install` from the root
  hydrates all packages without re-downloading.
- **Build / test orchestration** that's aware of the dependency graph
  ("rebuilding `packages/ui` requires re-typechecking
  `apps/desktop`") and parallelizes across CI cores.
- **Cache** for hot builds (CI on a PR that only touches docs should not
  re-run desktop type-checks).
- **Parallel to the Rust workspace** in `core/` (Cargo handles its own
  multi-crate story).

We need to pick the package manager **and** the build orchestrator now
because every subsequent PR's lockfile, scripts, and CI matrix depend
on them.

## Decision

**The JS/TS monorepo uses [pnpm](https://pnpm.io/) for package
management and [Turborepo](https://turbo.build/repo) for build
orchestration**, both pinned in the root and committed to the repo
(via `pnpm-workspace.yaml`, `turbo.json`, `package.json` with `"packageManager": "pnpm@9.x.y"`).

The Rust side stays a **plain Cargo workspace** in `core/`, separate
from Turbo — Cargo's incremental compilation and `cargo workspace` are
already good enough, and Turbo doesn't usefully orchestrate Cargo.

CI top-level jobs are: `pnpm install --frozen-lockfile`, then
`turbo run lint typecheck test build --filter=...[origin/main]`
(affected-only), plus a parallel `cargo` job for `core/`.

## Consequences

### Positive

- **pnpm's content-addressable store** uses ~70% less disk than npm/yarn
  for the same dependency graph — matters on contributor laptops and CI
  cache size.
- **Strict, symlink-based `node_modules`** means a package can't
  accidentally import a transitive dependency it didn't declare. This
  catches subtle bugs that npm/yarn hide.
- **Native workspaces** (`pnpm-workspace.yaml`) handle the cross-package
  refs without a third tool.
- **Turborepo's incremental DAG + remote cache** dramatically shortens
  CI feedback. A PR touching only `packages/ui` re-runs `ui` + its
  dependents and skips everything else.
- **Local-cache hits**: re-running `pnpm test` on the same code is a
  no-op after the first run.
- **Affected detection** (`--filter=...[origin/main]`) means we don't
  need a custom "files-changed" script in CI to be selective.
- **Both tools are stable and Vercel/JetBrains/Microsoft-backed**, used
  by Next.js, Vercel itself, Linear, Vite — long-term health is good.

### Negative

- **pnpm strictness occasionally surprises** newcomers who installed
  a dep at the wrong workspace and find it unavailable elsewhere.
  Mitigation: a CONTRIBUTING note + `pnpm why` reflex in PR reviews.
- **Turbo remote cache requires a Vercel account** for free-tier sharing
  across CI runs. For v0.1 we use the local cache only; we add the
  remote cache when CI build times warrant it.
- **Two systems to learn** (pnpm + Turbo) instead of one (e.g., Nx).
  Trade we accept — see Option B.

### Neutral

- `package-lock.json` and `yarn.lock` are forbidden via `.gitignore`
  plus a CI check.
- Node version pinned via `.nvmrc` (and `engines.node` in root
  `package.json`).
- We won't adopt **pnpm catalogs** in v0.1 (they're stable but new);
  shared versions are declared via `pnpm.overrides` if needed.

## Alternatives considered

### Option A — npm or yarn workspaces

- **Pros**: built-in to npm; no extra dep.
- **Cons**: slower installs (npm), brittle hoisting that allows
  undeclared imports, weaker workspace primitives, no good incremental
  story without bolting on something like Turbo anyway. Yarn Berry's
  PnP is a separate ecosystem-of-its-own.
- **Why rejected**: pnpm is strictly faster, leaner, and stricter for
  the same effort.

### Option B — Nx

- **Pros**: end-to-end opinionated runtime (one tool for orchestration,
  generators, linting, plugins), strong cache, great editor integration.
- **Cons**: heavy. The Nx runtime + plugins want to own a lot of the
  surface area; small repos pay the cognitive tax. Less common in the
  Tauri/Rust crowd.
- **Why rejected**: Turbo is small, transparent, and stays out of the
  way; Nx's gravity is wrong for a Rust-heavy repo where the JS side is
  half the artifacts.

### Option C — Bazel

- **Pros**: pinnacle of correctness; same tool for JS, Rust, Python,
  C++ if we ever go there.
- **Cons**: configuration overhead is enormous; even Google
  internally has had decade-long fights with `BUILD` files. Tauri +
  Bazel is uncharted territory.
- **Why rejected**: way overkill for our scale.

### Option D — Single repo, no orchestrator

- **Pros**: zero config.
- **Cons**: full re-build on every PR; doesn't scale past three
  packages.
- **Why rejected**: we already cross the three-package line in v0.1.

### Option E — Multiple repos (one per artifact)

- **Pros**: cleaner ownership; no monorepo complexity.
- **Cons**: cross-cutting changes (e.g., adding a new Tauri command
  that changes the ts-rs bindings) require coordinated PRs across
  repos. Versioning becomes a nightmare. Cold-start cost on
  cross-cutting work explodes.
- **Why rejected**: a monorepo is the right shape for tightly-coupled
  packages around a shared core.

## References

- [pnpm — workspace docs](https://pnpm.io/workspaces)
- [Turborepo](https://turbo.build/repo) — concepts and docs.
- ["Why Vercel chose Turborepo"](https://vercel.com/blog/turborepo-vercel) — perf data.
- ["pnpm vs npm vs yarn — benchmarks"](https://pnpm.io/benchmarks).
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — repo layout target.
