# Editor internals

> The most-touched code path in the product. How TipTap, ProseMirror,
> CodeMirror 6, and the dual-pipeline Markdown round-trip fit
> together.
>
> Decision context:
> [ADR-0003 — TipTap (ProseMirror) as the editor](../decisions/0003-tiptap-prosemirror-editor.md),
> [ADR-0006 — Local-first plain Markdown as source of truth](../decisions/0006-local-first-plain-markdown.md),
> [ADR-0015 — Markdown flavor and serialization](../decisions/0015-markdown-flavor-and-serialization.md),
> [ADR-0016 — attachment storage](../decisions/0016-attachment-storage.md),
> [ADR-0017 — Excalidraw embed storage](../decisions/0017-excalidraw-embed-storage.md).

## The big picture

```text
                Markdown on disk (source of truth)
                          │ ▲
        parse on open     │ │      serialise on save
                          ▼ │
              ┌────────────────────────┐
              │   NoteDoc (JSON-ish)   │   ← shared contract
              │   editor-agnostic      │      (Rust + TS, same shape)
              └────────────────────────┘
                          │ ▲
        from-doc.ts       │ │      to-doc.ts
                          ▼ │
            ┌─────────────────────────────┐
            │   TipTap document (PM)      │
            │   ProseMirror schema        │
            │   ├─ block: paragraph,      │
            │   │  heading, list,         │
            │   │  code_block, callout,   │
            │   │  math_block, fenced…    │
            │   └─ inline: text, mark,    │
            │      wiki_link, math_inline │
            └─────────────────────────────┘
                          │ ▲
        TipTap extensions │ │  user input / commands
                          ▼ │
                 ┌──────────────────┐
                 │  React component │
                 └──────────────────┘
```

The contract is "**any path through this graph round-trips**":
disk → TipTap doc → user edit → save → disk (with the user's edits
applied). The hardest sub-problem is "disk → NoteDoc → disk" —
that's what the golden corpus locks down.

## NoteDoc — the shared contract

A `NoteDoc` is an editor-agnostic, JSON-serialisable representation
of a note. Both the Rust core and the TS editor package implement the
**same** shape:

```ts
// packages/editor/src/markdown/parser.ts (TS side)
type NoteDoc = {
  frontmatter: Record<string, unknown>;
  blocks: Block[];
};

type Block =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "heading"; level: 1|2|3|4|5|6; inlines: Inline[] }
  | { type: "code_block"; language?: string; content: string }
  | { type: "callout"; kind: "info" | "warn" | "tip"; blocks: Block[] }
  | { type: "math_block"; content: string }
  | { type: "fenced"; info: string; content: string }    // mermaid, excalidraw, lattice:*
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "table"; headers: Inline[][]; rows: Inline[][][] }
  | …;

type Inline =
  | { type: "text"; value: string; marks?: Mark[] }
  | { type: "wiki_link"; target: string; alias?: string }
  | { type: "math_inline"; content: string }
  | { type: "code"; value: string }
  | …;
```

The Rust shape is the matching `enum NoteDocBlock` / `NoteDocInline`
in [`core/lattice-core/src/markdown/`](../../core/lattice-core/src/markdown/).
The Rust → TS shape conversion is locked by `ts-rs`.

## Markdown pipeline

Two parsers + two serialisers — one pair per side. Both round-trip
the **same** golden corpus byte-identically.

### Parser

TS side ([`packages/editor/src/markdown/parser.ts`](../../packages/editor/src/markdown/parser.ts)):

- `mdast-util-from-markdown` builds an `mdast` tree.
- Plugins extend `mdast`:
  - `mdast-util-frontmatter` → frontmatter node.
  - `mdast-util-gfm` → tables, task lists, strikethrough,
    autolinks.
  - `mdast-util-math` → inline + block math.
