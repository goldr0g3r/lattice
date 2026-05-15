/**
 * Middle column of the 3-column shell — the picker rail.
 *
 * Renders the "All Notes" header (count + search + new-note CTA) and one
 * row per `NoteSummary`. Rows are real `<button>` elements so the Tab order
 * stays sensible. The search box filters by title substring only; v0.3
 * (issue [#42](https://github.com/goldr0g3r/lattice/issues/42)) widens
 * this to body content via the SQLite metadata index.
 *
 * Disk IO is the parent's responsibility (`WorkspaceShell` calls
 * `note_list` / `note_read`). This component is pure — pass it a
 * `notes: NoteSummary[]`, get `onSelect(path)` callbacks back.
 *
 * # Visual polish pass (v0.2 PR #6 — `feat/shell-visual-polish`)
 *
 *  - **Colored row dot.** A 6 px circle to the left of every row. The
 *    first three rows rotate through `--status-success` /
 *    `--status-warning` / `--status-info` for visual rhythm matching
 *    the dark reference; everything past the third row paints
 *    `--status-neutral`. **The rotation is decorative-only in v0.2** —
 *    once the v0.3 search/index lands (issues #44-#47) we can bind
 *    these to real pin / unread / recency state. Surfacing them as
 *    "real" status colours today would be dishonest UX.
 *  - **Snippet typography.** The secondary line under each title shows
 *    the note's path in `font-mono` at 11 px, muted, single-line truncated
 *    so deep folder structures don't blow up row height.
 *  - **Relative timestamp.** Uses `Intl.RelativeTimeFormat` (locale =
 *    `"en"` for determinism across CI environments) to render the
 *    "5 min ago" / "2 d ago" tail; the helper falls back to the previous
 *    pure-string implementation if `Intl.RelativeTimeFormat` is unavailable
 *    (very old runtimes).
 */

import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { NoteSummary } from "@lattice/core-bindings";
import { Button, Input, cn } from "@lattice/ui";

import { formatRelativeMs } from "./types";

const STATUS_ROTATION = ["bg-status-success", "bg-status-warning", "bg-status-info"] as const;

function statusDotClassForRow(index: number): string {
  if (index < STATUS_ROTATION.length) {
    return STATUS_ROTATION[index]!;
  }
  return "bg-status-neutral";
}

export interface NoteListProps {
  /** Newest-first list of summaries (server already sorts). */
  notes: readonly NoteSummary[];
  /** Currently-selected note path, or null for empty state. */
  selectedPath: string | null;
  /** Click handler for a row. */
  onSelect: (path: string) => void;
  /** Click handler for the "+ New note" footer button. */
  onCreate?: () => void;
  /**
   * Optional clock injection — accepts a `() => number` so tests can pin the
   * time and assert deterministic "5 min ago" output.
   */
  now?: () => number;
}

export function NoteList({ notes, selectedPath, onSelect, onCreate, now }: NoteListProps) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
    );
  }, [notes, query]);

  const nowMs = (now ?? Date.now)();

  return (
    <section aria-label="Notes in this vault" className="flex h-full flex-col bg-notelist-bg">
      <header className="flex flex-col gap-3 px-5 pb-3 pt-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-2xl leading-tight text-text-primary">All Notes</h2>
          <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs font-medium text-text-secondary">
            {notes.length}
          </span>
        </div>
        <div className="relative">
          <Search
            aria-hidden="true"
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="pl-8"
          />
        </div>
      </header>

      <ul
        aria-label="Notes list"
        className="flex flex-1 flex-col overflow-y-auto"
        data-testid="note-list-rows"
      >
        {visible.length === 0 && (
          <li className="px-5 py-6 text-sm text-text-secondary">
            {query
              ? `No notes match \u201C${query}\u201D.`
              : "No notes yet. Use \u201C+ New note\u201D below to create one."}
          </li>
        )}
        {visible.map((note, index) => {
          const active = note.path === selectedPath;
          const dotClass = statusDotClassForRow(index);
          return (
            <li key={note.path}>
              <button
                type="button"
                onClick={() => onSelect(note.path)}
                aria-current={active ? "true" : undefined}
                data-active={active ? "true" : undefined}
                className={cn(
                  "group flex w-full items-start gap-3 border-b border-notelist-divider px-5 py-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-inset",
                  active
                    ? "bg-notelist-row-active text-text-primary"
                    : "hover:bg-notelist-row-hover",
                )}
              >
                <span
                  aria-hidden="true"
                  data-testid="note-row-dot"
                  className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", dotClass)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex w-full items-baseline justify-between gap-3">
                    <span className="truncate font-medium text-text-primary">{note.title}</span>
                    <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-text-secondary">
                      {formatRelativeMs(note.modified_ms, nowMs)}
                    </span>
                  </span>
                  <span
                    className="line-clamp-1 w-full font-mono text-[0.7rem] text-text-secondary"
                    title={note.path}
                  >
                    {note.path}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-notelist-divider bg-notelist-bg px-5 py-4">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          onClick={onCreate}
          aria-label="Create new note"
        >
          <Plus size={14} aria-hidden="true" />
          New note
        </Button>
      </footer>
    </section>
  );
}
