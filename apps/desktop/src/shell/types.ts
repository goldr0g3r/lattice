/**
 * Shared types + small utilities used by the v0.2 desktop-shell components.
 *
 * Kept tiny on purpose — the locked design decisions (D1..D8) for the shell
 * live as a doc comment at the top of [`WorkspaceShell.tsx`](./WorkspaceShell.tsx).
 * This file only owns:
 *
 *   - `NavId` + `NAV_ITEMS` — the sidebar nav surface (Home / Notes / Settings)
 *     used by both `Sidebar` and `WorkspaceShell`.
 *   - `formatRelativeMs` — the "5 min ago" string the note-list rows show,
 *     pure-function so the tests don't need to mock the clock.
 *   - `extractSnippet` — first non-empty / non-heading line of a note body,
 *     trimmed to 80 chars for the rail's secondary line.
 *   - `formatLatticeError` — shared `LatticeError` → string formatter so the
 *     shell + tests render the same human-readable message.
 */

import type { Block, Inline, LatticeError, NoteDoc } from "@lattice/core-bindings";

export type NavId = "home" | "notes" | "settings";

export interface NavItem {
  id: NavId;
  label: string;
}

/**
 * Sidebar nav surface. The reference design also has Calendar / Shared /
 * Folder entries; we deliberately drop them — surfacing nav for features we
 * haven't built is dishonest UX (D2 in the WorkspaceShell decision list).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { id: "home", label: "Home" },
  { id: "notes", label: "Notes" },
  { id: "settings", label: "Settings" },
];

/**
 * Render an ISO-millis timestamp as a short "5 min ago" / "2 d ago" string.
 * The formatter is pure — pass `now` from the caller so tests stay
 * deterministic. Uses `Intl.RelativeTimeFormat` with locale `"en"`
 * (deliberately pinned so CI on Ubuntu + Windows produces byte-identical
 * output regardless of the host's LC_ALL), and falls back to a hand-rolled
 * short-string formatter on environments missing `Intl.RelativeTimeFormat`
 * (e.g. very old browsers or stripped-down jsdom builds).
 */
export function formatRelativeMs(ms: number, now: number = Date.now()): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const delta = Math.max(0, now - ms);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";

  const intl = getRelativeTimeFormat();
  if (intl) {
    if (delta < hour) return intl.format(-Math.round(delta / minute), "minute");
    if (delta < day) return intl.format(-Math.round(delta / hour), "hour");
    if (delta < 30 * day) return intl.format(-Math.round(delta / day), "day");
    const months = Math.round(delta / (30 * day));
    if (months < 12) return intl.format(-months, "month");
    return intl.format(-Math.round(months / 12), "year");
  }

  if (delta < hour) return `${Math.round(delta / minute)} min ago`;
  if (delta < day) return `${Math.round(delta / hour)} h ago`;
  if (delta < 30 * day) return `${Math.round(delta / day)} d ago`;
  const months = Math.round(delta / (30 * day));
  return months < 12 ? `${months} mo ago` : `${Math.round(months / 12)} yr ago`;
}

let cachedRtf: Intl.RelativeTimeFormat | null | undefined;

function getRelativeTimeFormat(): Intl.RelativeTimeFormat | null {
  if (cachedRtf !== undefined) return cachedRtf;
  try {
    if (typeof Intl === "undefined" || typeof Intl.RelativeTimeFormat !== "function") {
      cachedRtf = null;
      return cachedRtf;
    }
    cachedRtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  } catch {
    cachedRtf = null;
  }
  return cachedRtf;
}

/**
 * Pull a one-line snippet from a parsed `NoteDoc`. The rail rows show
 * `title` (from `NoteSummary`) on the first line and this snippet on the
 * second, so we walk past the first heading + skip empties.
 */
export function extractSnippet(doc: NoteDoc | null | undefined, maxLen = 80): string {
  if (!doc) return "";
  for (const block of doc.body) {
    if (block.type === "heading") continue;
    if (block.type === "paragraph") {
      const text = collectInlineText(block.data.content);
      const trimmed = text.trim();
      if (trimmed) return truncate(trimmed, maxLen);
    }
  }
  return "";
}

function collectInlineText(items: readonly Inline[]): string {
  const parts: string[] = [];
  for (const item of items) {
    switch (item.type) {
      case "text":
        parts.push(item.data.value);
        break;
      case "code":
        parts.push(item.data.value);
        break;
      case "strong":
      case "emphasis":
      case "strikethrough":
        parts.push(collectInlineText(item.data.content));
        break;
      case "link":
        parts.push(collectInlineText(item.data.content));
        break;
      default:
        break;
    }
  }
  return parts.join("");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** Approx. word count for the editor-pane meta row. */
export function countWords(doc: NoteDoc | null | undefined): number {
  if (!doc) return 0;
  let words = 0;
  for (const block of doc.body) {
    words += countBlockWords(block);
  }
  return words;
}

function countBlockWords(block: Block): number {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return wordsInInline(block.data.content);
    case "blockquote":
      return block.data.content.reduce((acc, b) => acc + countBlockWords(b), 0);
    case "callout":
      return block.data.body.reduce((acc, b) => acc + countBlockWords(b), 0);
    case "bullet_list":
    case "ordered_list":
      return block.data.items.reduce(
        (acc, item) => acc + item.content.reduce((sum, b) => sum + countBlockWords(b), 0),
        0,
      );
    case "fenced":
      return block.data.body.split(/\s+/u).filter(Boolean).length;
    case "math":
      return 0;
    case "table":
      return block.data.rows.reduce(
        (acc, row) => acc + row.cells.reduce((sum, cell) => sum + wordsInInline(cell), 0),
        0,
      );
    case "footnote_definition":
      return block.data.content.reduce((acc, b) => acc + countBlockWords(b), 0);
    default:
      return 0;
  }
}

function wordsInInline(items: readonly Inline[]): number {
  return collectInlineText(items).split(/\s+/u).filter(Boolean).length;
}

/**
 * Stringify a `LatticeError` (or any thrown value) into a human-readable
 * message. Kept here so tests + components share one formatter.
 */
export function formatLatticeError(err: unknown): string {
  if (err && typeof err === "object" && "kind" in err) {
    const e = err as LatticeError;
    if (e.kind === "invalid_path") {
      return `${e.details.reason}: ${e.details.path}`;
    }
    if (e.kind === "not_found") {
      return `not found: ${e.details.id}`;
    }
    if ("message" in e.details) {
      return `${e.kind}: ${e.details.message}`;
    }
    return e.kind;
  }
  return String(err);
}
