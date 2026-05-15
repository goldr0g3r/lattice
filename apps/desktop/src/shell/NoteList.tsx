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
 */

import { Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { NoteSummary } from "@lattice/core-bindings";
import { Button, Input, cn } from "@lattice/ui";

import { formatRelativeMs } from "./types";

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
    <section
      aria-label="Notes in this vault"
      className="flex h-full flex-col border-r border-border bg-[color:var(--notelist-bg)]"
    >
      <header className="flex flex-col gap-3 border-b border-border px-5 pb-3 pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl text-text-primary">All Notes</h2>
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
              ? `No notes match “${query}”.`
              : "No notes yet. Use “+ New note” below to create one."}
          </li>
        )}
        {visible.map((note) => {
          const active = note.path === selectedPath;
          return (
            <li key={note.path}>
              <button
                type="button"
                onClick={() => onSelect(note.path)}
                aria-current={active ? "true" : undefined}
                data-active={active ? "true" : undefined}
                className={cn(
                  "group flex w-full flex-col items-start gap-1 border-b border-border/60 px-5 py-3 text-left",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-1 focus-visible:ring-offset-bg-surface",
                  active ? "bg-bg-elevated text-text-primary" : "hover:bg-bg-elevated/60",
                )}
              >
                <div className="flex w-full items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-text-primary">{note.title}</span>
                  <span className="shrink-0 text-[0.7rem] text-text-secondary">
                    {formatRelativeMs(note.modified_ms, nowMs)}
                  </span>
                </div>
                <span
                  className="line-clamp-1 w-full font-mono text-[0.7rem] text-text-secondary"
                  title={note.path}
                >
                  {note.path}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-border bg-[color:var(--notelist-bg)] px-5 py-4">
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
        {/* Visual hook from the reference's "delete" icon kept as a no-op for
            this PR so the disabled state shows the affordance without the
            actual destructive command (tracked in issue #38). */}
        <span className="sr-only">
          <Trash2 aria-hidden="true" />
        </span>
      </footer>
    </section>
  );
}
