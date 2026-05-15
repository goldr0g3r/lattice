/**
 * Right pane of the 3-column shell.
 *
 * Top bar shows the current note's title (derived from frontmatter or H1 —
 * tag editing UI is deferred to the v0.3 tag-index PR per issue #38),
 * read-only tag chips, and a meta row (word count + last-modified +
 * save-status hint). The body is the `<Editor>` from `@lattice/editor`;
 * we never touch its internals — that's the editor package's territory
 * and PR #55 + #56 own the in-editor format toolbars.
 *
 * # Visual polish pass (v0.2 PR #6 — `feat/shell-visual-polish`)
 *
 *  - **Title.** Bumped to 4xl serif, generous padding, matches the
 *    "Fusion energy" headline density in the dark reference.
 *  - **"Add tags" affordance.** Sits to the right of the tag chips
 *    (or in their place when none exist). Disabled-looking by default
 *    because tag editing is a follow-up PR — clicking it does nothing
 *    today; surfacing a real "+" button would lie about the
 *    capability. Tooltip explains "ships with v0.3 tag index" via
 *    `title`.
 *  - **No format toolbar.** Reference designs both show one above the
 *    body; we deliberately don't duplicate the surface — the slash
 *    menu owns formatting (PR #58 D4 / PRs #54-#56).
 *  - **Editor body surface.** Background paints `--editor-bg` so the
 *    light-mode body is true white and the dark-mode body is the
 *    deep-slate of the dark reference.
 */

import { useMemo } from "react";

import type { NoteContent, NoteDoc } from "@lattice/core-bindings";
import { Editor } from "@lattice/editor";

import { countWords, formatRelativeMs } from "./types";

export type SaveStatus = "idle" | "saving" | "saved";

export interface EditorPaneProps {
  /** The selected note's path, or null if no note is selected. */
  selectedPath: string | null;
  /** Loaded note content (matches `selectedPath`). Null while loading. */
  content: NoteContent | null;
  /** Doc to feed the editor — separate from `content.doc` because the parent
   * may want a fresh welcome doc when no notes exist. */
  doc: NoteDoc;
  /** Editor change handler. The parent owns persistence. */
  onChange?: (doc: NoteDoc) => void;
  /** Whether the editor accepts input. */
  editable: boolean;
  /** Auto-save status shown next to the meta row. */
  saveStatus: SaveStatus;
  /** Optional last-modified override (NoteSummary.modified_ms). */
  modifiedMs?: number;
  /** Inline-editable title — for this PR we render as a read-only `<h1>`;
   *  renaming is a follow-up PR (depends on `note_rename` IPC). */
  title?: string;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export function EditorPane(props: EditorPaneProps) {
  const { selectedPath, content, doc, onChange, editable, saveStatus, modifiedMs, title, now } =
    props;

  const tagChips = useMemo<string[]>(() => extractTags(content?.doc), [content?.doc]);
  const wordCount = useMemo(() => countWords(doc), [doc]);
  const headerTitle = title ?? content?.summary.title ?? (selectedPath ? selectedPath : "Welcome");
  const nowMs = (now ?? Date.now)();
  const lastModifiedMs = modifiedMs ?? content?.summary.modified_ms;

  return (
    <main aria-label="Note editor" className="flex h-full min-w-0 flex-1 flex-col bg-editor-bg">
      <header className="px-12 pb-5 pt-10">
        <div className="flex items-start justify-between gap-6">
          <h1
            aria-label="Note title"
            className="font-serif text-4xl font-semibold leading-tight text-text-primary"
          >
            {headerTitle}
          </h1>
          <button
            type="button"
            disabled
            title="Tag editing ships with the v0.3 tag index (issue #38)"
            className="mt-3 shrink-0 rounded-full border border-border bg-bg-elevated px-3 py-1 text-xs font-medium text-text-secondary disabled:cursor-not-allowed disabled:opacity-70"
          >
            + Add tags
          </button>
        </div>
        {tagChips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tagChips.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span className="font-mono tabular-nums">{wordCount} words</span>
          {lastModifiedMs ? (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="text-text-secondary/50">
                ·
              </span>
              <span>Updated {formatRelativeMs(lastModifiedMs, nowMs)}</span>
            </span>
          ) : null}
          {saveStatus !== "idle" && (
            <span aria-live="polite" className="flex items-center gap-2">
              <span aria-hidden="true" className="text-text-secondary/50">
                ·
              </span>
              <span>{saveStatus === "saving" ? "saving\u2026" : "saved"}</span>
            </span>
          )}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto px-12 pb-10" data-testid="editor-pane-body">
        <Editor
          key={selectedPath ?? "__welcome__"}
          initialDoc={doc}
          onChange={onChange}
          editable={editable}
        />
      </div>
    </main>
  );
}

/**
 * Pull tag chips out of frontmatter. We accept `tags: [a, b]` or `tag: foo`
 * and skip anything else; complex tag indexing is out of scope for this PR.
 */
function extractTags(doc: NoteDoc | null | undefined): string[] {
  if (!doc) return [];
  const out: string[] = [];
  for (const entry of doc.frontmatter.entries) {
    if (entry.key !== "tags" && entry.key !== "tag") continue;
    const value = entry.value;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === "string" && v.trim()) out.push(v.trim());
      }
    } else if (typeof value === "string" && value.trim()) {
      out.push(value.trim());
    }
  }
  return out;
}
