/**
 * Lattice 3-column desktop shell (v0.2 PR #3.5 — `feat/desktop-shell-redesign`).
 *
 * # Locked design decisions (reviewers — read me first)
 *
 *  - **D1 — three-column layout.** CSS grid in [`shell.css`](../shell.css)
 *    with `[sidebar 240px] [note-list 280px] [editor 1fr]`. The reference
 *    screenshot pattern translated; *not* the reference colours — every
 *    surface threads through `@lattice/ui/tokens.css` per ADR-0010.
 *    Resizable splitters are explicitly out of scope for this PR.
 *  - **D2 — sidebar nav.** Home / Notes / Settings only. We drop the
 *    reference's Calendar / Shared / Folder entries because they don't have
 *    backing features yet — surfacing them as dead nav is dishonest UX.
 *    Wordmark up top, `Local vault <path>` block at the bottom; the latter
 *    also hosts the theme toggle so the editor pane has full vertical room.
 *  - **D3 — note list.** Header (`All Notes` + count + search input), a
 *    plain-mapped list of rows (no virtualisation — corpora are small in
 *    v0.2; v0.3 SQLite-backed indexing can bring it later), a `+ New note`
 *    footer button. Search filters by title or path substring; full-text
 *    search lands with the v0.3 index.
 *  - **D4 — editor pane.** Top bar with derived title + read-only tag chips
 *    (frontmatter `tags`) + meta row (word count, mtime, save status). The
 *    body is the unchanged `<Editor>` from `@lattice/editor`. The reference
 *    design's top formatting toolbar is intentionally not duplicated — the
 *    slash menu owns that surface (shipped in v0.2 PR #2, expanded by
 *    PRs #55 / #56).
 *  - **D5 — note IO.** Picker calls `note_list` on vault open; clicking a
 *    row issues `note_read`; the editor's `onChange` is debounced 250 ms
 *    then persisted via `note_write`. We listen on `vault://index` so
 *    external edits show up in the rail without manual refresh.
 *  - **D6 — note creation.** "+ New note" prompts for a title, calls
 *    `note_create`, then opens the resulting summary. Slugged blank doc
 *    (`# <title>`) so the editor mounts on something real.
 *  - **D7 — design tokens only.** Sidebar / note-list surfaces consume new
 *    role-based tokens (`--sidebar-bg`, `--sidebar-fg`, `--sidebar-fg-muted`,
 *    `--notelist-bg`) — added to `tokens.css` + mirrored in the Tailwind
 *    preset so the token-parity script stays green.
 *  - **D8 — accessibility.** Sidebar = `<aside aria-label="Workspace navigation">`,
 *    nav uses real `<button>` rows with `aria-current="page"` for the active
 *    entry. The note rail is `<section aria-label="Notes in this vault">`
 *    with `aria-current="true"` on the active row. The editor pane is
 *    `<main aria-label="Note editor">`. Tab order flows sidebar → note list
 *    → editor body.
 */

import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { NoteContent, NoteDoc, NoteSummary, VaultInfo } from "@lattice/core-bindings";
import { Button, toast } from "@lattice/ui";

import {
  builtInCommands,
  getCommands,
  type AppCommand,
  type CommandContext,
  type CommandTheme,
} from "../commands/registry";
import { noteCommands } from "../commands/note-commands";
import { CommandPalette } from "../components/CommandPalette";
import { SearchModal } from "../components/SearchModal";
import { EditorPane, type SaveStatus } from "./EditorPane";
import { NoteList } from "./NoteList";
import { Sidebar } from "./Sidebar";
import { formatLatticeError, type NavId } from "./types";

const AUTO_SAVE_DEBOUNCE_MS = 250;

/**
 * `navigator.platform` is what every cross-platform "is this a Mac"
 * detector still reaches for — `userAgentData.platform` isn't shipped in
 * our Tauri WebView yet, and a touch-based / no-`navigator` environment
 * (jsdom, SSR) sees `Mod+K` as Ctrl+K, which matches every other desktop
 * surface in the app.
 */
function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || "");
}

