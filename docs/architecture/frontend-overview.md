# Frontend overview

> Tour of the React side: the desktop app's structure, the design
> system, the editor package, and how they fit together.
>
> Decision context:
> [ADR-0001 — Tauri 2 as the cross-platform shell](../decisions/0001-tauri-2-cross-platform-shell.md),
> [ADR-0003 — TipTap (ProseMirror) as the editor](../decisions/0003-tiptap-prosemirror-editor.md),
> [ADR-0010 — Design tokens and typography](../decisions/0010-design-tokens-and-typography.md),
> [ADR-0011 — Font-loading strategy](../decisions/0011-font-loading-strategy.md).

## What ships in `apps/desktop/src/`

The actual Lattice app. Vite + React 18 + TypeScript + Tailwind.

```text
apps/desktop/src/
├─ main.tsx                  React entry point + theme bootstrap
├─ App.tsx                   Top-level state composition
├─ styles.css                Global stylesheet (resets + Tailwind base)
├─ shell.css                 Workspace-shell-specific custom properties
├─ shell/
│  └─ WorkspaceShell.tsx     Three-pane layout: sidebar | picker | editor
├─ components/
│  ├─ CommandPalette.tsx     ⌘K palette (cmdk + shadcn Dialog)
│  └─ __tests__/             Component tests (vitest + Testing Library)
├─ commands/
│  ├─ registry.ts            AppCommand registry + CommandContext shape
│  └─ note-commands.ts       Dynamic "Open note: <title>" entries
├─ __tests__/
│  └─ setup.ts               jsdom polyfills (ResizeObserver, etc.)
├─ index.html                Minimal Vite entry HTML
├─ tsconfig.json
├─ vite.config.ts
├─ tailwind.config.ts
├─ postcss.config.cjs
└─ vitest.config.ts
```

### Layering

The app composes top-down without state management beyond `useState`
plus `useReducer` so far. We avoided introducing Zustand or
TanStack Query during v0.1 since the surface is small enough; the
v0.4 AI panel is the planned moment to bring TanStack Query in for
remote-state caching.

```text
main.tsx
└─ App.tsx                ← owns vault state, theme, telemetry settings
   └─ WorkspaceShell      ← pure presentational; receives props
      ├─ Sidebar          ← workspace switcher + nav
      ├─ NoteList         ← picker rail bound to vault://index events
      └─ EditorPane       ← TipTap editor (lazy-loaded post-v0.2 PR #1)
   └─ CommandPalette      ← global ⌘K, mounted at the root
   └─ Toaster             ← sonner toasts via @lattice/ui
```

`WorkspaceShell` is intentionally dumb — it doesn't know about Tauri
IPC, doesn't own state. `App.tsx` does the wiring and passes
callbacks down. This makes `WorkspaceShell` testable in isolation
with mocked props.

### Bootstrap

`main.tsx` does five things, in order:

1. Import `@lattice/ui/tokens.css` so design tokens land before
   first paint.
2. Import `@lattice/ui/fonts` to kick off `@fontsource-variable/*`
   loads with `font-display: swap`.
3. Read the `data-theme` attribute (or `prefers-color-scheme`) to
   pick light vs dark.
4. `createRoot(document.getElementById("root")).render(<App />)`.
5. Once the React tree paints, signal `renderer://ready` so the
   shell can stop the cold-start timer and emit `app.start`
   telemetry (when enabled).

### IPC integration

The app talks to the core via two `@tauri-apps/api/core` primitives:

- `invoke("command_name", { …args })` — request/response.
- `listen("vault://index", handler)` — subscribe to an event stream.

All payload types come from `@lattice/core-bindings/generated/*`.
See [`ipc-contract.md`](ipc-contract.md) for the full surface.

## `packages/ui/` — design system

The shared component library. Wraps a curated subset of shadcn /
Radix primitives with our token system on top.

```text
packages/ui/src/
├─ tokens.css               Single source of truth for design tokens
├─ fonts.ts                 @fontsource-variable/* imports
├─ index.ts                 Public exports (component re-exports)
├─ lib/utils.ts             cn() helper, etc.
├─ components/
│  ├─ button.tsx
│  ├─ card.tsx
│  ├─ command.tsx           cmdk wrapper for the ⌘K palette
│  ├─ dialog.tsx
│  ├─ dropdown-menu.tsx
│  ├─ input.tsx
│  ├─ separator.tsx
│  ├─ sheet.tsx
│  ├─ tabs.tsx
│  ├─ toast.tsx
│  ├─ tooltip.tsx
│  └─ wordmark.tsx          The Lattice wordmark
├─ assets/
│  ├─ icon-mark.svg
│  └─ wordmark.svg
└─ tokens.test.ts           Sanity-checks the tokens.css surface
```

Conventions:

- **Each component is one file**, default-exports nothing, named-exports
  the component(s).
- **Styling via Tailwind** that resolves to design tokens. No inline
  hex values; if you need one, add a token first
  ([recipe](../how-to/add-a-design-token.md)).
- **Variants via `class-variance-authority`** when we have more than
  two — see `button.tsx`.
- **Accessibility is non-negotiable** — every interactive primitive
  composes the matching Radix slot, never reinvents one.

