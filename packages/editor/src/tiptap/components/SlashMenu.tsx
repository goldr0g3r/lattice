/**
 * React popup that renders the slash command items.
 *
 * Owned by the slash-command extension (`extensions/slash-commands.ts`); the
 * extension instantiates this component inside a `tippy.js` popper anchored
 * at the caret. Keyboard handling lives here so the menu owns its own focus
 * state without fighting the editor for `keydown` events.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";

import type { SlashItem } from "../slash-items";

export interface SlashMenuProps {
  items: readonly SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuHandle {
  /** Called from the suggestion plugin on every relevant keydown. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
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
        const Icon = item.icon;
        const isActive = index === selected;
        return (
          <button
            key={item.id}
            type="button"
            data-slash-item-id={item.id}
            data-slash-item-active={isActive ? "true" : undefined}
            className="lattice-slash-item"
            onMouseEnter={() => setSelected(index)}
            onMouseDown={(event) => {
              event.preventDefault();
              command(item);
            }}
          >
            <Icon aria-hidden="true" size={16} />
            <span>{item.label}</span>
          </button>
        );
      }),
    [items, selected, command],
  );

  if (items.length === 0) {
    return (
      <div className="lattice-slash-menu" role="listbox" aria-label="Slash commands">
        <div className="lattice-slash-empty">No matching commands</div>
      </div>
    );
  }

  return (
    <div className="lattice-slash-menu" role="listbox" aria-label="Slash commands">
      {rendered}
    </div>
  );
});
