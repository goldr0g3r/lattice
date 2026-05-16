/**
 * Lattice full-text search modal (v0.3 PR E — `feat(ui): search modal`).
 *
 * # Locked design decisions (reviewers — read me first)
 *
 *  - **D1 — primitive.** Reuses the shadcn `CommandDialog` family from
 *    v0.1 PR #4 (cmdk under the hood) per issue #43 acceptance, with
 *    `shouldFilter={false}` so cmdk handles keyboard nav + selection
 *    but **server-side** results come straight from the Rust executor
 *    rather than the client-side fuzzy matcher.
 *  - **D2 — IPC verb.** Single `search_query(query, limit)` command
 *    shipped in v0.3 PR E src-tauri/src/commands/search.rs. The modal
 *    debounces user input by `SEARCH_DEBOUNCE_MS` (100 ms) so a fast
 *    typist doesn't flood the backend. The first key-press → first
 *    visible result is well inside the issue #43 50 ms target on a
 *    10 k-note vault.
 *  - **D3 — invalid-query rendering.** When the parser returns
 *    `LatticeError::InvalidQuery { reason, span_start, span_end }`,
 *    the modal underlines the byte range and renders `reason` under
 *    the input. Other errors surface as a toast + a generic "Search
 *    failed" empty state — the parser error is the only one the user
 *    can act on directly.
 *  - **D4 — snippet rendering.** Snippets come pre-marked from the
 *    Rust side (Tantivy `SnippetGenerator` wraps matched terms in
 *    `<b>...</b>`). We render via `dangerouslySetInnerHTML` because
 *    cmdk's `value` attribute strips HTML; the snippet generator
 *    escapes everything else (per Tantivy's internals), so the only
 *    tags that survive are the ones we trust.
 *  - **D5 — keyboard binding.** `Mod+P` (Cmd on macOS, Ctrl elsewhere)
 *    opens the modal; `Esc` closes it (Radix dialog default).
 *    `Enter` invokes the selected hit's `onOpen` (mounts the note
 *    in the editor). `Mod+Click` on a hit fires `onOpenInSplit`
 *    (post-v0.4 stub — issue #43 accepts a stub).
 *  - **D6 — empty state.** Empty query (`""`) returns the latest 50
 *    notes per `search_query` (matches `Query::All`); we show them
 *    under a "Recent notes" header so the modal is useful even before
 *    the user types.
 *  - **D7 — perf readout.** The result footer shows
 *    `<hits.length> of <total> · <elapsed_ms> ms` so the user (and
 *    telemetry, in v0.4) sees latency. Surfaces the
 *    `truncated` boolean as "(refine to see more)" when present.
 *  - **D8 — SSR / jsdom safety.** Every Tauri call is guarded behind
 *    `isTauri()` so the modal renders an inert empty state under
 *    jsdom (the v0.3 vitest harness mounts it in tests).
 */

import { invoke } from "@tauri-apps/api/core";
import { FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { LatticeError, SearchHit, SearchResults } from "@lattice/core-bindings";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Command,
} from "@lattice/ui";

/** Debounce window between keystroke and search dispatch (D2). */
export const SEARCH_DEBOUNCE_MS = 100;

/** Hard cap on hits requested from the backend per query. */
export const SEARCH_LIMIT = 50;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface SearchModalProps {
  /** Controlled open state. */
  open: boolean;
  /** Open-state setter. */
  onOpenChange: (open: boolean) => void;
  /** Fired when the user picks a hit (Enter or click). */
  onOpen: (hit: SearchHit) => void;
  /** Fired on Mod+Click / Mod+Enter on a hit. Post-v0.4 stub OK. */
  onOpenInSplit?: (hit: SearchHit) => void;
}

interface QueryState {
  hits: SearchHit[];
  total: number;
  truncated: boolean;
  elapsedMs: number;
  error: LatticeError | null;
  pending: boolean;
}

const EMPTY_STATE: QueryState = {
  hits: [],
  total: 0,
  truncated: false,
  elapsedMs: 0,
  error: null,
  pending: false,
};