- A custom **mdast → NoteDoc** transform handles wiki-links and
  callouts (which aren't standard mdast nodes).

Rust side: `pulldown-cmark` produces an event stream, which a
hand-written state machine in `lattice-core::markdown::parser`
folds into `NoteDoc`.

The two parsers are kept in lock-step by the **golden corpus** at
[`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/).

### Serialiser

The reverse: `NoteDoc → Markdown` on each side. The serialiser is
**deterministic** — given a `NoteDoc`, the output is always the same
bytes. That's what makes the round-trip provable.

Rules of the serialiser:

- One block per top-level node, blank line between.
- Frontmatter key order preserved (we read it through a YAML AST that
  remembers order; we don't re-sort).
- Heading style: ATX (`#`), never setext (`====`).
- List indent: 2 spaces (matches markdownlint `MD007`).
- Code fences: 3 backticks; emit the language tag.
- Callouts: `> [!kind]` GitHub-compatible.
- Wiki links: `[[Title]]` or `[[Title|Alias]]`.

When a fixture round-trip fails, the diff usually points at one of
these rules being violated.

### The golden corpus

Lives under [`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/).
Each `<name>.md` is a fixture; `<name>.expected.json` is the parsed
AST snapshot.

CI runs **two** assertions per fixture:

1. **Round-trip** — `serialise(parse(file)) == file` (byte-identical).
2. **AST stability** — `parse(file) == file.expected.json`.

The AST snapshot is the early-warning system: a parser change that
shifts node order or adds a new field shows up in the AST diff before
it shows up in the round-trip. Recipe to add a fixture is at
[`../how-to/add-a-markdown-roundtrip-fixture.md`](../how-to/add-a-markdown-roundtrip-fixture.md).

## TipTap layer

TipTap is the editor framework on top of ProseMirror. It owns:

- **Schema** ([`packages/editor/src/tiptap/schema.ts`](../../packages/editor/src/tiptap/schema.ts)) —
  the set of allowed nodes / marks.
- **Extensions** ([`packages/editor/src/tiptap/extensions/`](../../packages/editor/src/tiptap/extensions/)) —
  per-feature plugins (wiki-link, callout, math, mermaid/excalidraw
  fence, slash-commands, image drop, footnote).
- **Conversion** ([`packages/editor/src/tiptap/to-doc.ts`](../../packages/editor/src/tiptap/to-doc.ts) /
  [`from-doc.ts`](../../packages/editor/src/tiptap/from-doc.ts)) —
  TipTap doc ↔ `NoteDoc`.

### Schema

ProseMirror's schema is **strict**: a document is valid iff every
node respects its `content` constraints. We extend the StarterKit
nodes with our own:

| Node                                               | Inline / block? | Notes                                                 |
| -------------------------------------------------- | --------------- | ----------------------------------------------------- |
| `paragraph`                                        | block           | Default block; contains inlines.                      |
| `heading`                                          | block           | Levels 1–6.                                           |
| `code_block`                                       | block           | Hosts a CodeMirror 6 NodeView.                        |
| `callout`                                          | block           | Custom; one of `info` / `warn` / `tip`.               |
| `math_block`                                       | block           | KaTeX-rendered; serialises to `$$…$$`.                |
| `fenced`                                           | block           | Mermaid / Excalidraw / `lattice:<kind>` info-strings. |
| `list_item` / `bullet_list` / `ordered_list`       | block           | StarterKit.                                           |
| `task_list` / `task_item`                          | block           | GFM checkboxes.                                       |
| `table` / `table_row` / `table_cell`               | block           | StarterKit + GFM.                                     |
| `paragraph` mark `wiki_link`                       | inline          | Custom mark; renders as `<a class="wiki-link">`.      |
| `math_inline`                                      | inline          | KaTeX-rendered; serialises to `$…$`.                  |
| `text`, `link`, `bold`, `italic`, `strike`, `code` | inline          | StarterKit.                                           |

If you're adding a new block type, the recipe is at
[`../how-to/add-a-tiptap-extension.md`](../how-to/add-a-tiptap-extension.md).

### Extensions

Each file in `packages/editor/src/tiptap/extensions/` declares one
TipTap extension. Pattern:

```ts
import { Mark } from "@tiptap/core";

export const WikiLink = Mark.create({
  name: "wiki_link",
  inclusive: false,
  addAttributes() {
    return { target: { default: "" }, alias: { default: null } };
  },
  parseHTML() {
    return [{ tag: "a[data-wiki-link]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["a", { ...HTMLAttributes, "data-wiki-link": "true" }, 0];
  },
  // ... commands, input rules, suggestion plugins, etc.
});
```

The extension's serialisation contribution lives **outside** the
extension — in `from-doc.ts`. The split keeps TipTap's runtime
concerns (parseHTML / renderHTML) separate from the on-disk concerns
(NoteDoc → Markdown).

### Slash commands

Triggered by `/` at the start of a line; powered by TipTap's
`Suggestion` plugin. Items defined in
[`packages/editor/src/tiptap/slash-items.ts`](../../packages/editor/src/tiptap/slash-items.ts);
plumbed through
[`extensions/slash-commands.ts`](../../packages/editor/src/tiptap/extensions/slash-commands.ts).

The same pattern is used by the v0.9 plugin SDK — register a slash
item via the SDK and it shows up in the menu.

## CodeMirror 6 inside TipTap

`code_block` nodes host a real CodeMirror 6 instance via a custom
`NodeView`:

```text
<pre data-code-block>
  <CodeMirror inline />   ← real CM6 EditorView
</pre>
```

The plumbing is in
[`packages/editor/src/tiptap/codemirror/node-view.ts`](../../packages/editor/src/tiptap/codemirror/node-view.ts):

- One `EditorView` per `code_block` node.
- ProseMirror transactions and CM6 transactions are bridged manually
  — a CM6 update triggers a PM transaction that updates the node's
  `content`, and vice versa.
- Language is selected from the node's `language` attribute via
  [`languages.ts`](../../packages/editor/src/tiptap/codemirror/languages.ts);
  language modules are dynamic-imported on demand to keep the bundle
  small.
- The CM6 theme in
  [`theme.ts`](../../packages/editor/src/tiptap/codemirror/theme.ts)
  is bound to **design tokens** so light / dark theme flips Just
  Work.

### Supported languages (v0.2)

`cpp`, `css`, `go`, `html`, `java`, `javascript`, `json`,
`markdown`, `php`, `python`, `rust`, `sql`, `xml`, `yaml`, plus
`@codemirror/legacy-modes` for less-common ones. Adding a new
language is a one-line entry in `languages.ts`.

## Math (KaTeX)

`math_inline` (`$x$`) and `math_block` (`$$x$$`) nodes are rendered
via KaTeX. The math text is the node's `content`; KaTeX is invoked
in the node's `addNodeView` to render to HTML at the right spot.

KaTeX fonts are imported once in `Editor.css` /
`katex-fonts.css` (subset + woff2). The math wrapper styles
(`math.css`) are scoped to the editor surface so KaTeX doesn't leak
into the rest of the UI.

## Mermaid / Excalidraw embeds

Both render through the `fenced` block node:

````markdown
```mermaid
graph TD; A --> B
```

```excalidraw
{ "type": "excalidraw", "elements": [...] }
```
````

The `fenced` extension reads the info-string and:

- For `mermaid` — renders the diagram client-side via the
  `mermaid` package.
- For `excalidraw` — opens the JSON in an embedded Excalidraw
  runtime; saves the JSON sidecar plus a PNG snapshot per
  [ADR-0017](../decisions/0017-excalidraw-embed-storage.md).

The serialiser writes the fenced block back; readers that don't
speak Mermaid / Excalidraw still see a (somewhat readable) code
fence.

## Wiki links

`[[Title]]` and `[[Title|Alias]]` are inline marks. Resolution rules
(when you click one):

1. Match `Title` exactly against `notes.title` in the SQLite index.
2. Fall back to `notes.aliases` (parsed from frontmatter).
3. If still no match, the link is "unlinked" — clicking creates a
   new note titled `Title`.

Autocomplete is wired via TipTap's Suggestion plugin, scoped to
`[[`. The picker rail's "unlinked mentions" panel (v0.3) finds
plain-text `[[X]]` strings whose `X` doesn't resolve.

## Conflict resolution

When the file watcher sees an external write to a note that has an
unsaved in-app draft, the v0.2 prompt
([ADR-0013](../decisions/0013-vault-conflict-resolution-ux.md)) gives
three choices: keep mine, take theirs, show diff. The diff view
re-uses the v0.9 time-travel diff component when it lands; until
then, "show diff" is a stretch goal.

## Performance notes

- **One TipTap editor per open note.** Multi-window editing of the
  same note isn't supported in v0.2; the second window would see a
  stale buffer.
- **CodeMirror 6 lazy-loads its language modules** — the bundle is
  ~80 KB for the editor core, languages added on demand.
- **KaTeX render is synchronous** but cheap (~0.5 ms per equation
  on warm CPU); we don't need to memo it for a v0.1-scale note.
- **Mermaid render is async**, debounced 200 ms after the last edit
  to the fenced block — otherwise typing `graph TD;` retriggers
  the render N times.
- **The serialiser is on the save path**, not the typing path. Save
  is debounced 500 ms after the last keystroke; the round-trip
  (~few ms) is invisible at human scales.

## Common bugs and where they hide

| Symptom                                   | Most likely cause                                             |
| ----------------------------------------- | ------------------------------------------------------------- |
| Round-trip diff shows trailing whitespace | Serialiser missed `trimEnd` in the line emitter.              |
| Wiki link target lost on round-trip       | `wiki_link` mark serialiser dropped the `target` attribute.   |
| KaTeX shows raw `$x$` instead of math     | Math extension didn't claim the input rule; check ordering.   |
| Slash menu doesn't appear                 | Suggestion plugin's `char` config; ensure exactly `/`.        |
| Code-block paste loses indent             | TipTap StarterKit replaced our extension; lower priority.     |
| Mermaid renders twice on focus            | The fenced extension's `update` hook re-creates the renderer. |

## Roadmap

What lands later:

- **v0.7** — typed blocks (Dataset / Model / Experiment / Citation)
  via the `lattice:<kind>` fenced-block convention from
  [ADR-0015](../decisions/0015-markdown-flavor-and-serialization.md).
- **v0.5** — `y-prosemirror` integration; `NoteDoc` becomes a
  derived view of the Yjs doc.
- **v0.9** — plugin SDK; third-party TipTap extensions running in a
  WASM sandbox.

The scaffolding is already in place for these — the schema is
extensible, the serialiser is deterministic, the round-trip is
provable.
