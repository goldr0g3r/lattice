# Vault basics

> A **vault** is a folder of Markdown notes that Lattice reads,
> writes, and indexes. There's no database to migrate, no cloud to
> sign into, no proprietary file format. Your notes are your files.

## What's a vault?

```text
~/Documents/MyVault/        ← any folder you choose
├─ Engineering/
│  ├─ Distributed Systems.md
│  └─ Rust patterns.md
├─ AIML/
│  ├─ Transformers.md
│  └─ Datasets/
│     └─ ImageNet.md
└─ Bookmarks/
   └─ 2026-05-13 — A great paper.md
```

Two rules:

1. Each note is one `.md` file.
2. The folder layout is yours. Use whatever organisation makes
   sense — Lattice doesn't care.

A vault picks up a hidden `.lattice/` subdirectory the first time
you open it. That's where Lattice keeps its caches (search index,
metadata, attachments). If you delete `.lattice/`, Lattice rebuilds
it on next open. **Never put data you can't afford to lose in
`.lattice/`** — it's the cache by design.

## Opening a vault

`Ctrl+K` (Linux / Windows) or `⌘K` (macOS), type "Open vault", press
Enter. Pick a folder. Done.

If the folder doesn't have a `.lattice/` subdirectory, Lattice
creates one. If it does, Lattice opens it.

You can also use the **menu bar** (when it lands in v0.2) → File →
Open Vault.

## Creating a new vault

Same flow, but pick "Create vault" instead. You're prompted for a
folder location; Lattice creates the folder if it doesn't exist,
seeds `.lattice/`, and opens it.

You can have any number of vaults. Switch between them via "Switch
vault" in the command palette.

## Where your notes live

Anywhere you want. Suggestions:

- **`~/Documents/Notes/`** — the obvious choice; backed up by your
  cloud-synced Documents folder.
- **A Git repository** (`~/Code/notes/`) — diff your prose, push
  to a private GitHub repo for backup. Lattice's
  `<vault>/.lattice/` is gitignore-friendly; commit only the
  `.md` files (and the `attachments/` folder if you want them
  versioned).
- **A network drive** — works, but the file watcher's debounce
  windows assume local-disk latency. You may see slower
  re-indexing on a remote share.

You **can** put a vault in a cloud-synced folder (Dropbox, iCloud,
OneDrive, Syncthing). Two caveats:

- Two devices that edit the same note offline at the same time will
  produce a conflict file (`note (conflicted copy).md`) — that's the
  cloud sync, not Lattice. v0.5's CRDT sync is the right path for
  multi-device editing without conflicts.
- Some cloud providers de-list the `.lattice/` directory because the
  name starts with a dot. That's fine; the cache rebuilds.

## File names

The filename of a note is **not** its identity. Lattice gives each
note a UUID (in the YAML frontmatter, `id:`). You can rename a file
freely — `git mv`, `mv`, drag it in your file manager — and
Lattice picks up the new name on next save without losing any
links.

What you **can't** do is have two notes with the same `id` (Lattice
will pick one and ignore the other) or two `.md` files at the same
path (the file system stops you).

## Backups

The simplest backup of a Lattice vault is **a copy of the folder**.

```bash
rsync -a ~/Documents/MyVault/ ~/Backups/MyVault-$(date +%Y%m%d)/
```

…or use whatever backup tool you trust on your OS. If you use Git
on the vault folder, the Git history _is_ the backup.

What `.lattice/` contains, what's safe to skip:

| Folder                          | Backup?                                                    |
| ------------------------------- | ---------------------------------------------------------- |
| `.lattice/index.db`             | No — rebuilds from `.md` files.                            |
| `.lattice/tantivy/`             | No — rebuilds from `.md` files.                            |
| `.lattice/attachments/`         | **Yes.** These are real binary files, not derivable.       |
| `.lattice/logs/`                | No — debug logs, rotated automatically.                    |
| `*.note.crdt` (when sync is on) | Optional — derivable from `.md` if you don't need history. |

A vault `.gitignore` we recommend (for Git-based backups):

```text
# Lattice cache (rebuildable)
.lattice/index.db
.lattice/tantivy/
.lattice/logs/

# Sync state (optional; commit if you want history-of-history)
*.note.crdt
```

## Multiple vaults

You can have a personal vault, a work vault, a research vault.
Lattice doesn't care; each is independent. Open the one you want
via the command palette ("Open vault…" / "Switch vault…").

When you switch vaults, Lattice closes the current one (saving any
pending state), opens the new one, and remembers the new one as your
"last opened" so you'll start there next time.

## Frontmatter

Every Lattice-touched note has a YAML block at the top:

```markdown
---
id: 0192f1d4-7c41-7b22-b1a5-71e1f8c74522
title: Distributed Systems
tags: [systems, papers]
created: 2026-04-12T10:00:00Z
updated: 2026-05-13T14:21:00Z
aliases: [Distributed Systems Reading List]
---

# Distributed Systems

Body text…
```

Fields are documented at
[`../architecture/data-model.md#a-note-on-disk`](../architecture/data-model.md#a-note-on-disk).
You can hand-edit the frontmatter in any editor; Lattice picks up
your changes the next time it reads the file.

## What if I move on from Lattice?

Your notes are plain Markdown. Open them in:

- **Obsidian** — wiki links, callouts, and frontmatter are
  recognised. The `.lattice/` folder is ignored.
- **`vim`, `emacs`, `nano`, or any text editor** — works.
- **VS Code or Cursor** — works; the Markdown preview renders fine.
- **Pandoc** — for converting to HTML / PDF / DOCX / Org / RST.
- **Static site generators** — Eleventy, Hugo, Jekyll, Astro all
  consume CommonMark+GFM directly.

Lattice's specific features — typed Dataset / Model / Experiment
blocks (v0.7), Excalidraw embeds, etc. — degrade gracefully to
fenced code blocks in tools that don't speak the convention. You
lose the rich rendering, you keep the content.

The pitch is "**your files are yours**" and we mean it.

## See also

- [`markdown-flavor.md`](markdown-flavor.md) — what Markdown Lattice
  reads and writes.
- [`keyboard-shortcuts.md`](keyboard-shortcuts.md) — every
  keyboard binding.
- [`../architecture/data-model.md`](../architecture/data-model.md) —
  the deep dive on what's on disk.
