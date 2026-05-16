# Monorepo layout

> How the Lattice repo is wired up. Two parallel workspaces — pnpm +
> Turborepo on the JS / TS side, Cargo on the Rust side — plus a
> handful of cross-cutting glue. Decision context lives in
> [ADR-0008](../decisions/0008-pnpm-turborepo-monorepo.md).

## Top-level layout

```text
lattice/
├─ apps/
│  └─ desktop/             Tauri 2 desktop shell (Windows + Linux)
│     ├─ src/              React app (Vite, Tailwind, shadcn primitives)
│     └─ src-tauri/        Rust binary (the app's main process)
├─ packages/
│  ├─ ui/                  Design system primitives + tokens
│  ├─ editor/              TipTap + CodeMirror + Markdown round-trip
│  ├─ core-bindings/       ts-rs-generated types from Rust core
│  └─ config/              Shared eslint, tsconfig, tailwind preset
├─ core/                   Rust workspace
│  ├─ lattice-core/        Vault FS, Markdown parser, SQLite, watcher
│  ├─ lattice-search/      Tantivy wrapper (v0.3+)
│  ├─ lattice-ai/          AI provider abstraction (v0.4+)
│  └─ lattice-sync/        yrs CRDT + sync client (v0.5+)
├─ scripts/                Repo-level Node scripts (token parity, etc.)
├─ tests/
│  └─ markdown-roundtrip/  Golden corpus shared by Rust + TS serialisers
├─ .github/                CI, issue templates, GitHub-as-code
├─ docs/                   You are here
├─ pnpm-workspace.yaml     Defines the JS workspace globs
├─ turbo.json              Defines task graph + caching for Turbo
├─ Cargo.toml              Defines the Rust workspace
└─ package.json            Root scripts + dev tooling
```

