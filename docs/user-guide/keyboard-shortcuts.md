# Keyboard shortcuts

> Lattice is keyboard-first. Almost every action has a binding;
> almost every binding is also discoverable through the command
> palette. The shortcuts below match what's shipped today (v0.1 →
> v0.2); the [roadmap](../../ROADMAP.md) shows what arrives later.

## Modifier convention

| Symbol  | Linux / Windows | macOS        |
| ------- | --------------- | ------------ |
| `Mod`   | `Ctrl`          | `⌘` (Cmd)    |
| `Alt`   | `Alt`           | `⌥` (Option) |
| `Shift` | `Shift`         | `⇧`          |

Lattice picks the right modifier at runtime via `navigator.platform`,
so the same binding works on every OS.

## Global

| Binding       | Action                                       |
| ------------- | -------------------------------------------- |
| `Mod+K`       | Open / close the command palette.            |
| `Mod+N`       | Create a new note in the current vault.      |
| `Mod+,`       | Open settings (stub in v0.1).                |
| `Mod+Shift+L` | Toggle light / dark theme.                   |
| `Esc`         | Close the topmost overlay (palette, dialog). |

## Workspace navigation (v0.2)

| Binding       | Action                                                    |
| ------------- | --------------------------------------------------------- |
| `Mod+1`       | Focus sidebar.                                            |
| `Mod+2`       | Focus picker rail.                                        |
| `Mod+3`       | Focus editor pane.                                        |
| `Mod+B`       | Toggle sidebar visibility.                                |
| `Mod+Shift+B` | Toggle picker rail visibility.                            |
| `Mod+\`       | Toggle the right-hand panel (backlinks, when v0.3 ships). |

## In the picker rail

| Binding         | Action                                     |
| --------------- | ------------------------------------------ |
| `Up` / `Down`   | Move selection.                            |
| `Enter`         | Open the selected note in the editor pane. |
| `Mod+Backspace` | Move the selected note to trash (v0.3).    |
| `F2`            | Rename the selected note (v0.3).           |

## In the editor (v0.2)

### Slash menu

| Trigger | Action                                              |
| ------- | --------------------------------------------------- |
| `/`     | Open slash menu at the start of an empty paragraph. |

The slash menu lets you insert: heading, list, ordered list, task
list, code block, callout, math, mermaid, excalidraw, table, and
horizontal rule. Type to filter; `Up` / `Down` to choose; `Enter`
to insert; `Esc` to dismiss.

### Formatting

| Binding       | Action                                    |
| ------------- | ----------------------------------------- |
| `Mod+B`       | Bold.                                     |
| `Mod+I`       | Italic.                                   |
| `Mod+U`       | Underline (when supported by the schema). |
| `Mod+Shift+S` | Strikethrough.                            |
| `Mod+E`       | Inline code.                              |
| `Mod+Shift+C` | Toggle code block.                        |
| `Mod+Shift+L` | Toggle bullet list.                       |
| `Mod+Shift+O` | Toggle ordered list.                      |
| `Mod+Shift+8` | Toggle task list.                         |
| `Mod+Shift+H` | Toggle the current block to a callout.    |

### Headings

| Binding           | Action                            |
| ----------------- | --------------------------------- |
| `Mod+Alt+1` … `6` | Set heading level 1–6.            |
| `Mod+Alt+0`       | Set to paragraph (clear heading). |

### Wiki links

| Trigger       | Action                          |
| ------------- | ------------------------------- |
| `[[`          | Start a wiki-link autocomplete. |
| `Up` / `Down` | Navigate suggestions.           |
| `Enter`       | Insert the selected target.     |
| `Esc`         | Dismiss.                        |

### Math

| Trigger              | Action                                    |
| -------------------- | ----------------------------------------- |
| `$…$`                | Convert the wrapped text to inline math.  |
| `$$…$$`              | Convert the wrapped text to a math block. |
| Slash → "Math block" | Insert a math block at the cursor.        |

### Code blocks

| Binding                       | Action                                       |
| ----------------------------- | -------------------------------------------- |
| (inside a code block) `Mod+F` | Search within the code block (CodeMirror).   |
| `Tab` / `Shift+Tab`           | Indent / outdent.                            |
| `Mod+/`                       | Toggle line comment in the block's language. |
| `Esc`                         | Exit the code block to the next paragraph.   |

### Tables

| Binding     | Action                                        |
| ----------- | --------------------------------------------- |
| `Tab`       | Move to the next cell (creates a row at end). |
| `Shift+Tab` | Move to the previous cell.                    |
| `Mod+Enter` | Add a row below the current one.              |

### Save

| Binding | Action                                                                                 |
| ------- | -------------------------------------------------------------------------------------- |
| `Mod+S` | Force a save now (saves are otherwise auto-debounced 500 ms after the last keystroke). |

## Search (v0.3)

| Binding       | Action                                            |
| ------------- | ------------------------------------------------- |
| `Mod+P`       | Open the search modal.                            |
| `Mod+Shift+F` | Search inside the current note (CodeMirror find). |
| `Mod+Shift+P` | Open command palette (alias for `Mod+K`).         |

Inside the search modal:

| Binding       | Action                                      |
| ------------- | ------------------------------------------- |
| `Up` / `Down` | Navigate hits.                              |
| `Enter`       | Open the highlighted note.                  |
| `Mod+Enter`   | Open in a new pane (when split-pane lands). |
| `Esc`         | Dismiss.                                    |

Operators you can type in the modal:

```text
transformer attention   ← free text
tag:papers              ← scope to tag
path:Engineering/       ← scope to folder
created:>2026-01-01     ← date filters
"local-first software"  ← phrase
title:lattice           ← field-scoped
transfomer~             ← fuzzy
```

Full grammar in
[`../architecture/search-internals.md#query-parsing`](../architecture/search-internals.md#query-parsing).

## Graph view (v0.3)

| Binding       | Action                                     |
| ------------- | ------------------------------------------ |
| `Mod+G`       | Open / close the global graph.             |
| `Mod+Shift+G` | Open the local graph for the current note. |

## AI panel (v0.4)

| Binding       | Action                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| `Mod+L`       | Open / close the AI chat panel.                                                     |
| `Mod+Shift+L` | Toggle theme (note: takes precedence over AI panel; we'll re-bind when v0.4 ships). |

## See also

- [`vault-basics.md`](vault-basics.md) — what a vault is.
- [`markdown-flavor.md`](markdown-flavor.md) — the Markdown
  syntax behind these shortcuts.
- The command palette (`Mod+K`) — every action above is also
  searchable by name.