The token contract is locked by
[ADR-0010](../decisions/0010-design-tokens-and-typography.md):
role-based names (`--accent-primary`, `--bg-canvas`), light + dark
themes share keys, themes flip via `data-theme="dark"` on `<html>`.

The Tailwind preset at
[`packages/config/tailwind-preset/`](../../packages/config/tailwind-preset/)
maps every token onto a utility class. Drift is detected by
`scripts/check-token-parity.mjs` (`pnpm tokens:check`); see
[`../how-to/add-a-design-token.md`](../how-to/add-a-design-token.md)
for the workflow.

### Fonts

We self-host **Newsreader** (display serif), **Inter** (UI sans), and
**JetBrains Mono** (code) via `@fontsource-variable/*` with
`font-display: swap`. The full loading strategy is in
[ADR-0011](../decisions/0011-font-loading-strategy.md). System-font
fallbacks are declared in `tokens.css` so the first paint never
flashes invisible text.

## `packages/editor/` — TipTap pipeline

The block editor. Owns the Markdown round-trip, the TipTap schema +
extensions, and the CodeMirror-inside-block-node integration.

```text
packages/editor/src/
├─ index.ts
├─ markdown/
│  ├─ parser.ts             Markdown -> NoteDoc (mdast-util-from-markdown + custom)
│  ├─ serializer.ts         NoteDoc -> Markdown
│  ├─ index.ts              Public exports
│  └─ __tests__/            roundtrip.test.ts
└─ tiptap/
   ├─ schema.ts             ProseMirror schema (block + inline nodes)
   ├─ to-doc.ts             TipTap doc -> NoteDoc
   ├─ from-doc.ts           NoteDoc -> TipTap doc
   ├─ slash-items.ts        Slash-command menu items
   ├─ index.ts              Public exports
   ├─ extensions/
   │  ├─ wiki-link.ts       [[Wiki Title]] (mark)
   │  ├─ callout.ts         > [!info] | [!warn] | [!tip]
   │  ├─ math.ts            $inline$ / $$block$$ via KaTeX
   │  ├─ fenced.ts          mermaid + excalidraw fenced blocks
   │  ├─ html-block.ts      raw HTML passthrough
   │  ├─ footnote.ts        GFM footnotes
   │  ├─ image.ts           Drag-and-drop image
   │  └─ slash-commands.ts  Slash menu plumbing
   ├─ codemirror/
   │  ├─ node-view.ts       CM6 inside a TipTap code-block node
   │  ├─ languages.ts       Supported languages + lazy-loading
   │  └─ theme.ts           CM6 theme bound to design tokens
   ├─ components/
   │  └─ index.ts
   └─ __tests__/
      └─ conversion.test.ts
```

The deep dive is in [`editor-internals.md`](editor-internals.md). The
short version:

- **NoteDoc** is the editor-agnostic document shape that owns the
  Markdown round-trip contract. The Rust side has the same shape in
  `lattice-core::markdown::NoteDoc`.
- **TipTap schema** is **JSON-first internally**; the parser and
  serialiser are separate from the schema.
- **CodeMirror 6** is embedded inside the `code_block` node via a
  custom `NodeView` so syntax highlighting and language-aware
  editing work for the ~14 languages we ship by default.

## `packages/core-bindings/` — generated types

Auto-generated by `ts-rs` from the Rust core. Output lives under
`src/generated/` and is checked in. **Do not edit these files** —
regenerate by running `cargo test -p lattice-core` and committing
the diff.

The CI step `Verify generated ts-rs bindings are committed` in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) fails
if anyone forgets.

## `packages/config/` — shared configuration

```text
packages/config/
├─ tsconfig-preset/         tsconfig bases (`base.json`, `react.json`)
└─ tailwind-preset/         The token map → utility classes
```

Imported via `extends` (TS) or `presets` (Tailwind):

```jsonc
// apps/desktop/tsconfig.json
{ "extends": "@lattice/tsconfig-preset/react.json" }
```

```ts
// apps/desktop/tailwind.config.ts
import preset from "@lattice/tailwind-preset";
export default {
  presets: [preset],
  content: [
    /* … */
  ],
};
```

## State, routing, async

As of v0.1 we lean on the simplest stack that works:

- **State** — `useState` / `useReducer` in `App.tsx`. No Zustand
  store yet; introduced when the AI panel needs a shared cache
  (v0.4).
- **Routing** — there's exactly one window with one persistent
  layout; navigation is in-app keyboard / palette commands. We
  haven't pulled in `react-router`; we may not need to before v1.0.
- **Data fetching** — `await invoke(...)` in event handlers, with
  loading state held locally. TanStack Query lands in v0.4.
- **Forms** — there's no form-heavy surface yet. When one shows up
  (settings, preferences), `react-hook-form` + zod is the planned
  stack.

## Build & dev server

- **Vite** dev server on `localhost:1420`. Tauri waits for it
  before starting (`build.beforeDevCommand` in
  [`tauri.conf.json`](../../apps/desktop/src-tauri/tauri.conf.json)).
- **Production build**: `pnpm tauri:build` → `vite build` →
  `cargo tauri build` → installer artifacts under `target/release/`.
- **Hot Module Reload** works for the React side; the Rust side
  needs a `cargo tauri dev` restart on changes.