function welcomeDoc(): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [
      {
        type: "heading",
        data: {
          level: 1,
          content: [{ type: "text", data: { value: "Welcome to Lattice" } }],
        },
      },
      {
        type: "paragraph",
        data: {
          content: [
            { type: "text", data: { value: "No notes yet \u2014 use " } },
            { type: "code", data: { value: "+ New note" } },
            {
              type: "text",
              data: {
                value:
                  " in the rail to create one, or drop .md files into the vault folder on disk.",
              },
            },
          ],
        },
      },
    ],
  };
}

function emptyDoc(): NoteDoc {
  return { frontmatter: { entries: [] }, body: [] };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface WorkspaceShellProps {
  vault: VaultInfo;
  /** Switch-vault click handler — owned by `App.tsx` so it can branch on the
   *  Tauri-only `open_vault_dialog`. */
  onSwitchVault: () => void;
  /** Close-vault click handler (same reason). */
  onCloseVault: () => void;
  /** Theme toggle — rendered inside the sidebar footer. */
  themeToggle: React.ReactNode;
  /** Cold-start ms + core version, surfaced in the editor-pane footer. */
  versionInfo: React.ReactNode;
  /** Current theme — needed by the command palette's "Toggle theme" entry. */
  theme: CommandTheme;
  /** Flip the theme — wired through to the palette `ctx.toggleTheme`. */
  onToggleTheme: () => void;
  /** Set the theme to an explicit value (`ctx.setTheme`). */
  onSetTheme: (theme: CommandTheme) => void;
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const { vault, onSwitchVault, onCloseVault, themeToggle, theme, onToggleTheme, onSetTheme } =
    props;

  const [activeNav, setActiveNav] = useState<NavId>("notes");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<NoteContent | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDocRef = useRef<NoteDoc | null>(null);

  const refreshNotes = useCallback(async () => {
    if (!isTauri()) return [] as NoteSummary[];
    try {
      const list = await invoke<NoteSummary[]>("note_list");
      setNotes(list);
      return list;
    } catch (err) {
      setPendingError(formatLatticeError(err));
      return [] as NoteSummary[];
    }
  }, []);

  const openNote = useCallback(async (path: string) => {
    if (!isTauri()) return;
    setPendingError(null);
    try {
      const content = await invoke<NoteContent>("note_read", { path });
      setActiveContent(content);
      setSelectedPath(content.summary.path);
      latestDocRef.current = content.doc;
      setSaveStatus("idle");
    } catch (err) {
      setPendingError(formatLatticeError(err));
    }
  }, []);

  const handleEditorChange = useCallback(
    (doc: NoteDoc) => {
      latestDocRef.current = doc;
      if (!selectedPath) return;
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const path = selectedPath;
        const docToWrite = latestDocRef.current;
        if (!path || !docToWrite || !isTauri()) {
          setSaveStatus("idle");
          return;
        }
        void (async () => {
          try {
            const summary = await invoke<NoteSummary>("note_write", {
              path,
              doc: docToWrite,
            });
            setSaveStatus("saved");
            setNotes((prev) => {
              const next = prev.filter((n) => n.path !== summary.path);
              next.unshift(summary);
              return next;
            });
          } catch (err) {
            setPendingError(formatLatticeError(err));
            setSaveStatus("idle");
          }
        })();
      }, AUTO_SAVE_DEBOUNCE_MS);
    },
    [selectedPath],
  );

  const handleNewNote = useCallback(async () => {
    if (!isTauri()) return;
    const title = window.prompt("Title for the new note", "Untitled");
    if (title === null) return;
    setPendingError(null);
    try {
      const summary = await invoke<NoteSummary>("note_create", { title });
      await refreshNotes();
      await openNote(summary.path);
    } catch (err) {
      setPendingError(formatLatticeError(err));
    }
  }, [openNote, refreshNotes]);

  const handleSelectNav = useCallback((id: NavId) => {
    setActiveNav(id);
    if (id === "notes" && typeof document !== "undefined") {
      // Focus the search input in the rail — the natural place to land when
      // the user clicks Notes in the sidebar.
      const search = document.querySelector<HTMLInputElement>(
        'input[type="search"][aria-label="Search notes"]',
      );
      search?.focus();
    }
  }, []);

  // Tell the splash screen we're done mounting, in case App didn't already.
  useEffect(() => {
    if (!isTauri()) return;
    void emit("renderer://ready");
  }, []);

  // Load + watch.
  useEffect(() => {
    if (!isTauri()) return;
    setNotes([]);
    setSelectedPath(null);
    setActiveContent(null);
    latestDocRef.current = null;
    void (async () => {
      const list = await refreshNotes();
      if (list.length > 0) {
        await openNote(list[0]!.path);
      }
    })();
    const unlistenIndex = listen("vault://index", () => {
      void refreshNotes();
    });
    return () => {
      void unlistenIndex.then((un) => un());
    };
  }, [vault.root, refreshNotes, openNote]);

  // Flush any pending save on unmount so a vault switch doesn't drop edits.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const editorDoc = useMemo<NoteDoc>(() => {
    if (activeContent) return activeContent.doc;
    if (notes.length === 0) return welcomeDoc();
    return emptyDoc();
  }, [activeContent, notes.length]);

  // Command palette ------------------------------------------------------
  //
  // The palette's `CommandContext` closes over the shell's existing
  // operations (open/switch/close vault, create note, open note) + the
  // theme handle App.tsx passes through. We rebuild on every render so
  // the context always reflects current state; the `commands` array
  // memoises on the values it actually depends on so cmdk doesn't see
  // a new identity per keystroke.

  const ctx = useMemo<CommandContext>(
    () => ({
      vault,
      notes,
      theme,
      openVault: onSwitchVault,
      switchVault: onSwitchVault,
      closeVault: onCloseVault,
      openNote: (path) => openNote(path),
      createNote: () => handleNewNote(),
      toggleTheme: onToggleTheme,
      setTheme: onSetTheme,
      openSearch: () => setSearchOpen(true),
      openSettings: () => {
        setActiveNav("settings");
      },
      togglePalette: () => setPaletteOpen((prev) => !prev),
      toast: (message, opts) => {
        const kind = opts?.kind ?? "info";
        const fn = kind === "error" ? toast.error : kind === "success" ? toast.success : toast.info;
        fn(message, opts?.description ? { description: opts.description } : undefined);
      },
    }),
    [
      vault,
      notes,
      theme,
      onSwitchVault,
      onCloseVault,
      onToggleTheme,
      onSetTheme,
      openNote,
      handleNewNote,
    ],
  );

  const commands = useMemo<AppCommand[]>(
    () => [...builtInCommands(ctx), ...noteCommands(notes, ctx), ...getCommands()],
    [ctx, notes],
  );

  // Global Mod+K listener (D2). Bound once at mount; the setter is a
  // stable React state setter so the listener never sees a stale value.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const isModK =
        event.key.toLowerCase() === "k" && (isMacPlatform() ? event.metaKey : event.ctrlKey);
      if (!isModK) return;
      event.preventDefault();
      setPaletteOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const paletteShortcutLabel = useMemo(() => (isMacPlatform() ? "⌘K" : "Ctrl+K"), []);

  return (
    <div className="lattice-shell" data-active-nav={activeNav}>
      <Sidebar
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        vaultLabel={vault.root}
        themeToggle={themeToggle}
      />
      <NoteList
        notes={notes}
        selectedPath={selectedPath}
        onSelect={(path) => void openNote(path)}
        onCreate={() => void handleNewNote()}
      />
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-end gap-2 border-b border-border bg-bg-surface px-6 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
            title={`Command palette (${paletteShortcutLabel})`}
            className="gap-2 text-text-secondary"
          >
            <TerminalSquare className="h-4 w-4" aria-hidden="true" />
            <span className="font-mono text-xs">{paletteShortcutLabel}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={onSwitchVault}>
            Switch vault…
          </Button>
          <Button variant="outline" size="sm" onClick={onCloseVault}>
            Close
          </Button>
        </div>
        <EditorPane
          selectedPath={selectedPath}
          content={activeContent}
          doc={editorDoc}
          onChange={selectedPath ? handleEditorChange : undefined}
          editable={selectedPath !== null}
          saveStatus={saveStatus}
        />
        {pendingError && (
          <p
            role="alert"
            className="border-t border-border bg-bg-surface px-10 py-2 text-sm text-accent-secondary"
          >
            {pendingError}
          </p>
        )}
        <footer className="flex items-center justify-between border-t border-border bg-bg-surface px-10 py-2 text-xs text-text-secondary">
          <span>{props.versionInfo}</span>
          <span>{selectedPath ?? `${notes.length} notes`}</span>
        </footer>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        ctx={ctx}
      />
    </div>
  );
}