The full target layout is in
[`../../ARCHITECTURE.md`](../../ARCHITECTURE.md#repo-layout-target);
the entries above are what's checked in today.

## Two workspaces, one repo

The JS / TS side and the Rust side are managed by **independent**
tools and you should think of them that way.

### JS workspace — pnpm + Turborepo

Defined by [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml):

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Every directory matching those globs that has a `package.json` is a
workspace package. Internal references use the
`workspace:*` protocol:

```json
"dependencies": {
  "@lattice/ui": "workspace:*",
  "@lattice/editor": "workspace:*",
  "@lattice/core-bindings": "workspace:*"
}
```

pnpm hoists everything into a single content-addressable store at
`~/.pnpm-store/`; per-package `node_modules/` are symlink farms. This
is **strict** — a package can only import dependencies it actually
declares. The strictness occasionally surprises newcomers; reach for
`pnpm why <pkg>` to find out who pulled a transitive dep.

### Build orchestration — Turborepo

Tasks are defined in [`turbo.json`](../../turbo.json):

| Task        | Purpose                                                  | Depends on   |
| ----------- | -------------------------------------------------------- | ------------ |
| `build`     | Per-package build (mostly `tsc --build`).                | `^build`     |
| `lint`      | ESLint per package.                                      | —            |
| `typecheck` | `tsc --noEmit`.                                          | `^build`     |
| `test`      | `vitest run`.                                            | `^build`     |
| `format`    | Repo-wide `prettier`.                                    | —            |
| `clean`     | Per-package wipe.                                        | — (no cache) |

The `^build` arrow means "run upstream `build` first" — so changes
to `packages/ui` rebuild before downstream packages typecheck.

Turbo caches every task by hashed inputs. On a re-run with no source
changes, the second `pnpm test` returns in <1 s with `>>> CACHE HIT`.

CI uses **affected detection** to skip unchanged packages:

```bash
turbo run lint typecheck test build --filter=...[origin/main]
```

You can use the same locally on a big PR:

```bash
pnpm lint --filter=...[origin/main]
```

### Rust workspace — Cargo

Defined by the root [`Cargo.toml`](../../Cargo.toml):

```toml
[workspace]
resolver = "2"
members = [
    "core/lattice-core",
    "core/lattice-search",
    "core/lattice-ai",
    "core/lattice-sync",
    "apps/desktop/src-tauri",
]
```

`workspace.dependencies` pin versions for the whole workspace; each
crate's own `Cargo.toml` opts into a workspace dep with `dep =
{ workspace = true }`. The `[profile.release]` block in the root
applies to every member.

Cargo handles its own incremental builds and caching — Turbo is **not**
aware of Cargo (and shouldn't be; Cargo is already faster than any
Turbo wrapping would be).

### Where the boundaries meet

Two places:

- **Tauri shell.** `apps/desktop/src-tauri/` is a Rust crate and a
  workspace member, but it's also a JS package's `tauri` script
  target. `pnpm tauri:dev` wraps `cargo tauri dev` from the
  `@lattice/desktop` package.
- **`ts-rs` codegen.** `cargo test -p lattice-core` regenerates
  `packages/core-bindings/src/generated/*.ts`. The CI step
  `Verify generated ts-rs bindings are committed` fails if anyone
  forgot to commit the regenerated files. The full IPC contract is
  documented at [`../architecture/ipc-contract.md`](../architecture/ipc-contract.md).

## Per-package map

### `apps/desktop`

The actual Lattice desktop application.

| Path                            | What's there                                  |
| ------------------------------- | --------------------------------------------- |
| `src/main.tsx`                  | React entry point + theme bootstrap.          |
| `src/App.tsx`                   | Top-level state composition.                  |
| `src/shell/WorkspaceShell.tsx`  | Three-pane workspace layout.                  |
| `src/components/`               | App-specific components (CommandPalette, etc.). |
| `src/commands/`                 | Command-palette command registry.             |
| `src/__tests__/`                | Vitest setup + integration tests.             |
| `src-tauri/Cargo.toml`          | Rust crate `lattice-desktop`.                 |
| `src-tauri/src/lib.rs`          | Tauri builder; registers commands + state.    |
| `src-tauri/src/commands/`       | IPC command modules (vault, notes, system).   |
| `src-tauri/tauri.conf.json`     | Window, CSP, bundler, identifier.             |
| `src-tauri/capabilities/`       | Tauri 2 capability files (CSP-style perms).   |

### `packages/ui`

Design system. Wraps a curated subset of shadcn / Radix primitives
with our token system on top.

| Path                       | What's there                                         |
| -------------------------- | ---------------------------------------------------- |
| `src/tokens.css`           | The single source of truth for design tokens.        |
| `src/components/*.tsx`     | Button, Dialog, Command, Tooltip, Toast, Tabs, etc.  |
| `src/fonts.ts`             | `@fontsource-variable/*` imports.                    |
| `src/lib/utils.ts`         | `cn()` helper, etc.                                  |
| `src/index.ts`             | Public exports.                                      |

### `packages/editor`

The TipTap-based block editor and its Markdown round-trip pipeline.

| Path                                       | What's there                                  |
| ------------------------------------------ | --------------------------------------------- |
| `src/markdown/parser.ts`                   | Markdown → `NoteDoc`.                         |
| `src/markdown/serializer.ts`               | `NoteDoc` → Markdown.                         |
| `src/tiptap/schema.ts`                     | ProseMirror schema (block + inline).          |
| `src/tiptap/extensions/*.ts`               | Wiki-link, callout, math, mermaid/excalidraw, slash. |
| `src/tiptap/codemirror/*.ts`               | CM6 inside-block-editor wiring.               |
| `src/tiptap/to-doc.ts` / `from-doc.ts`     | TipTap doc ↔ `NoteDoc` conversion.            |

### `packages/core-bindings`

Auto-generated TypeScript types from `core/lattice-core` via `ts-rs`.
Output lives under `src/generated/` and is checked in. **Do not edit
these files** — regenerate by running `cargo test -p lattice-core` and
committing the diff.

### `packages/config`

Shared configuration that doesn't fit elsewhere:

- `tsconfig-preset/` — `extends`-able TypeScript bases.
- `tailwind-preset/` — Tailwind theme/utility map for our tokens.
- ESLint base in `eslint.config.mjs` (root, not per-package).

### `core/lattice-core`

The most-substantial Rust crate. Owns:

- **Vault** — open / create / switch / close.
- **Notes** — list / read / write / create.
- **Markdown** — parser, AST, serialiser; round-trips via the golden
  corpus shared with TS.
- **DB** — `sqlx::migrate!` + a connection pool.
- **Watcher** — `notify-debouncer-full` over the vault root.
- **Telemetry** — opt-in JSONL emitter, schema in
  [`../telemetry.md`](../telemetry.md).
- **Logging** — `tracing` + `tracing-appender` rotation.
- **Types** — `Note`, `Tag`, `Link`, `Attachment`, `VaultInfo`, all
  `#[derive(TS)]`-annotated.
- **Error** — `LatticeError` (the only error type that ever crosses
  the IPC boundary).

### `core/lattice-search`, `core/lattice-ai`, `core/lattice-sync`

Stub crates today; flesh out per the milestone schedule:

- `lattice-search` — Tantivy wrapper (v0.3).
- `lattice-ai` — provider abstraction + RAG (v0.4).
- `lattice-sync` — `yrs`-backed CRDT sync (v0.5).

## Common monorepo recipes

### Add a new JS package

```bash
mkdir -p packages/my-feature
cd packages/my-feature
# write package.json with "name": "@lattice/my-feature", "private": true,
# "exports", "scripts" (lint/typecheck/test/build), and the workspace deps you need.
pnpm install   # from repo root
```

The package picks up:

- The root ESLint config.
- `tsconfig-preset` if you `"extends"` it.
- Turborepo task graph entries (no extra config — the package's
  `package.json` `scripts.{lint,typecheck,test,build}` are what Turbo
  picks up).

### Add a new Rust crate

```bash
cargo new --lib core/lattice-something
```

Then add `"core/lattice-something"` to the root `Cargo.toml`'s
`[workspace] members =`. Use workspace deps:

```toml
[dependencies]
tokio = { workspace = true }
serde = { workspace = true }
```

If the crate exposes types over IPC, derive `TS` and follow the
[IPC contract page](../architecture/ipc-contract.md).

### Run a single package's tests

```bash
pnpm --filter @lattice/editor test
cargo test -p lattice-core
```

### Re-run a single Turbo task ignoring cache

```bash
pnpm lint --force
```

### Cleaning out everything

```bash
pnpm clean
cargo clean
rm -rf .turbo node_modules
```

This nukes ~4 GB; only do it when something feels structurally
broken.

## What lives where (cheat-sheet)

| Adding…                                  | Touch…                                                        |
| ---------------------------------------- | ------------------------------------------------------------- |
| A Tauri command                          | `apps/desktop/src-tauri/src/commands/<domain>.rs` + `lib.rs`. |
| A Rust public type that crosses IPC      | `core/lattice-core/src/types.rs` (or a domain module). Re-run `cargo test -p lattice-core`. |
| A React component                        | `apps/desktop/src/components/` for app-specific, `packages/ui/src/components/` for reusable. |
| A design token                           | Both `packages/ui/src/tokens.css` and `packages/config/tailwind-preset/index.cjs`. |
| A TipTap extension                       | `packages/editor/src/tiptap/extensions/`.                     |
| A Markdown round-trip fixture            | `tests/markdown-roundtrip/<name>.md` + regenerate the AST.    |
| A new ADR                                | `docs/decisions/NNNN-<title>.md`.                             |

When in doubt, grep the existing code for an example and follow the
pattern.
