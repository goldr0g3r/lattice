/**
 * Right pane of the 3-column shell.
 *
 * Top bar shows the current note's title (derived from frontmatter or H1 —
 * tag editing UI is deferred to the v0.3 tag-index PR per issue #38),
 * read-only tag chips, and a meta row (word count + last-modified +
 * save-status hint). The body is the `<Editor>` from `@lattice/editor`;
 * we never touch its internals — that's the editor package's territory
 * and PR #55 + #56 own the in-editor format toolbars.
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
    <main aria-label="Note editor" className="flex h-full min-w-0 flex-1 flex-col bg-bg-surface">
      <header className="border-b border-border px-10 pb-4 pt-8">
        <h1 aria-label="Note title" className="font-serif text-3xl font-semibold text-text-primary">
          {headerTitle}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {tagChips.length === 0 ? (
            <span className="text-xs text-text-secondary">No tags yet</span>
          ) : (
            tagChips.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-border bg-bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-primary"
              >
                {tag}
              </span>
            ))
          )}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <span>{wordCount} words</span>
          {lastModifiedMs ? (
            <span>
              <span aria-hidden="true">·</span> Updated {formatRelativeMs(lastModifiedMs, nowMs)}
            </span>
          ) : null}
          {saveStatus !== "idle" && (
            <span aria-live="polite">
              <span aria-hidden="true">·</span> {saveStatus === "saving" ? "saving…" : "saved"}
            </span>
          )}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto px-10 py-6" data-testid="editor-pane-body">
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
