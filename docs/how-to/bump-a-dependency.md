# How to bump a dependency

> Updating a package version — npm, Cargo, or a Tauri plugin. Most
> bumps come from Dependabot; this recipe is for the manual flow
> when you need to push a specific update.

## When to do it

- **Security patch.** A CVE landed; you want it in `main` today.
- **Bug fix.** An upstream release fixes a bug we've been working
  around.
- **Minor update with new behaviour you want.** Tauri 2.x added a
  feature; you're using it.
- **Major version bump.** Plan it like a feature: open an issue,
  read the upgrade guide, schedule the work.

For passive maintenance (every other Tuesday), prefer letting
**Dependabot** open the PRs from
[`.github/dependabot.yml`](../../.github/dependabot.yml). They land
in green batches; you mostly just review.

## Steps

### npm package (in any workspace package)

1. **Pick the workspace package** that owns the dep:

   ```bash
   pnpm why <package> --recursive    # find every consumer
   ```

2. **Update**:

   ```bash
   pnpm --filter <consumer> add <package>@latest
   ```

   or pin to a specific version:

   ```bash
   pnpm --filter @lattice/editor add @tiptap/core@^2.10.4
   ```

3. **Refresh the lockfile**:

   ```bash
   pnpm install --frozen-lockfile=false
   ```

   `pnpm-lock.yaml` updates as a side-effect of the `add`. Both
   files (`package.json` + `pnpm-lock.yaml`) must commit together.

4. **Re-run typecheck + lint + test** for the affected scope:

   ```bash
   pnpm --filter <consumer>... typecheck test lint
   ```

   The `...` after the filter pulls in downstream packages that
   depend on the one you bumped.

5. **Run the desktop app** in dev mode to smoke-test the user-facing
   path. Faster than relying on CI.

### Cargo crate

1. **Find every consumer**:

   ```bash
   cargo tree -i <crate>
   ```

2. **Update the workspace root** if it's a workspace dep:

   ```bash
   # Cargo.toml (root)
   [workspace.dependencies]
   tokio = { version = "1.43", features = ["full"] }   # was 1.42
   ```

3. **Or update a single member's Cargo.toml** if the bump is
   crate-local.

4. **Refresh lockfile**:

   ```bash
   cargo update -p <crate>
   ```

   Don't run `cargo update` without `-p` — it bumps everything in
   range, which is much harder to review.

5. **Run the suite**:

   ```bash
   cargo fmt --all --check
   cargo clippy --workspace --all-targets --all-features -- -D warnings
   cargo test --workspace --all-features
   ```

### Tauri plugin

Tauri plugins ship as **paired** crates and npm packages — bump them
together:

```bash
pnpm --filter @lattice/desktop add @tauri-apps/plugin-dialog@^2.0.2
# Cargo.toml of apps/desktop/src-tauri/:
#   tauri-plugin-dialog = "^2.0.2"
```

The Rust side is the source of truth at runtime; the JS side is the
public API. Drift between major versions causes `Plugin not found`
errors at runtime — keep them in lockstep.

### Tauri itself

A Tauri version bump is a coordinated change touching:

- `@tauri-apps/api` (npm) in `apps/desktop/package.json`.
- `@tauri-apps/cli` (npm) in `apps/desktop/devDependencies`.
- `tauri` (Cargo) in `apps/desktop/src-tauri/Cargo.toml`.
- `tauri-build` (Cargo) in the same.
- The CLI installed globally for `cargo tauri` invocations:
  `cargo install tauri-cli --version "^X.Y" --force`.

A minor bump is usually safe; a major bump deserves an ADR (the
plugin API often changes).

## Major-version bumps

Plan like any feature:

1. **Open a tracking issue.** Title: `chore(deps): <package> 2 → 3
migration`.
2. **Read the upstream upgrade guide.** Note breaking changes;
   write them down in the issue.
3. **Branch off `main`.** Land the bump in one PR — don't drag it
   across multiple weeks.
4. **Update everywhere it's referenced.** `rg <package>` across the
   repo.
5. **Test the affected user paths** end-to-end in the running app.
6. **Update CHANGELOG** with a `### Changed` line citing the bump.
7. **Open the PR** with `chore(deps)!: bump <package> from 2 to 3`
   if there are user-visible behaviour changes; otherwise a plain
   `chore(deps): …`.

## Verify

The full local check block from
[`../development/README.md#the-daily-loop`](../development/README.md#the-daily-loop):

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm tokens:check
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

If you bumped a dep that touches the Tauri shell, also run
`pnpm tauri:dev` and exercise the affected feature.

## Common issues

### `pnpm install` removes / re-adds many packages

That's pnpm's strict resolver picking up a transitively-renamed
dep. Run `git diff pnpm-lock.yaml` and look for unexpected entries
— sometimes a bump pulls in a peerDep that wasn't there before. If
you see `node_modules/.pnpm/<unexpected>`, `pnpm why <unexpected>`
to find the importer.

### CI passes but a runtime feature breaks

You bumped a dep that has a runtime behaviour change CI didn't
catch. Add a test for the path you broke; revert the bump if you
can't fix forward in the same PR.

### `cargo update -p X` says "all crates compatible with required versions are already up to date"

The version range in `Cargo.toml` doesn't permit the version you
want. Update the range:

```toml
tokio = { version = "1.43", features = ["full"] }   # was "1.42"
```

Then re-run `cargo update -p tokio`.

### Dependabot opened a PR that fails CI on a flaky test

The dep didn't break anything; the test is flaky. Investigate the
flake (per [`debug-a-flaky-test.md`](debug-a-flaky-test.md)) — don't
merge a green-after-rerun bump that hides a real issue.

### A major Tauri bump breaks the capability files

Schema may have changed. Read the migration guide; update each
capability file under
[`apps/desktop/src-tauri/capabilities/`](../../apps/desktop/src-tauri/capabilities/).

### `pnpm-lock.yaml` looks like it changed every line

You ran `pnpm install` with `pnpm@<old>`. Make sure your local
pnpm matches the `packageManager` field in `package.json`:

```bash
corepack prepare pnpm@10 --activate
```

Re-install, re-commit the lockfile.

## References

- [`.github/dependabot.yml`](../../.github/dependabot.yml) — automated
  bump cadence.
- [`pnpm install` docs](https://pnpm.io/cli/install)
- [`cargo update` docs](https://doc.rust-lang.org/cargo/commands/cargo-update.html)
- [Conventional Commits](https://www.conventionalcommits.org/) —
  PR-title format for `chore(deps): …` and `chore(deps)!: …`.
