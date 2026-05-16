# Your first build

> Step-by-step from `git clone` to a running Lattice window, with the
> expected output at each checkpoint. If a step fails, jump to
> [Troubleshooting](troubleshooting.md).

## Before you start

Confirm the toolchain by running [the verification block](prerequisites.md#verifying-the-toolchain):

```bash
node --version
pnpm --version
rustc --version
cargo tauri --version
```

All four must print versions. If any are missing, install them first.

## Step 1 — Clone

```bash
git clone https://github.com/goldr0g3r/lattice.git
cd lattice
```

The repo is around 5 MB at clone-time (no LFS objects yet).

## Step 2 — Install JS dependencies

```bash
pnpm install --frozen-lockfile
```

What happens:

- pnpm reads `pnpm-workspace.yaml` and hydrates **every** package
  under `apps/`, `packages/`, and the root.
- All packages share a single `node_modules/.pnpm/` content-addressable
  store; per-package `node_modules/` are symlinks into it.

Expected duration:

| Cache state                | Time      |
| -------------------------- | --------- |
| Cold (no `~/.pnpm-store`)  | 60–120 s  |
| Warm                       | 5–15 s    |

Expected size:

- `~/.pnpm-store/` — ~600 MB (shared across all pnpm projects on the host).
- `<repo>/node_modules/` — symlinks only, almost zero direct size.

If you see `ERR_PNPM_OUTDATED_LOCKFILE`, your `package.json` and
`pnpm-lock.yaml` are out of sync — that's a regression in `main` to
report, not something you should fix locally.

## Step 3 — First Rust build (warm-up)

You can skip this step (Tauri does it for you), but it's a good
checkpoint:

```bash
cargo build --workspace
```

Expected duration:

| Cache state                                | Time     |
| ------------------------------------------ | -------- |
| Cold (`target/` empty)                     | 90–180 s |
| Warm (post-incremental)                    | 5–20 s   |

What this validates:

- The Rust toolchain is up-to-date.
- All `core/lattice-*` crates compile.
- `lattice-desktop` (the Tauri shell) compiles.
- The workspace `Cargo.lock` checks out cleanly.

## Step 4 — Start the dev server

```bash
pnpm tauri:dev
```

Or equivalently:

```bash
pnpm --filter @lattice/desktop tauri dev
```

What happens, in order:

1. **Vite starts** on `http://localhost:1420` and serves the React
   app from `apps/desktop/src/`. You'll see "VITE vX.Y.Z ready in
   NNN ms".
2. **Tauri compiles** the desktop shell at `apps/desktop/src-tauri/`.
   First time: ~2–5 minutes. Subsequent: ~5–20 s for incremental.
3. A **native window** pops up titled "Lattice", showing the
   workspace shell with sidebar, picker rail, and editor pane.

You'll know it worked when:

- The window paints without "WebView did not load" errors.
- The terminal logs `Compiling lattice-desktop v0.1.0` then
  `Finished dev profile [unoptimized + debuginfo]` then
  `Running ../../../target/debug/lattice-desktop`.
- Hot module reload works — edit `apps/desktop/src/App.tsx`, save,
  and the window updates within ~1 s without a full restart.

## Step 5 — Open a vault

In the running app:

1. Click **Open vault…** (or press `Ctrl+K` and search "Open vault").
2. Pick or create a folder somewhere outside the repo
   (e.g. `~/Documents/MyTestVault`).
3. The folder gets a hidden `.lattice/` subdirectory; the app reads
   any `.md` files at the root.

Drop a `hello.md` into the folder while the app is open — the file
watcher should pick it up within ~250 ms (Linux) / ~100 ms (Windows)
and the picker rail should reflect it. That's the file-watcher
debounce window from
[ADR-0014](../decisions/0014-file-watcher-debounce.md) in action.

## Step 6 — Run the test suites

Both sides should be green on a fresh clone.

### JS / TS

```bash
pnpm test
```

Runs vitest across every workspace. Expected: ~80 tests pass in
~10 s on a warm cache.

### Rust

```bash
cargo test --workspace --all-features
```

Expected: tests in `lattice-core` (vault, watcher, markdown
round-trip), `lattice-search`, `lattice-ai`, `lattice-sync` all pass
in ~20 s warm.

### Lints

```bash
pnpm lint
pnpm typecheck
pnpm format
pnpm tokens:check
cargo fmt --all --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

These are the same gates CI runs. If any one fails locally, your PR
will fail too — fix before pushing.

## What's running on your machine

After `pnpm tauri:dev` settles, the process tree looks like:

```text
node (Vite dev server)         localhost:1420
└─ vite (HMR over WebSocket)
target/debug/lattice-desktop   the actual app binary
└─ webview2 / webkitgtk        the OS WebView showing the React app
```

There's no third process; Tauri folds the renderer into the same OS
window the binary owns. Compare to Electron, where you'd see four
processes (main + renderer + GPU + utility).

## Editor / IDE warm-up

Open the repo in your editor and let:

- **rust-analyzer** index `core/` (~30 s on first open).
- **TypeScript Language Server** index `apps/desktop/`,
  `packages/editor/`, `packages/ui/` (~10 s).
- **Tailwind IntelliSense** read `tailwind.config.ts`
  (instant once the LSP is up).

Until those finish, jump-to-definition and "find usages" may say
nothing — be patient.

## What next

- Read [`../development/README.md`](../development/README.md) for the
  daily workflow.
- Pick up a [`good first issue`](https://github.com/goldr0g3r/lattice/labels/good%20first%20issue).
- Browse the [`how-to/`](../how-to/README.md) recipes for common
  tasks.
