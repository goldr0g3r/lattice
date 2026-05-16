# Getting started

> The shortest path from `git clone` to a running Lattice dev session.

## The 60-second tour

If your machine already has Node 20+, pnpm 10+, Rust stable, and the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/),
this is the whole onboarding:

```bash
git clone https://github.com/goldr0g3r/lattice.git
cd lattice
pnpm install
pnpm tauri:dev
```

A Tauri window opens within ~10 seconds on a warm cache, ~2 minutes
on a cold one (first `cargo build` of the workspace).

If any of those four lines failed — or you don't already have the
prerequisites — read on.

## Step-by-step

The three pages in this folder cover the journey end-to-end:

1. **[Prerequisites](prerequisites.md)** — the toolchain matrix with
   per-OS install commands (Windows + Linux + macOS dev hosts).
2. **[First build](first-build.md)** — every step from `git clone` to
   a running window, with the expected output at each checkpoint.
3. **[Troubleshooting](troubleshooting.md)** — failures we've seen
   often enough to write down, with their fixes.

Once the app runs, the next stop is the [development
overview](../development/README.md), which covers daily workflow.

## A note on the project's state

Lattice is **pre-alpha** at the time of writing — the v0.1 milestone
is still in progress. Some commands you might expect (`Open vault…`,
`Search`, AI panel, etc.) are stubs that toast "ships in v0.X".
That's by design; see [`../../ROADMAP.md`](../../ROADMAP.md) for the
release plan.

If something is broken in a way the troubleshooting page doesn't
cover, that's a **bug** — open an issue on GitHub and we'll fix it.
The setup path is something we want to keep frictionless.
