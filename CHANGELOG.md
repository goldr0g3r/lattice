# Changelog

All notable changes to **Lattice** will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **v0.2 — Mermaid + Excalidraw fenced embeds**
  (branch `feat/mermaid-excalidraw-embeds`, closes
  issue [#37](https://github.com/goldr0g3r/lattice/issues/37) alongside the
  already-shipped KaTeX slice in
  [PR #56](https://github.com/goldr0g3r/lattice/pull/56)). Ships the
  Mermaid + Excalidraw rendering slices of the "engineer killers" embed
  trio on top of the CodeMirror 6 node-view pattern that landed in
  [PR #55](https://github.com/goldr0g3r/lattice/pull/55), per
  [ADR-0015](docs/decisions/0015-markdown-flavor-and-serialization.md) +
  [ADR-0017](docs/decisions/0017-excalidraw-embed-storage.md):
  - **New embeds directory** (`packages/editor/src/tiptap/embeds/`): one
    React node-view per embed kind plus a single dispatcher
    ([`node-view-dispatcher.ts`](packages/editor/src/tiptap/embeds/node-view-dispatcher.ts))
    that the `fenced` extension wires into `addNodeView()`. The
    dispatcher routes each `fenced` node per-instance based on
    `node.attrs.info`:
    - `info ∈ {"mermaid"}` →
      [`MermaidEmbed`](packages/editor/src/tiptap/embeds/mermaid.tsx) —
      lazy-loads `mermaid` ^11 in a `useEffect`, calls
      `mermaid.render(id, src)` with `securityLevel: "strict"`, and
      injects the returned SVG via `dangerouslySetInnerHTML`. The
      `theme` option tracks `document.documentElement.dataset.theme`
      so the diagram flips with the editor's light / dark mode.
    - `info ∈ {"excalidraw"}` →
      [`ExcalidrawEmbed`](packages/editor/src/tiptap/embeds/excalidraw.tsx)
      — read-only placeholder card surfacing the `.excalidraw.json`
      sidecar path stored in the block body (per ADR-0017). The
      `@excalidraw/excalidraw` ^0.18 dep is wired into
      `packages/editor/package.json` in this PR so the follow-up doesn't
      pay the lockfile-bump cost. Read-only canvas mounting lands once
      the desktop shell exposes `vault_read_file` IPC (see Follow-up
      below).
    - anything else (`""`, `"typescript"`, `"rust"`, …) → falls through
      to the CodeMirror 6 node-view shipped in PR #55, **bit-identical**.
      The language picker, escape-keymap, and `attrs.body` update
      plumbing are untouched.
  - **Smallest possible `fenced` edit**
    ([extensions/fenced.ts](packages/editor/src/tiptap/extensions/fenced.ts)):
    swapped one import + one `addNodeView()` body. `addAttributes`,
    `parseHTML`, and `renderHTML` are **unchanged** — the
    NoteDoc <-> ProseMirror converter pair, the 13-fixture conversion
    corpus
    ([`__tests__/conversion.test.ts`](packages/editor/src/tiptap/__tests__/conversion.test.ts)),
    and the 26-fixture Markdown round-trip corpus
    ([`src/markdown/__tests__/roundtrip.test.ts`](packages/editor/src/markdown/__tests__/roundtrip.test.ts))
    stay green with **zero fixture edits** (D4). The
    `mermaid-fence.md` and `excalidraw-fence.md` fixtures round-trip
    byte-identical.
  - **Tests**
    ([`__tests__/embeds.test.tsx`](packages/editor/src/tiptap/__tests__/embeds.test.tsx),
    jsdom): 5 new vitest cases — Mermaid wrapper mounts with
    `[data-mermaid]`, Excalidraw wrapper mounts with `[data-excalidraw]`
    + the sidecar path is exposed, the CodeMirror fallback still
    produces `.cm-editor` + the language picker for non-embed
    info-strings, malformed Mermaid surfaces a `[data-mermaid-error]`
    branch carrying the parser message and raw source (D5), and the
    `isMermaidInfo` / `isExcalidrawInfo` predicates exported from the
    dispatcher are case- and whitespace-insensitive.
  - **Design decisions D1–D8** all locked inline at the top of
    [`embeds/node-view-dispatcher.ts`](packages/editor/src/tiptap/embeds/node-view-dispatcher.ts):
    D1 dispatch shape (one factory, three targets, info-string routing),
    D2 Mermaid library + lazy-load, D3 Excalidraw read-only + path-only
    body, D4 round-trip preserved, D5 Mermaid error UX, D6 design tokens
    via inline CSS variables (Editor.css untouched — owned by the
    parallel `feat/desktop-shell-redesign` workstream), D7 SSR / jsdom
    safety (the conversion corpus test never pulls either lib in),
    D8 lazy-load bundle weight.
  - **Cold-start bundle cost (D8)**: both libraries are lazy-loaded
    via dynamic `import()` and never appear in the editor entry chunk.
    `mermaid` ^11 ≈ +1 MB minified pre-tree-shake (loads on the first
    Mermaid block mount in a session); `@excalidraw/excalidraw` ^0.18
    ≈ +280 KB minified core + ~600 KB of font/icon assets that ship
    on demand once the v0.2 follow-up canvas is wired. Editor cold-start
    is unchanged for users who never open a Mermaid or Excalidraw block.

  **Follow-up** (NOT in this PR; queued behind issue #37):

  - **Excalidraw sidecar load + read-only canvas** — once the desktop
    shell exposes a `vault_read_file` IPC command (currently in flight
    on the parallel `feat/desktop-shell-redesign` branch),
    `ExcalidrawEmbed` should add a `useEffect` that resolves `body`
    against the current vault root, loads the sibling
    `.excalidraw.json`, and mounts a lazy-loaded `<Excalidraw>` with
    `viewModeEnabled` + `zenModeEnabled` + the parsed scene as
    `initialData`. The `TODO` comment at the top of
    [`embeds/excalidraw.tsx`](packages/editor/src/tiptap/embeds/excalidraw.tsx)
    spells out the exact wiring.
  - **Editable Excalidraw + inline Mermaid editor UX** — out-of-scope
    for v0.2; tracked alongside the v0.7 typed-block work and the
    v0.9 canvas feature.
- **v0.2 PR #6 — ⌘K / Ctrl+K command palette**
  (branch `feat/command-palette`, closes
  issue [#38](https://github.com/goldr0g3r/lattice/issues/38)). Mounts a
  keyboard-first power-user surface over the v0.2 PR #3.5 workspace
  shell: pressing `⌘K` (macOS) or `Ctrl+K` (Windows / Linux) opens a
  fuzzy-searchable [`shadcn command`](packages/ui/src/components/command.tsx)
  palette (`cmdk` under the hood) listing every registered app command,
  grouped by area, with optional keyboard-shortcut hints. Selecting a
  row fires the command and closes the palette.
  - **Typed registry + context**
    ([`apps/desktop/src/commands/registry.ts`](apps/desktop/src/commands/registry.ts)):
    `AppCommand { id, label, keywords?, group?, shortcut?, icon?, run }`
    plus a `CommandContext` exposing the small handful of operations a
    `run` handler is allowed to perform without coupling to Tauri or
    React state (`openVault`, `switchVault`, `closeVault`, `openNote`,
    `createNote`, `toggleTheme`, `setTheme`, `openSearch`,
    `openSettings`, `togglePalette`, `toast`). `registerCommand(cmd)`
    pushes into a module-local array and returns an `unregister` thunk;
    `getCommands()` returns a fresh shallow copy. The shape mirrors
    [PR #54](https://github.com/goldr0g3r/lattice/pull/54)'s
    `SlashItem` registry so plugin authors only learn one pattern.
  - **v0.2 built-in commands** (`builtInCommands(ctx)` in
    `registry.ts`): Open vault…, Switch vault…, Close vault, Create
    new note (`⌘N`), Search notes (stub — toasts "Search ships in
    v0.3"), Toggle theme (label flips with `ctx.theme`), Open
    settings (stub — toasts "Settings UI lands in v0.3"), Toggle
    command palette itself (`⌘K`). Plus dynamic "Open note: <title>"
    entries — top 20 by `modified_ms`, generated in
    [`commands/note-commands.ts`](apps/desktop/src/commands/note-commands.ts).
  - **Palette component**
    ([`apps/desktop/src/components/CommandPalette.tsx`](apps/desktop/src/components/CommandPalette.tsx)):
    pure-presentational wrapper over `CommandDialog` /
    `CommandInput` / `CommandList` / `CommandGroup` / `CommandItem` /
    `CommandShortcut` / `CommandEmpty` / `CommandSeparator` from
    `@lattice/ui`. Groups commands by `group` in a stable display
    order (Vault → Notes → Editor → View → Help → Other), composes
    each item's `value=` from `label + keywords` so cmdk's built-in
    fuzzy matcher handles filtering with zero custom scoring code,
    closes the dialog before invoking `cmd.run(ctx)` via
    `queueMicrotask` so a re-opening command (`view.palette`) sees
    the dialog as closed first.
  - **Shell wiring**
    ([`apps/desktop/src/shell/WorkspaceShell.tsx`](apps/desktop/src/shell/WorkspaceShell.tsx)):
    local `paletteOpen` state, a single global `keydown` listener
    bound once at mount that detects `Mod+K` via `navigator.platform`
    (Cmd on macOS, Ctrl elsewhere) and toggles the palette,
    memoised `CommandContext` + `commands` arrays so cmdk doesn't see
    a new identity per keystroke, and a small unobtrusive `⌘K`
    button in the editor-pane top bar that opens the palette
    visually. `App.tsx` now passes `theme` / `onToggleTheme` /
    `onSetTheme` so the palette's theme command flips the app's
    real theme, and mounts a `<Toaster />` from `@lattice/ui` so
    `ctx.toast(...)` lights up the sonner-backed surface.
  - **A11y primitive added**
    ([`packages/ui/src/components/command.tsx`](packages/ui/src/components/command.tsx)):
    `CommandDialog` now embeds a visually-hidden `DialogTitle` +
    `DialogDescription` (defaults: "Command palette" / "Type a
    command or search the command palette."), opt-out via
    `description={null}`. Radix's `DialogContent` was warning loudly
    in tests without these — the wrapper now satisfies WAI-ARIA's
    dialog labelling requirement for every consumer.
  - **Locked design decisions** (D1..D8 doc-commented inline at the
    top of [`registry.ts`](apps/desktop/src/commands/registry.ts)):
    D1 primitive (shadcn `CommandDialog` + cmdk), D2 keybind
    (single global `keydown`, `Mod+K` via `navigator.platform`,
    `preventDefault()` to suppress the browser's location-bar
    shortcut), D3 registry shape, D4 built-in lock-set, D5 plugin
    extensibility (the v0.9 SDK calls `registerCommand`), D6 fuzzy
    match (cmdk built-in, no custom scoring), D7 fire-and-forget
    `run` (handlers own their error UX via `ctx.toast`), D8 keyboard
    escape from the editor (`Mod+K` doesn't conflict with TipTap or
    CodeMirror defaults — covered by an integration test that
    simulates `Ctrl+K` keydown).
  - **Tests** (10 new vitest cases in
    [`apps/desktop/src/components/__tests__/CommandPalette.test.tsx`](apps/desktop/src/components/__tests__/CommandPalette.test.tsx)):
    4 direct-mount cases (closed → no dialog, open → grouped
    commands render, cmdk fuzzy-filter on label + keywords, Enter
    fires `run()` + `onOpenChange(false)`, empty-state copy),
    3 `builtInCommands` contract cases (stable id order, theme
    label flips with `ctx.theme`, search stub toasts), and 2
    `WorkspaceShell` integration cases (mocked `note_list` +
    `note_read`, simulated `Ctrl+K` keydown opens the palette and
    renders the lock-set + a dynamic "Open note: Alpha" entry; a
    second `Ctrl+K` press toggles it closed). Existing tests stay
    green: 6 `Sidebar` + 7 `NoteList` + 2 `WorkspaceShell` (the
    latter two updated to thread the new theme props), 26
    Markdown round-trip, 13 NoteDoc<->PM conversion, 5 slash menu,
    2 editor mount, 4 KaTeX math, 7 Rust `notes_io`.
  - **Test harness shims**
    ([`apps/desktop/src/__tests__/setup.ts`](apps/desktop/src/__tests__/setup.ts)):
    no-op `ResizeObserver`, `hasPointerCapture`, `releasePointerCapture`,
    and `scrollIntoView` polyfills so cmdk + Radix Dialog mount
    cleanly under jsdom (which ships none of them). No production
    behaviour change.
  - **Deferred to v0.3** — explicitly NOT in this PR; the issue
    [#38](https://github.com/goldr0g3r/lattice/issues/38)
    acceptance row stays open for these and the PR comment will
    cross-link the v0.3 follow-up.
    - **Insert wiki-link** — needs an active TipTap `Editor`
      reference and the open editor's view/state object.
      `CommandContext` deliberately does not couple to the editor
      surface (which would invert the dependency: the shell owns
      the editor, not vice versa). v0.3 will add an "active editor
      bus" the palette can subscribe to, then ship the
      insert-wiki-link command on top of the wiki-link extension
      shipped in [PR #57](https://github.com/goldr0g3r/lattice/pull/57).
    - **Run search** — the palette entry exists as a stub that
      focuses the rail's search box + toasts "Search ships in v0.3".
      Full-text search itself lands in v0.3 #43; the palette will
      grow a richer "Search notes" entry that opens the search
      modal at that point.
    - **Open settings** — same treatment; surfaced as a stub toast
      until the v0.3 settings page lands.
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
- **v0.2 PR #3.5 — desktop shell redesign (3-column workspace + note IO)**
  (branch `feat/desktop-shell-redesign`, advances issues
  [#34](https://github.com/goldr0g3r/lattice/issues/34) /
  [#36](https://github.com/goldr0g3r/lattice/issues/36) /
  [#38](https://github.com/goldr0g3r/lattice/issues/38)). Replaces the
  single-column "open vault → mount editor" surface from v0.2 PR #2 with a
  persistent Notion / Bear-style 3-column workspace, and lands the first
  end-to-end Markdown read / write / create commands so the editor is
  finally backed by real files.
  - **Rust core** ([`core/lattice-core/src/notes.rs`](core/lattice-core/src/notes.rs)):
    new `notes` module owning `list` (walks the vault root depth-first,
    skips `.lattice/` + dot-dirs), `read` (returns `NoteContent { summary,
    raw, doc }` — both raw bytes + parsed AST so the renderer can flag
    pathological files), `write` (atomic `tmp + rename` via the canonical
    v0.2 PR #1 serializer, byte-identical round-trip), and `create_blank`
    (slugged title → first non-colliding `<slug>.md`, minimal `# Title`
    seed body). Two new ts-rs types — `NoteSummary { id, path, title,
    modified_ms, size_bytes }` and `NoteContent { summary, raw, doc }` —
    exported into [`packages/core-bindings/src/generated/`](packages/core-bindings/src/generated/).
    Path resolver rejects parent-directory traversal + absolute paths so
    the IPC command can't reach outside the open vault.
  - **Tauri IPC** ([`apps/desktop/src-tauri/src/commands/notes.rs`](apps/desktop/src-tauri/src/commands/notes.rs)):
    `note_list` / `note_read` / `note_write` / `note_create` thin
    pass-throughs to `lattice_core::notes`, registered in
    [`apps/desktop/src-tauri/src/lib.rs`](apps/desktop/src-tauri/src/lib.rs).
    `LatticeError` flows through unchanged so the renderer can type-narrow
    on `kind`.
  - **Shell components**
    ([`apps/desktop/src/shell/`](apps/desktop/src/shell/)): five
    self-contained components — `Sidebar` (240 px, wordmark + Home /
    Notes / Settings nav + `Local vault` footer with theme toggle),
    `NoteList` (280 px, `All Notes` header + count pill + search input +
    one row per `NoteSummary` + `+ New note` footer button), `EditorPane`
    (`1fr`, derived title + read-only tag chips from frontmatter + meta
    row showing word count / mtime / save status + the unchanged
    `<Editor>` body), `WorkspaceShell` (orchestrates the columns, owns
    `note_list` / `note_read` / `note_write` debounced 250 ms, listens on
    `vault://index` for external edits), and `EmptyVault` (pre-vault
    landing card, visually refreshed). Locked design decisions D1–D8 are
    doc-commented inline at the top of
    [`WorkspaceShell.tsx`](apps/desktop/src/shell/WorkspaceShell.tsx).
  - **Layout + tokens**
    ([`apps/desktop/src/shell.css`](apps/desktop/src/shell.css)): pure CSS
    grid `[240px] [280px] [1fr]`, no JS layout work, collapses the note
    list under 960 px. Four new role-based tokens
    ([`packages/ui/src/tokens.css`](packages/ui/src/tokens.css)) —
    `--sidebar-bg`, `--sidebar-fg`, `--sidebar-fg-muted`, `--notelist-bg`
    — covering light + dark + `prefers-color-scheme` variants, mirrored
    in the Tailwind preset
    ([`packages/config/tailwind-preset/index.cjs`](packages/config/tailwind-preset/index.cjs))
    so `scripts/check-token-parity.mjs` stays green. Every shell surface
    threads through tokens — zero hard-coded hex.
  - **App wiring**
    ([`apps/desktop/src/App.tsx`](apps/desktop/src/App.tsx)): trimmed from
    265 lines to ~130. Owns theme state + vault lifecycle
    (`open_vault_dialog` → `vault_open` → swap to `<WorkspaceShell>`;
    `vault_close` → swap back to `<EmptyVault>`); the shell owns
    everything note-related.
  - **Vitest harness for `apps/desktop`** — new
    [`apps/desktop/vitest.config.ts`](apps/desktop/vitest.config.ts)
    (jsdom for `*.test.tsx`, node for everything else) +
    [`src/__tests__/setup.ts`](apps/desktop/src/__tests__/setup.ts)
    (`@testing-library/jest-dom/vitest` matchers + `window.matchMedia`
    shim). New devDeps: `@testing-library/react@^16.1.0`,
    `@testing-library/jest-dom@^6.6.3`,
    `@testing-library/user-event@^14.5.2`, `jsdom@^25.0.1`. New runtime
    dep: `lucide-react@^0.469.0` for the nav icons (already in editor).
  - **Tests**: 17 new vitest cases — 5 in
    [`Sidebar.test.tsx`](apps/desktop/src/__tests__/Sidebar.test.tsx)
    (renders, active state via `aria-current="page"`, click contract,
    vault label, theme-toggle slot); 7 in
    [`NoteList.test.tsx`](apps/desktop/src/__tests__/NoteList.test.tsx)
    (renders rows, selected row carries `aria-current="true"`, `onSelect`
    fires with path, search filters by title substring, empty-search
    hint, new-note CTA, empty vault); 2 in
    [`WorkspaceShell.test.tsx`](apps/desktop/src/__tests__/WorkspaceShell.test.tsx)
    (mocks `note_list` + `note_read` via `vi.mock("@tauri-apps/api/core")`,
    asserts all three columns mount + the first note is auto-opened +
    clicking a row swaps the editor title). Plus 7 new Rust integration
    cases in [`core/lattice-core/src/notes.rs`](core/lattice-core/src/notes.rs)
    (`#[cfg(test)]`) and
    [`core/lattice-core/tests/notes_io.rs`](core/lattice-core/tests/notes_io.rs)
    (corpus-wide `read → write` byte-identical round-trip across every
    fixture in `tests/markdown-roundtrip/`).
  - **Out of scope** (tracked separately): tag editing UI (needs the v0.3
    tag index), splitter resize between columns, the reference's
    Calendar / Shared / Folder nav (D2 — surfacing nav for absent
    features is dishonest UX), the reference's "Upload Your File" modal
    (depends on attachments — issue #37), the reference's top format
    toolbar (already covered by the slash menu from PR #2 + KaTeX +
    CodeMirror surfaces from PRs #55 / #56).
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

### Changed

- **Repository cleanup — reverted three direct-to-main commits that bypassed the
  PR contract.** On 2026-05-16, three commits landed on `main` without going
  through the squash-merge + CI + branch-protection workflow documented in
  [`.cursor/rules/github-workflow.mdc`](.cursor/rules/github-workflow.mdc) and
  [ADR-0009](docs/decisions/0009-conventional-commits-trunk-based.md):
  `7b0ada1` (a `feat(ui)` commit whose actual diff was 31 net-new docs files,
  not styling), `2d12227` (a `feat(search)` slice for issue
  [#43](https://github.com/goldr0g3r/lattice/issues/43) including stray
  `.commit-msg.txt` / `.pr-body.md` scratch files), and merge commit `20bfbd9`
  that joined them onto `main`. `chore/repo-cleanup` reverts all three via
  `git revert -m 1 20bfbd9` followed by `git revert 2d12227`, restoring `main`
  to the tree of [`0ef5565`](https://github.com/goldr0g3r/lattice/commit/0ef5565)
  (the canonical PR #66). The legitimate work behind the reverted commits is
  preserved as annotated tags
  [`salvage/docs-content-7b0ada1`](https://github.com/goldr0g3r/lattice/releases/tag/salvage%2Fdocs-content-7b0ada1)
  and
  [`salvage/search-modal-2d12227`](https://github.com/goldr0g3r/lattice/releases/tag/salvage%2Fsearch-modal-2d12227)
  so it can be re-shipped through proper PRs (issue #43 is owned by the
  v0.3 milestone owner). Branch protection on `main` was re-applied via
  `node .github/scripts/bootstrap-repo.mjs --apply-protection` to confirm
  the contract is in place; the underlying reason direct pushes were possible
  is `enforce_admins: false` in the bootstrap script — flagged for follow-up
  hardening.
- Stale local branches `feat/command-palette-rebase` (1 stale dup of PR
  [#59](https://github.com/goldr0g3r/lattice/pull/59)) and
  `feat/shell-visual-polish` (1 stale dup of PR
  [#66](https://github.com/goldr0g3r/lattice/pull/66) on a pre-search base)
  pruned locally; their unique commits were verified as functional duplicates
  of the canonical squashed counterparts already on `main`. Seven of nine
  stashes from yesterday's worker hand-offs dropped after verifying their
  contents had shipped via PRs #55, #57, #59, #61, #66; two stashes preserved
  (`stash@{1}` adds 7 docs files not on `main`; `stash@{2}` adds
  `docs/development/coding-standards.md` not on `main`).
- `.gitignore` adds `.tmp-*.json` and `.tmp-*.md` patterns so future agent
  audits and snapshots don't pollute `git status` for concurrent workers
  sharing a worktree.

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
