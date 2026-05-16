# Troubleshooting setup

> Failures we've seen often enough to write down. If your problem
> isn't here and isn't a one-line obvious fix, file a `type/bug` issue
> tagged `area/ci` or `area/desktop` — the setup path is something we
> want green for everyone.

## Diagnostics first

Before reaching for any of the recipes below, capture this diagnostic
block — it's what we'll ask for in the bug report:

```bash
node --version
pnpm --version
rustc --version
cargo tauri --version
git rev-parse HEAD
git status --short
```

On Linux / macOS, also:

```bash
uname -a
```

On Windows:

```powershell
Get-ComputerInfo | Select-Object OsName, OsVersion, OsBuildNumber
```

## pnpm install failures

### `ERR_PNPM_BAD_PM_VERSION`

> "This project's `packageManager` field is set to `pnpm@10.x.y`, but
> you are using `pnpm@<other>`."

You installed a different pnpm version than the repo expects. Fix
with corepack:

```bash
corepack enable
corepack prepare pnpm@10 --activate
```

We deliberately do not pin pnpm via `pnpm/action-setup`'s `version`
input in CI; it reads the `packageManager` field directly. Any drift
between `engines.packageManager` and your shell's pnpm trips this
exact error — see the comment in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

### `ERR_PNPM_OUTDATED_LOCKFILE`

> "Cannot install with frozen-lockfile because the lockfile is not
> up-to-date with `package.json`."

Either `main` is broken (rare, file an issue) or you `pnpm install`'d
without committing the resulting lockfile drift on a previous PR. Fix
locally:

```bash
pnpm install            # writes the updated pnpm-lock.yaml
git add pnpm-lock.yaml
git commit -m "chore(deps): refresh pnpm lockfile"
```

Don't `--force` it. If it keeps drifting on every install,
something is wrong with a dependency you added — review the diff.

### `ENOENT: no such file or directory, … 'node_modules/<pkg>/package.json'`

Cancelled install, half-written `node_modules/`. Nuke it:

```bash
pnpm clean              # if defined; otherwise:
rm -rf node_modules
rm -rf apps/*/node_modules packages/*/node_modules
pnpm install
```

## Rust / Cargo failures

### `error: linker 'cc' not found` (Linux)

You don't have `build-essential`. From [Prerequisites](prerequisites.md#linux-ubuntu-2204--2404-debian-12):

```bash
sudo apt install -y build-essential
```

### `error[E0463]: can't find crate for 'std'` after rustup update

Your toolchain is mid-installation. Re-run:

```bash
rustup default stable
rustup update
```

### `failed to find tool. Is 'cl.exe' installed?` (Windows)

You're missing the MSVC toolchain. Install **Visual Studio 2022
Build Tools** with the "Desktop development with C++" workload.
WebView2 alone isn't enough — Cargo needs `link.exe` and `cl.exe`.

### `pkg-config` errors mentioning `webkit2gtk` (Linux)