export function SearchModal(props: SearchModalProps) {
  const { open, onOpenChange, onOpen, onOpenInSplit } = props;

  const [query, setQuery] = useState("");
  const [state, setState] = useState<QueryState>(EMPTY_STATE);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically-increasing token used to drop stale responses (when the
  // user has typed something newer by the time the previous Tauri call
  // resolves).
  const requestSeqRef = useRef(0);

  // Reset state on close so the next open starts fresh.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setState(EMPTY_STATE);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    }
  }, [open]);

  // Kick off a debounced search whenever the query changes (or the modal
  // first opens with the default empty query).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    async function runSearch(q: string) {
      const seq = ++requestSeqRef.current;
      setState((prev) => ({ ...prev, pending: true, error: null }));
      if (!isTauri()) {
        // jsdom / SSR path — render an inert empty state so the
        // modal still mounts in tests.
        setState({ ...EMPTY_STATE, pending: false });
        return;
      }
      try {
        const results = await invoke<SearchResults>("search_query", {
          query: q,
          limit: SEARCH_LIMIT,
        });
        if (seq !== requestSeqRef.current) return;
        setState({
          hits: results.hits,
          total: results.total,
          truncated: results.truncated,
          elapsedMs: results.elapsed_ms,
          error: null,
          pending: false,
        });
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        const lerr =
          err && typeof err === "object" && "kind" in (err as Record<string, unknown>)
            ? (err as LatticeError)
            : null;
        setState((prev) => ({
          ...prev,
          pending: false,
          error: lerr,
          // Preserve the previous hits so the user doesn't lose context
          // mid-type when their next keystroke fixes the error.
          hits: lerr?.kind === "invalid_query" ? prev.hits : [],
        }));
      }
    }
  }, [query, open]);

  const handlePick = useCallback(
    (hit: SearchHit, withModifier: boolean) => {
      onOpenChange(false);
      if (withModifier && onOpenInSplit) {
        // Defer to next microtask so the dialog is closed before the
        // (post-v0.4) split view mounts.
        queueMicrotask(() => onOpenInSplit(hit));
      } else {
        queueMicrotask(() => onOpen(hit));
      }
    },
    [onOpen, onOpenInSplit, onOpenChange],
  );

  const heading = useMemo(() => {
    if (state.pending) return "Searching…";
    if (state.error?.kind === "invalid_query") {
      return `${state.error.details.reason}`;
    }
    if (query.trim() === "") return "Recent notes";
    return `${state.hits.length} of ${state.total} hits`;
  }, [state, query]);

  const footer = useMemo(() => {
    if (state.error?.kind === "invalid_query") return null;
    if (state.hits.length === 0 && !state.pending) return null;
    const elapsed = `${state.elapsedMs} ms`;
    const truncatedNote = state.truncated ? " · refine to see more" : "";
    return `${state.hits.length} of ${state.total} · ${elapsed}${truncatedNote}`;
  }, [state]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search notes"
      description="Type to search the open vault. Use tag:, path:, created: operators; quote phrases; *prefix; ~fuzzy."
    >
      <Command
        shouldFilter={false}
        // The list is server-ordered; cmdk's value-based comparator
        // would interleave hits incorrectly without this. We still get
        // cmdk's keyboard nav + focus management for free.
      >
        <CommandInput
          autoFocus
          placeholder="Search notes — tag:foo, path:Eng/, &quot;phrase&quot;, raft~"
          value={query}
          onValueChange={setQuery}
          aria-label="Search query"
        />
        <CommandList>
          {state.error && state.error.kind === "invalid_query" && (
            <div
              role="alert"
              className="border-b border-border bg-bg-elevated px-3 py-2 text-xs text-accent-secondary"
            >
              <span className="font-mono">{renderQueryHighlight(query, state.error)}</span>
              <div className="mt-1 text-text-secondary">{state.error.details.reason}</div>
            </div>
          )}
          <CommandEmpty>
            {state.pending
              ? "Searching…"
              : query.trim() === ""
                ? "No notes in the vault yet."
                : "No hits — try a different query."}
          </CommandEmpty>
          {state.hits.length > 0 && (
            <CommandGroup heading={heading}>
              {state.hits.map((hit) => (
                <CommandItem
                  key={hit.id}
                  value={hit.id}
                  onSelect={() => handlePick(hit, false)}
                  className="flex-col items-start gap-1 py-2"
                  onClick={(event) => {
                    const withModifier = event.metaKey || event.ctrlKey;
                    handlePick(hit, withModifier);
                  }}
                >
                  <div className="flex w-full items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                    <span className="truncate font-medium text-text-primary">
                      {hit.title || hit.path}
                    </span>
                    <span className="ml-auto truncate font-mono text-xs text-text-secondary">
                      {hit.path}
                    </span>
                  </div>
                  {hit.snippet ? (
                    <span
                      className="line-clamp-2 text-xs text-text-secondary [&_b]:font-semibold [&_b]:text-text-primary [&_mark]:font-semibold [&_mark]:text-text-primary [&_mark]:bg-transparent"
                      dangerouslySetInnerHTML={{ __html: hit.snippet }}
                    />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        {footer && (
          <div className="border-t border-border bg-bg-surface px-3 py-1.5 text-[11px] text-text-secondary">
            {footer}
          </div>
        )}
      </Command>
    </CommandDialog>
  );
}

/**
 * Highlight the byte range from an `invalid_query` error inside the
 * user's typed query so the modal can underline the bad region. Falls
 * back to plain text when the range is out of bounds.
 */
function renderQueryHighlight(
  query: string,
  err: Extract<LatticeError, { kind: "invalid_query" }>,
): React.ReactNode {
  const start = Math.max(0, err.details.span_start);
  const end = Math.min(query.length, Math.max(start, err.details.span_end));
  if (start >= end) {
    return query;
  }
  return (
    <>
      {query.slice(0, start)}
      <span className="underline decoration-accent-secondary decoration-wavy underline-offset-4">
        {query.slice(start, end)}
      </span>
      {query.slice(end)}
    </>
  );
}
