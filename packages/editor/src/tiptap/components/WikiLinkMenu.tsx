/**
 * React popup that renders the `[[`-wiki-link autocomplete suggestions.
 *
 * Owned by the wiki-link extension (`extensions/wiki-link.ts`); the
 * extension instantiates this component inside a `tippy.js` popper anchored
 * at the caret, exactly the same way `SlashMenu` is hosted by
 * `extensions/slash-commands.ts`. Keyboard handling lives here so the menu
 * owns its own focus state without fighting the editor for `keydown`
 * events — the suggestion plugin only forwards events via the
 * `useImperativeHandle` `onKeyDown` hook.
 *
 * The empty-state (D5) renders a "No matching notes" row + a hint to press
 * `Esc`, so the user can keep typing `[[Some New Title]]` as plain text and
 * let the typing input-rule in `wiki-link.ts` convert it into a wiki-link
 * node when they close the brackets.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

import type { NoteCandidate } from "../extensions/wiki-link";

export interface WikiLinkMenuProps {
  items: readonly NoteCandidate[];
  /** Raw query text typed after `[[` (used for the empty-state hint). */
  query: string;
  command: (item: NoteCandidate) => void;
}

export interface WikiLinkMenuHandle {
  /** Called from the suggestion plugin on every relevant keydown. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const WikiLinkMenu = forwardRef<WikiLinkMenuHandle, WikiLinkMenuProps>(function WikiLinkMenu(
  { items, query, command },
  ref,
) {
  const [selected, setSelected] = useState(0);

  // Reset selection when the filtered list shrinks past the current cursor.
  useEffect(() => {
    if (selected >= items.length) setSelected(0);
  }, [items.length, selected]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event: KeyboardEvent): boolean => {
        if (event.key === "ArrowDown") {
          if (items.length === 0) return true;
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          if (items.length === 0) return true;
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          const target = items[selected];
          if (target) command(target);
          return true;
        }
        return false;
      },
    }),
    [items, selected, command],
  );

  const rendered = useMemo(
    () =>
      items.map((item, index) => {
        const isActive = index === selected;
        const itemKey = item.id ?? item.title;
        return (
          <button
            key={itemKey}
            type="button"
            data-wiki-item-id={itemKey}
            data-wiki-item-active={isActive ? "true" : undefined}
            className="lattice-wiki-link-item"
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              command(item);
            }}
          >
            <span className="lattice-wiki-link-title">{item.title}</span>
            {item.snippet && <span className="lattice-wiki-link-snippet">{item.snippet}</span>}
          </button>
        );
      }),
    [items, selected, command],
  );

  if (items.length === 0) {
    const displayQuery = query.split("|", 1)[0] ?? "";
    return (
      <div className="lattice-wiki-link-menu" role="listbox" aria-label="Wiki-link suggestions">
        <div className="lattice-wiki-link-empty">
          <span>No matching notes</span>
          <span className="lattice-wiki-link-hint">
            {`Press Esc to keep typing [[${displayQuery}]] as plain text`}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="lattice-wiki-link-menu" role="listbox" aria-label="Wiki-link suggestions">
      {rendered}
    </div>
  );
});