You're missing the Tauri Linux deps. Re-run the full
[apt block](prerequisites.md#linux-ubuntu-2204--2404-debian-12).

### sqlx error `error returned from database: (code: 1) no such table`

You ran something against a stale `index.db` that pre-dates a
migration. Delete the test vault's `.lattice/` directory or the test
database file under `target/` and re-run.

### `cargo test` is slow on Windows

Defender real-time scanning of `target/` is the usual culprit.
Add an exclusion for `<repo>\target\` and `%USERPROFILE%\.cargo\` in
Windows Security → Virus & threat protection → Exclusions. Cuts
clean-build time from ~5 min to ~2 min on a typical laptop.

## Tauri failures

### Window opens, paints white, never loads

Vite isn't running on port 1420. Three sub-causes:

1. **Another process owns 1420.** Find it: `lsof -i :1420` (Linux/mac)
   or `Get-NetTCPConnection -LocalPort 1420` (Windows). Kill it.
2. **Vite crashed silently.** Look for errors in the terminal where
   you ran `pnpm tauri:dev` — likely a TypeScript or import error in
   the React app.
3. **Tauri started before Vite.** Race condition; just `Ctrl+C` and
   re-run.

### `WebView2: Failed to initialize` (Windows)

WebView2 Runtime isn't installed. Download the Evergreen Bootstrapper
from
[Microsoft's WebView2 page](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
and run it. (Windows 11 ships with this; Windows 10 sometimes
doesn't.)

### `cargo tauri build` fails with `Failed to bundle project: error running …`

The bundler couldn't find a downstream tool:

| Platform       | Likely missing                                |
| -------------- | --------------------------------------------- |
| Windows .msi   | WiX Toolset 3.x (Tauri downloads on first run) |
| Linux .deb     | `dpkg-deb` (`sudo apt install dpkg-dev`)      |
| Linux AppImage | `linuxdeploy` (Tauri downloads on first run)  |

Re-run `cargo tauri build`; first time it downloads ~50 MB of bundler
binaries into `target/`.

### `tauri.conf.json` schema errors after a Tauri version bump

`@tauri-apps/cli` and `tauri` (Rust) must agree on the major version.
Run:

```bash
cargo tauri --version       # Rust side
pnpm tauri --version        # JS side; should match
```

If they diverge: `cargo install tauri-cli --version "^2.0" --force`
and `pnpm install` again to refresh `@tauri-apps/cli`.

## Lint / format failures

### `pnpm format` succeeded yesterday, fails today

Prettier rules or the global `.prettierignore` changed. Run
`pnpm format:write`, review the diff, commit.

### `pnpm tokens:check` fails after a CSS edit

You added a token to `packages/ui/src/tokens.css` without exposing it
in `packages/config/tailwind-preset/index.cjs` (or vice versa). Edit
both files in the same PR; the recipe is in
[`how-to/add-a-design-token.md`](../how-to/add-a-design-token.md).

### `cargo clippy` warns on a third-party macro

Clippy occasionally flags generated code from `sqlx::query!` or
`tauri::command`. We deny warnings in CI, so the fix is to find the
narrowest `#[allow(...)]` that covers the call site. Don't `#[allow]`
at the crate level — that hides legitimate problems.

### Markdownlint failures in CI

Run the same lint locally:

```bash
pnpm exec markdownlint-cli2 "**/*.md"
```

Common offenders:

- **MD040** — code fence missing a language tag. Fix: `\`\`\`bash`,
  `\`\`\`text`, `\`\`\`json`.
- **MD025** — second `# H1` in a file. Demote to `## H2`.
- **MD007** — list indentation not 2 spaces. Fix: re-indent.

The full config is in [`.markdownlint-cli2.jsonc`](../../.markdownlint-cli2.jsonc).

## Test failures

### vitest hangs forever

A test left an open handle (a timer, an unclosed WebSocket, an
unawaited promise). Run with `--reporter=verbose --pool=forks` to
isolate, then look for the hanging suite. Kill `node` processes from
your task manager before re-running.

### A Rust test fails only on Windows

The classic three suspects are:

1. **Path separators** — use `Path::new`, not `format!("{}/...", ...)`.
2. **CRLF line endings** — `git config core.autocrlf input` if your
   clone has Unix-style endings; tests assume `\n`.
3. **Antivirus latency** — see [the Defender note](#cargo-test-is-slow-on-windows).

### `Verify markdown round-trip AST snapshots` fails on CI but passes locally

You forgot to commit the regenerated `<fixture>.expected.json`. Run
locally:

```bash
for f in tests/markdown-roundtrip/*.md; do
  [[ "$(basename "$f")" == README.md ]] && continue
  cargo run --quiet --example dump_ast -- "$f" > "${f%.md}.expected.json"
done
git add tests/markdown-roundtrip
git commit --amend --no-edit
```

If you're on PowerShell:

```powershell
Get-ChildItem tests\markdown-roundtrip\*.md |
  Where-Object Name -ne 'README.md' |
  ForEach-Object {
    $expected = $_.FullName -replace '\.md$', '.expected.json'
    cargo run --quiet --example dump_ast -- $_.FullName | Set-Content $expected
  }
```

## Performance issues

### Cold start of the desktop app is over 5 seconds

In dev mode, that's normal; Vite + the Rust build dominate.
Production cold start is the budget number — measure with the v0.1
release build:

```bash
pnpm tauri:build
./target/release/lattice-desktop
```

If the **release** build is over 400 ms cold-start (per the
[ARCHITECTURE.md budget](../../ARCHITECTURE.md#performance-budgets)),
that's a regression to file. Steps to bisect are in
[`development/performance.md`](../development/performance.md).

### `pnpm install` is mysteriously slow

- Clear pnpm's metadata cache: `pnpm store prune`.
- Disable any pnpm registry mirror you may have configured: `pnpm
  config get registry` should return `https://registry.npmjs.org/`.
- On corporate networks, check that pnpm picks up your proxy: the
  `HTTP_PROXY` / `HTTPS_PROXY` env vars are honoured.

## When all else fails

If you've tried the relevant recipe and the problem persists:

1. **File a bug** with the diagnostic block from the top of this
   page, the failing command, and its full output.
2. **Open a Discussion** on GitHub if you're not sure whether it's a
   bug or a misconfiguration on your end.
3. **Ping in a PR** if it's blocking you on a contribution — we'd
   rather unblock you than have you give up.

The setup path is something we treat as a feature; bugs in it are
high-priority.
