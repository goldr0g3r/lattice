/**
 * Dynamic "Open note: <title>" command-palette entries.
 *
 * The host hands us its current `NoteSummary[]` and a `CommandContext`; we
 * return one `AppCommand` per note, capped at the top 20 by `modified_ms`
 * (most-recently-touched first). The cap keeps the palette legible without
 * a separate "All notes" surface — vaults with hundreds of notes still get
 * a useful jump-to-recent list, and the user can fall back to the search
 * box on the rail (or v0.3 #43 full-text search) for anything older.
 *
 * Each command's `keywords` includes the note's vault-relative path so a
 * user typing "engineering/foo" still matches even when the title is
 * generic ("README", "Untitled").
 *
 * Kept in its own module so `registry.ts` stays a thin types-and-API file —
 * the v0.9 plugin SDK only has to import the symbols it cares about.
 */

import { FileText } from "lucide-react";

import type { NoteSummary } from "@lattice/core-bindings";

import type { AppCommand, CommandContext } from "./registry";

/** Max number of dynamic "Open note" rows to show in the palette. */
export const NOTE_COMMAND_LIMIT = 20;

/**
 * Build the "Open note: <title>" command list from the current vault index.
 *
 * `ctx` is accepted (rather than read off `notes`) so the run handler can
 * `await ctx.openNote(path)` — which goes through the same `note_read`
 * path the rail uses, so the palette and the rail can never disagree about
 * which note is mounted.
 */
export function noteCommands(notes: readonly NoteSummary[], ctx: CommandContext): AppCommand[] {
  void ctx;
  return notes
    .slice()
    .sort((a, b) => b.modified_ms - a.modified_ms)
    .slice(0, NOTE_COMMAND_LIMIT)
    .map((note) => ({
      id: `note.open:${note.path}`,
      label: `Open note: ${note.title}`,
      keywords: [note.path, "open", "jump"],
      group: "Notes" as const,
      icon: FileText,
      run: (c) => c.openNote(note.path),
    }));
}
