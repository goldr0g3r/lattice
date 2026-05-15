# Changelog

All notable changes to **Lattice** will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **v0.2 PR #4 — `[[wiki-link]]` autocomplete + click-to-navigate**
  (branch `feat/wiki-link-autocomplete`, closes
  issue [#36](https://github.com/goldr0g3r/lattice/issues/36)). Builds on
  the inline wiki-link atom shipped in
  [PR #54](https://github.com/goldr0g3r/lattice/pull/54): typing `[[`
  opens an autocomplete popup over a host-provided note list, ⏎ inserts
  `[[Target|Alias]]`, clicking a rendered link fires an
  "open-or-create" navigation callback, and a typing input rule converts
  `[[Manual Title]]` into a wiki-link node when the user closes the
  brackets without picking a candidate.
  - **Extension refactor**
    ([`packages/editor/src/tiptap/extensions/wiki-link.ts`](packages/editor/src/tiptap/extensions/wiki-link.ts)):
    `Node.create<WikiLinkOptions>` with `addOptions()` defaulting to the
    no-op `defaultWikiLinkOptions` (empty `getNoteTitles`, `console.info`
    `onNavigate`). `addProseMirrorPlugins()` returns two plugins — a
    `@tiptap/suggestion` instance with a custom
    `findSuggestionMatch` that scans backwards for the last `[[` (D1,
    works around the suggestion plugin's single-char `char` limitation),
    and a small mousedown plugin (D6) that intercepts clicks on
    `[data-wiki-link]` and forwards `{ target, alias }` to
    `options.onNavigate`. `addInputRules()` keeps the manual
    `[[Target]]` / `[[Target|Alias]]` typing path so users can still
    insert links without the popup. Node `attrs` / `parseHTML` /
    `renderHTML` are **unchanged from PR #54** so the 13-fixture
    NoteDoc<->PM corpus and the 26-fixture Markdown round-trip corpus
    stay green with zero fixture edits (D7).
  - **Data-source decoupling**: the extension takes a `WikiLinkOptions`
    shape — `getNoteTitles(query) → Promise<readonly NoteCandidate[]>`
    for the autocomplete data source and
    `onNavigate({ target, alias })` for click handling. The defaults
    return `[]` / log to `console.info`, so the editor compiles
    stand-alone and the empty-state path is what the user sees absent
    host wiring. Wiring the real `vault_list_notes` / `vault_read_note`
    IPC commands from the desktop shell into these callbacks is a
    follow-up PR after `feat/desktop-shell-redesign` merges; that PR
    will inject `getNoteTitles` (querying the watcher-backed index) and
    `onNavigate` (open existing vs create-and-open).
  - **React menu component**
    ([`packages/editor/src/tiptap/components/WikiLinkMenu.tsx`](packages/editor/src/tiptap/components/WikiLinkMenu.tsx)):
    `forwardRef` + `useImperativeHandle` exposes an `onKeyDown(event)`
    hook for the suggestion plugin to forward arrow / enter keys
    (mirrors the `SlashMenu` contract). Renders title + optional
    `snippet` per candidate, hover-to-select, mousedown-to-commit.
    Empty state shows "No matching notes" + a `Press Esc to keep typing
    [[query]] as plain text` hint that strips the `|alias` suffix from
    the typed query (D5).
  - **Schema + Editor wiring**
    ([`packages/editor/src/tiptap/schema.ts`](packages/editor/src/tiptap/schema.ts) +
    [`Editor.tsx`](packages/editor/src/tiptap/Editor.tsx)):
    `buildExtensions()` grows a `BuildExtensionsOptions` shape with an
    optional `wikiLink?: Partial<WikiLinkOptions>` that gets forwarded
    via `WikiLink.configure(...)` only when the caller actually
    overrides something. `<Editor>` exposes the same prop and threads
    it through. Absent both, every existing call-site (slash-menu test,
    editor mount test, desktop App) keeps the no-op defaults.
  - **Re-exports** ([`packages/editor/src/tiptap/index.ts`](packages/editor/src/tiptap/index.ts)):
    `WikiLink`, `defaultWikiLinkOptions`, `filterNoteCandidates`,
    `NoteCandidate`, `WikiLinkNavigation`, `WikiLinkOptions`, and
    `BuildExtensionsOptions` are all public so the desktop shell can
    inject a vault-backed data source without re-importing internals.
  - **Design decisions** are locked inline at the top of
    [`extensions/wiki-link.ts`](packages/editor/src/tiptap/extensions/wiki-link.ts):
    D1 `[[` trigger via custom `findSuggestionMatch`, D2 `|`-split
    query parsing, D3 case-insensitive substring + data-source-owned
    ordering (no built-in recency bias), D4 ↑/↓/⏎/Esc + hover/click,
    D5 empty-state copy, D6 click-to-navigate via a dedicated PM
    plugin (TipTap's contenteditable swallows default anchor clicks),
    D7 round-trip preservation, D8 SSR / jsdom safety
    (`typeof document !== "undefined"` guard around the popper init).
  - **Tests**: 14 new vitest cases across two new files —
    [`__tests__/wiki-link-extension.test.ts`](packages/editor/src/tiptap/__tests__/wiki-link-extension.test.ts)
    (7 node-env cases: extension registration, default options shape,
    `filterNoteCandidates` ordering / case-insensitivity / alias-pipe
    handling / array freshness, schema integration with + without
    overrides) and
    [`__tests__/wiki-link.test.tsx`](packages/editor/src/tiptap/__tests__/wiki-link.test.tsx)
    (7 jsdom cases: menu opens with rows, renders titles + snippets,
    arrow-up/-down navigation, enter command, unrelated-key passthrough,
    empty-state copy, empty-state strips `|alias`, plus 2 `<Editor>`
    mount tests asserting wiki-link node renders + injected options
    don't crash). Existing **13-fixture NoteDoc<->PM conversion
    corpus**, **26-fixture Markdown round-trip corpus**, **5 SlashMenu
    keyboard tests**, and **2 Editor mount tests** all continue to
    pass with **zero fixture edits**.
  - **Follow-up wiring**: once
    [`feat/desktop-shell-redesign`](https://github.com/goldr0g3r/lattice/issues/40)
    lands its `vault_list_notes` / `vault_read_note` Tauri commands,
    a small follow-up PR will pass
    `wikiLink={{ getNoteTitles: vaultListNotes, onNavigate: openOrCreate }}`
    from `apps/desktop/src/App.tsx` into the `<Editor>` and the
    autocomplete will be live against real vault contents. No
    schema / serializer changes required for that wiring — the
    interface in this PR is the contract.
- **v0.2 PR #5 — KaTeX math rendering (inline + block)**
  (branch `feat/katex-math-render`, math slice of issue
  [#37](https://github.com/goldr0g3r/lattice/issues/37); issue stays open
  for the Mermaid + Excalidraw follow-ups). Renders inline `$..$` and
  block `$$..$$` math via KaTeX inside the TipTap editor while keeping
  the on-disk Markdown contract from PR #1 byte-identical:
  - **Library**
    ([`packages/editor/package.json`](packages/editor/package.json)):
    new dependencies `katex@^0.16.46` + `@types/katex@^0.16.8`. KaTeX's
    server-side `renderToString` works in node so jsdom tests can mount
    the editor without polyfilling, and the bundle adds ~280 KB
    minified — acceptable for the editor surface (D1).
  - **React node-views**
    ([`packages/editor/src/tiptap/components/MathInline.tsx`](packages/editor/src/tiptap/components/MathInline.tsx) +
    [`MathBlock.tsx`](packages/editor/src/tiptap/components/MathBlock.tsx)):
    each component reads `node.attrs.src`, calls
    `katex.renderToString(src, { throwOnError: false, displayMode })`,
    and injects the result via `dangerouslySetInnerHTML` inside a
    `NodeViewWrapper`. Read-only — clicking the rendered math to edit
    the source is a follow-up (out of scope) (D2).
  - **Extension refactor**
    ([`packages/editor/src/tiptap/extensions/math.ts`](packages/editor/src/tiptap/extensions/math.ts)):
    both `InlineMath` and `BlockMath` gain `addNodeView()` returning a
    `ReactNodeViewRenderer` against the new components. **`attrs`,
    `parseHTML`, and `renderHTML` are unchanged** so the NoteDoc <->
    ProseMirror converter pair in `from-doc.ts` / `to-doc.ts` and its
    13-fixture corpus stay green with zero edits — KaTeX HTML lives
    only inside the live `addNodeView()` DOM, never in the serialised
    `<code data-math>` / `<pre data-math>` (D4 — round-trip preserved).
  - **Error UX**: `katex.renderToString` with `throwOnError: false`
    emits a `<span class="katex-error">` for malformed LaTeX and KaTeX
    already styles that; we route its colour through `--color-danger`
    so dark mode reads correctly (D3).
  - **CSS delivery — two files, two import paths**
    ([`packages/editor/src/tiptap/katex-fonts.css`](packages/editor/src/tiptap/katex-fonts.css) +
    [`packages/editor/src/tiptap/math.css`](packages/editor/src/tiptap/math.css),
    re-exported from `packages/editor/package.json` as
    `@lattice/editor/math.css` (KaTeX fonts + base, a thin
    `@import "katex/dist/katex.min.css"` shim — Node's package
    `exports` validator forbids targets that traverse into
    `node_modules`) and `@lattice/editor/math-wrapper.css` (Lattice
    token-driven container, centers block math + vertical rhythm via
    `var(--space-4)` from `@lattice/ui/tokens.css`). Downstream apps
    load both:

    ```ts
    import "@lattice/editor/math.css";
    import "@lattice/editor/math-wrapper.css";
    ```

    Splitting keeps the heavy KaTeX stylesheet opt-in for headless
    consumers (Markdown round-trip + NoteDoc converter tests) and keeps
    KaTeX out of [`Editor.css`](packages/editor/src/tiptap/Editor.css),
    which the in-flight CodeMirror PR ([#55](https://github.com/goldr0g3r/lattice/pull/55))
    edits in parallel (D6 / D7).
  - **SSR / jsdom safety**: `renderToString` is pure (no DOM access) so
    the import graph stays side-effect free. TipTap only spins up
    `addNodeView()` inside a live `EditorView`, which the conversion
    corpus test never instantiates — so the `node` env vitest run for
    `conversion.test.ts` and the markdown round-trip suite continue to
    pass without any KaTeX involvement (D5).
  - **Design decisions** are locked inline at the top of
    [`components/MathInline.tsx`](packages/editor/src/tiptap/components/MathInline.tsx):
    D1 library, D2 node-view shape, D3 error UX, D4 round-trip
    preservation, D5 SSR / jsdom guarantee, D6 design tokens, D7 CSS
    two-file split, D8 Mermaid + Excalidraw deferral.
  - **Tests**: 4 new vitest cases in
    [`__tests__/math-rendering.test.tsx`](packages/editor/src/tiptap/__tests__/math-rendering.test.tsx)
    mount the editor under jsdom and assert: inline math wrapper carries
    `.katex`, block math wrapper carries `.katex-display` + `.katex`,
    malformed LaTeX renders a `.katex-error` span, and the two new
    components are wired into the barrel. Existing **13-fixture
    NoteDoc <-> PM conversion corpus** and **26-fixture Markdown
    round-trip corpus** continue to pass with **zero fixture edits**;
    Rust `markdown_roundtrip` test still byte-identical for the
    `math-inline-block.md` fixture. Package total: **64/64 passing**
    (was 60/60).
  - **Deferred** (D8) — explicitly NOT in this PR, queue behind the
    CodeMirror node-view pattern landing in
    [PR #55](https://github.com/goldr0g3r/lattice/pull/55):
    - **Mermaid fenced renderer** — `mermaid.render()` inside a
      `Fenced` info-string-driven branch will reuse the CodeMirror
      node-view shape so all three embeds (math / mermaid /
      excalidraw) share one pattern.
    - **Excalidraw embeds** — `.excalidraw.json` sidecar + PNG
      snapshot per [ADR-0017](docs/decisions/0017-excalidraw-embed-storage-format.md);
      depends on the same node-view pattern and on a vault-attachment
      pipeline (out of v0.2 scope until PR #6 lands).
    - **Inline math editor UX** — double-click the rendered KaTeX to
      drop into a popover that edits `attrs.src`, with live-preview
      KaTeX render on each keystroke.
- **v0.2 PR #3 — CodeMirror 6 in fenced code blocks**
  (branch `feat/codemirror-code-blocks`, closes
  issue [#34](https://github.com/goldr0g3r/lattice/issues/34)). Swaps the
  read-only `Fenced` atom node shipped in
  [PR #54](https://github.com/goldr0g3r/lattice/pull/54) for a TipTap
  node-view that hosts a real CodeMirror 6 editor inside every
  ``` ```info ``` ` block:
  - **Language registry**
    ([`packages/editor/src/tiptap/codemirror/languages.ts`](packages/editor/src/tiptap/codemirror/languages.ts)):
    22 preloaded entries via eager imports (javascript / typescript / jsx /
    tsx, python, rust, go, java, cpp + c, json, yaml, markdown, html, css,
    sql, xml, php, shell — which covers `bash` / `sh` / `zsh` — plus
    dockerfile / lua / toml). 21 long-tail entries (ruby, perl, swift,
    haskell, scala, kotlin, csharp, dart, objective-c, r, powershell,
    julia, scheme, clojure, erlang, elm, groovy, diff, nginx, vb,
    fortran) are lazy-loaded via dynamic `import()`. Common Markdown
    aliases (`js`, `ts`, `py`, `rs`, `yml`, `md`, `bash`, `c++`, `c#`, …)
    resolve to their canonical entries.
  - **Token-driven theme**
    ([`packages/editor/src/tiptap/codemirror/theme.ts`](packages/editor/src/tiptap/codemirror/theme.ts)):
    `EditorView.theme(...)` reads `--bg-elevated`, `--text-primary`,
    `--accent-primary`, `--border`, `--font-mono` etc. from
    [`packages/ui/src/tokens.css`](packages/ui/src/tokens.css). No
    hard-coded colours; the editor follows the rest of the app through
    the same light / dark token swap (ADR-0010).
  - **TipTap node-view**
    ([`packages/editor/src/tiptap/codemirror/node-view.ts`](packages/editor/src/tiptap/codemirror/node-view.ts)):
    `<pre data-fenced>` wrapper with a language-picker `<select>` header
    and a CM6 `EditorView` host. Body sync uses CM6's `updateListener`
    to push changes into the TipTap node via
    `tr.setNodeAttribute(getPos(), "body", body)`; info-string sync
    follows the same path on `<select>` change and reconfigures the
    language `Compartment`. ArrowUp on the first line / ArrowDown on the
    last line escape into the surrounding TipTap document; `Mod-A`
    selects the CM6 buffer only; `Backspace` on an empty doc deletes
    the whole fenced node. Search / multi-cursor / indent-with-tab /
    bracket matching / autocomplete / fold gutter all ship from the
    standard CM6 extensions.
  - **Fenced refactor**
    ([`packages/editor/src/tiptap/extensions/fenced.ts`](packages/editor/src/tiptap/extensions/fenced.ts)):
    wires `addNodeView()` to the new renderer. `attrs: { info, body }`
    is **unchanged** so the NoteDoc <-> ProseMirror converter pair in
    `from-doc.ts` / `to-doc.ts` and its 13-fixture corpus stay green
    with zero edits (D6 — round-trip contract preserved).
  - **Editor styles** ([`packages/editor/src/tiptap/Editor.css`](packages/editor/src/tiptap/Editor.css)):
    `pre[data-fenced].lattice-cm-fenced` chrome — header, dropdown,
    rounded border, full-width host — all consuming design tokens. The
    legacy `<pre><code>` fallback (used during SSR + clipboard) keeps a
    matching look.
  - **Design decisions** are locked inline at the top of
    [`languages.ts`](packages/editor/src/tiptap/codemirror/languages.ts):
    D1 registry shape, D2 node-view shape, D3 body sync, D4 info sync,
    D5 keyboard escape, D6 round-trip preservation, D7 design-token
    theme, D8 SSR / jsdom safety.
  - **Tests**: 22 new vitest cases (`languages.test.ts` × 11, including
    the ≥20-preloaded-entries acceptance gate + lazy-load smoke; plus
    `node-view.test.tsx` × 3, mounting the editor under jsdom and
    asserting the CM6 `.cm-editor` is present, the dropdown lists every
    preloaded entry, and dropdown changes flip `attrs.info`). Existing
    13-fixture NoteDoc<->PM conversion corpus and 26-fixture Markdown
    round-trip corpus continue to pass with zero edits, bringing the
    package total to **60/60 passing**.
- **v0.2 PR #2 — TipTap block editor + slash command menu**
  (branch `feat/tiptap-editor`, closes
  issue [#33](https://github.com/goldr0g3r/lattice/issues/33)). Builds the
  React editor surface on top of the `NoteDoc` AST shipped in PR #1:
  - **Schema** ([`packages/editor/src/tiptap/schema.ts`](packages/editor/src/tiptap/schema.ts)):
    StarterKit (paragraph, headings, lists, blockquote, hr, hard-break,
    marks) + GFM tables + GFM task lists + 11 Lattice-specific extensions
    ([`callout`](packages/editor/src/tiptap/extensions/callout.ts),
    [`fenced`](packages/editor/src/tiptap/extensions/fenced.ts),
    [`blockMath` / `inlineMath`](packages/editor/src/tiptap/extensions/math.ts),
    [`wikiLink`](packages/editor/src/tiptap/extensions/wiki-link.ts),
    [`image`](packages/editor/src/tiptap/extensions/image.ts),
    [`footnoteRef` / `footnoteDefinition`](packages/editor/src/tiptap/extensions/footnote.ts),
    [`htmlBlock` / `htmlInline`](packages/editor/src/tiptap/extensions/html-block.ts)).
    Every `NoteDoc` `Block` / `Inline` variant maps to exactly one TipTap
    node or mark, enforced by `LATTICE_NODE_NAMES`.
  - **Converters** ([`from-doc.ts`](packages/editor/src/tiptap/from-doc.ts) /
    [`to-doc.ts`](packages/editor/src/tiptap/to-doc.ts)): lossless pure
    functions between `NoteDoc` and ProseMirror JSON. The conversion
    corpus test in
    [`__tests__/conversion.test.ts`](packages/editor/src/tiptap/__tests__/conversion.test.ts)
    runs all 13 fixtures from `tests/markdown-roundtrip/` through the
    pair and asserts deep equality — composed with the v0.2 PR #1
    serializer this gives `disk → editor → disk` byte-identical
    round-trip.
  - **Slash command menu**
    ([`extensions/slash-commands.ts`](packages/editor/src/tiptap/extensions/slash-commands.ts) +
    [`components/SlashMenu.tsx`](packages/editor/src/tiptap/components/SlashMenu.tsx) +
    [`slash-items.ts`](packages/editor/src/tiptap/slash-items.ts)):
    `/` opens a `tippy.js`-anchored React popup with fuzzy-filtered
    insert commands (paragraph, H1-H3, bullet / ordered / task list,
    blockquote, callout × 5 kinds, code block, math block, 3×3 table,
    divider), keyboard-only navigation (↑/↓/⏎/Esc), and `lucide-react`
    icons.
  - **`Editor` React component**
    ([`Editor.tsx`](packages/editor/src/tiptap/Editor.tsx) +
    [`Editor.css`](packages/editor/src/tiptap/Editor.css)): wraps
    `@tiptap/react`'s `useEditor`, takes `initialDoc: NoteDoc`, emits
    `onChange(doc: NoteDoc)`. Styles consume design tokens from
    `@lattice/ui/tokens.css` only (no hard-coded colours).
  - **Desktop shell** wires `<Editor>` into
    [`apps/desktop/src/App.tsx`](apps/desktop/src/App.tsx) as the main
    surface once a vault is open (in-memory demo document; vault file
    IO ships in a follow-up PR).
  - **Tests**: 46 vitest cases across 4 files (existing 26 markdown
    round-trip + 13 NoteDoc<->PM conversion + 5 SlashMenu keyboard +
    2 Editor mount); jsdom environment auto-selected for `*.test.tsx`
    via [`packages/editor/vitest.config.ts`](packages/editor/vitest.config.ts).
- **v0.2 PR #1 — Markdown round-trip + golden corpus**
  ([`feat/markdown-roundtrip`](https://github.com/goldr0g3r/lattice/pull/53),
  issue [#35](https://github.com/goldr0g3r/lattice/issues/35)). Lands the
  on-disk format contract for the v0.2 editor per
  [ADR-0015](docs/decisions/0015-markdown-flavor-and-serialization.md):
  - **Rust core** (`core/lattice-core/src/markdown/`): `NoteDoc` AST
    (`doc.rs`, `Block` / `Inline` / `ListItem` / `Row` /
    `Frontmatter{,Entry}` / `Alignment` / `CalloutKind` — all `ts-rs`-exported
    to `packages/core-bindings/src/generated/`), `frontmatter.rs` (YAML head
    with `serde_yaml_ng`, order preserved via `FrontmatterEntry` vector),
    `parser.rs` (`pulldown-cmark` walker + post-walk passes for wiki-links,
    inline math, callouts), `serializer.rs` (hand-rolled canonical-form
    emitter — no third-party formatter, so we control whitespace
    byte-for-byte). New deps: `pulldown-cmark`, `serde_yaml_ng`,
    `pretty_assertions` (dev).
  - **TypeScript mirror** (`packages/editor/`): new `@lattice/editor`
    package re-exports `parse` / `serialize` over the same `NoteDoc` types
    from `@lattice/core-bindings`. Built on `mdast-util-from-markdown` +
    `mdast-util-gfm` / `-math` / `-frontmatter` and `yaml`; the serializer
    is a hand-rolled mirror of the Rust emitter.
  - **Golden corpus** (`tests/markdown-roundtrip/`): 13 fixture pairs
    (`simple`, `headings`, `lists-nested`, `tables-with-pipes-in-code`,
    `footnotes`, `frontmatter-edges`, `hard-line-breaks`, `wiki-links`,
    `callouts`, `math-inline-block`, `mermaid-fence`, `excalidraw-fence`,
    `html-snippet`) with committed `<name>.expected.json` snapshots emitted
    by the new `dump_ast` example binary
    (`core/lattice-core/examples/dump_ast.rs`).
  - **Parity gates**: `core/lattice-core/tests/markdown_roundtrip.rs`
    asserts `serialize(parse(x)) == x` byte-identical for every fixture and
    that each committed `expected.json` still matches what the parser
    emits; `packages/editor/src/markdown/__tests__/roundtrip.test.ts`
    runs the same loop in Vitest against the same fixtures + JSON
    snapshots, so TS and Rust must agree. CI gains a Linux-only step
    in the `rust` job that regenerates every `expected.json` via
    `dump_ast` and diffs against the committed copy so AST drift surfaces
    as its own signal.
- **v0.2 kick-off prep** — wrap-up sub-plan executed (see
  `~/.cursor/plans/v0.1-wrapup-v0.2-kickoff_82bcf2ad.plan.md`):
  v0.1 task issues `#21-#32` + epic `#11` closed with reconciliation comments;
  initial criterion baselines committed under
  [`core/lattice-core/benches/baselines/`](core/lattice-core/benches/baselines/)
  (`vault_open` 100/1k notes, `save_index/single_note_insert`,
  `watcher_latency/create_to_event_ms`); five queued dependabot PRs
  (`#6`, `#7`, `#8`, `#9`, `#10`) rebased onto post-v0.1 main and merged;
  CI workflow hotfix [PR #49](https://github.com/goldr0g3r/lattice/pull/49)
  dropped the `pnpm/action-setup version: 10` override (conflicted with
  `packageManager: pnpm@10.16.1`) and installed GTK/WebKit prereqs in the
  `rust` Linux job (`cargo clippy --workspace` now drags
  `lattice-desktop`'s glib chain). [`.prettierignore`](.prettierignore)
  excludes the baselines folder so the format check stays green.
- Workspace rule [`.cursor/rules/github-workflow.mdc`](.cursor/rules/github-workflow.mdc)
  reinforces `gh` CLI + Conventional Commits + squash-merge for v0.2+.

## [0.1.0] - 2026-05-14

> Foundation release. Tagged from `main` commit `d51ad77` (perf baselines)
> after the v0.1 scaffolding (`0538bff`, `d6fef68`) and the CI hotfix (`0c74662`).
>
> Implementation note: the 12 v0.1 PRs called out in the v0.1 sub-plan were
> shipped as two squash commits (`0538bff` + `d6fef68`) pushed direct to
> `main` rather than as 12 separate PRs. The 12 v0.1 task issues
> (`#21-#32`) are closed with reconciliation comments linking back to the
> shipping commit. v0.2 work returns to the documented one-PR-per-task
> workflow per [`.cursor/rules/github-workflow.mdc`](.cursor/rules/github-workflow.mdc).

### Added

- **v0.1 hand-off → v0.2** — `.github/issues/v0.3-tasks.yml` pre-cut and
  pushed to the live tracker (issues #40–#47 under
  [Epic v0.3](.github/issues/epics.yml)) so v0.2 contributors can see the
  road ahead. `bootstrap-issues.mjs` updated to include the new YAML.
- **v0.1 PR #11** — CI baseline tightened: dropped the conditional
  `Detect frontend` / `Detect Cargo workspace` guards in
  [.github/workflows/ci.yml](.github/workflows/ci.yml) (the monorepo now
  always exists, so a missing config is a hard error). Updated
  `.github/scripts/bootstrap-repo.mjs` to add the full required-check list
  to branch protection on `main`: `ci / meta`, `ci / frontend (ubuntu-latest)`,
  `ci / frontend (windows-latest)`, `ci / rust (ubuntu-latest)`,
  `ci / rust (windows-latest)`, `ci / desktop-build (ubuntu-latest)`,
  `ci / desktop-build (windows-latest)`, and `commitlint`. Branch protection
  re-applied via `bootstrap-repo.mjs --apply-protection`.
- **v0.1 PR #10** — Criterion bench harness for the v0.1 perf budgets:
  three benches under `core/lattice-core/benches/` —
  `vault_open` (100 / 1 000 / opt-in 10 000-note tiers via
  `LATTICE_BENCH_LARGE=1`), `save_index` (~94 µs per row vs the 50 ms
  p99 budget), `watcher_latency` (50 ms debounce floor) — plus
  `benches/README.md` documenting baseline workflow and the new
  `.github/workflows/bench.yml` that runs the PR-time sweep on every
  push/PR and the full sweep nightly. Bench gate is initially advisory
  (`continue-on-error: true`); becomes load-bearing once
  `target/criterion/.../baselines/main.json` is committed under
  `core/lattice-core/benches/baselines/`.
- **v0.1 ADR-0013** — Vault-conflict resolution UX: v0.1 = disk is
  authoritative (silent re-read); v0.2 = three-option Dialog
  ("Keep mine" / "Take theirs" / "Show diff & merge"); post-v0.5 CRDT
  files get automatic merges.
- **v0.1 PR #9** — Initial visual identity per
  [ADR-0011](docs/decisions/0011-font-loading-strategy.md): Latin-subset
  variable-weight `@fontsource-variable/{newsreader,inter,jetbrains-mono}`
  loaded via `packages/ui/src/fonts.ts`, `Wordmark` React primitive that
  renders the Lattice wordmark in Newsreader inheriting `currentColor`,
  pre-React splash baked into [`apps/desktop/index.html`](apps/desktop/index.html)
  (visible <800 ms before main paint, removed in `main.tsx` after mount),
  raster fallback `wordmark.svg` + branded `icon-mark.svg` ("L" with two
  lattice crossbars in `--accent-primary` on `--bg-canvas`) under
  `packages/ui/src/assets/`. App shell now uses the `Wordmark` primitive
  instead of plain text. Vite build adds ~270 KB of self-hosted woff2
  files (Latin only).
- **v0.1 ADR-0011** — Font-loading strategy: Latin-subset variable fonts
  with `font-display: swap` and a system fallback chain; build-time
  subsetting deferred to v1.0 perf hardening.
- **v0.1 PR #8** — Structured logging + opt-in telemetry per
  [ADR-0012](docs/decisions/0012-telemetry-event-schema-versioning.md):
  `lattice_core::logging::init(vault_root)` configures a `tracing-subscriber`
  with stderr layer + (when a vault is open) a daily-rotating
  `tracing-appender` writer to `<vault>/.lattice/logs/lattice.log`. Reads
  `LATTICE_LOG` or `RUST_LOG` for level. `lattice_core::TelemetryClient` ships
  the on-disk half of the contract: events serialise to JSONL at
  `<vault>/.lattice/logs/telemetry.jsonl` only when enabled (HTTP shipment is
  a follow-up); `TelemetrySettings { enabled, endpoint }` persisted in
  `UserConfig.telemetry`. Two new Tauri commands
  (`telemetry_settings_get` / `telemetry_settings_set`) and a
  `SettingsTelemetry` React surface with checkbox + endpoint input. Tauri
  shell now calls `lattice_core::logging::init(None)` on boot. New
  [docs/telemetry.md](docs/telemetry.md) documents the wire shape, privacy
  stance, and v0.1 event registry.
- **v0.1 ADR-0012** — Telemetry event schema and versioning: additive-only
  fields, per-event `schema_minor`, no vault content shipped.
- **v0.1 PR #7** — Reactive file watcher per
  [ADR-0014](docs/decisions/0014-file-watcher-debounce.md):
  `lattice_core::watcher::Watcher` wraps `notify-debouncer-full` with per-OS
  debounce defaults (Linux 250 / Windows 100 / macOS 200 ms),
  `lattice_core::IndexEvent` (kind: `created` / `modified` / `removed` /
  `renamed` / `other`) ts-rs exported, three integration tests under
  `core/lattice-core/tests/watcher_integration.rs` covering create / modify /
  remove. Tauri shell extends `VaultState` with a `Watcher` slot; opening a
  vault spawns a watcher that re-emits each event to the renderer as
  `vault://index`; closing or switching the vault cleanly drops the watcher.
- **v0.1 ADR-0014** — File-watcher debounce window: per-OS defaults,
  overridable via the user setting `watcher.debounce_ms`.
- **v0.1 PR #6** — `Vault` open / create / switch / close:
  `lattice_core::Vault` owns the SQLite pool and the `.lattice/` subtree
  (`attachments/`, `logs/`, `tantivy/`, `history/`), with `VaultInfo` snapshot
  surfaced through ts-rs; `lattice_core::config::{read,write,set_last_vault,
  clear_last_vault}` persists the last-opened-vault pointer at the
  OS-appropriate config dir (refactored to `read_at`/`write_at` so tests
  don't need to mutate process env). Tauri shell adds managed `VaultState`
  and `vault_open` / `vault_create` / `vault_switch` / `vault_close` /
  `vault_current` / `vault_last_opened` commands. `LatticeError` now derives
  `ts_rs::TS` so the renderer can type-narrow on `kind`. App.tsx chains
  folder picker → `vault_open`, auto-reopens the last vault on launch, and
  renders the `VaultInfo` panel. Six integration tests under
  `core/lattice-core/tests/vault_lifecycle.rs` cover happy path + the
  failure modes called out in
  [.github/issues/v0.1-tasks.yml](.github/issues/v0.1-tasks.yml).
- **v0.1 PR #3** — Tauri 2 desktop shell per
  [ADR-0001](docs/decisions/0001-tauri-2-cross-platform-shell.md):
  `apps/desktop/src-tauri/` workspace member (`tauri.conf.json` with locked CSP +
  centered 1280×800 window, `build.rs`, `capabilities/default.json`,
  `main.rs` + `lib.rs::run()` with Tauri 2 `Emitter`/`Listener` traits,
  `commands/vault.rs` (`open_vault_dialog` folder picker via
  `tauri-plugin-dialog`), `commands/system.rs` (`core_version`,
  `cold_start_ms` placeholder)), placeholder PNG + ICO icons under
  `apps/desktop/src-tauri/icons/`, JS-side `@tauri-apps/api` +
  `@tauri-apps/plugin-dialog` + `@tauri-apps/cli` deps, `App.tsx` rewired
  to invoke `open_vault_dialog`, toggle `data-theme` persisted to
  localStorage, emit `renderer://ready` on mount, and surface a cold-start
  ms readout. New `desktop-build` CI matrix job (ubuntu-latest +
  windows-latest) installs Linux Tauri prerequisites and runs
  `pnpm --filter @lattice/desktop tauri build --debug --no-bundle`. Frontend
  CI bumped to pnpm 10 and now also runs `pnpm format` + `pnpm tokens:check`;
  rust CI fails if `packages/core-bindings/src/generated/` drifts.
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
