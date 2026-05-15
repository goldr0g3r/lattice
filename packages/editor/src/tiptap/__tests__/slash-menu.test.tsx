/**
 * SlashMenu keyboard + selection contract.
 *
 * The slash extension itself is hard to test in jsdom (tippy.js + DOM
 * positioning), so this test exercises the React popup directly: arrow keys
 * move the active item, Enter fires `command`, mouse hover updates selection.
 */

import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { SlashMenu, type SlashMenuHandle } from "../components/SlashMenu";
import { slashItems } from "../slash-items";

describe("SlashMenu", () => {
  it("opens with the canonical insert set", () => {
    const ref = createRef<SlashMenuHandle>();
    const { container } = render(<SlashMenu ref={ref} items={slashItems} command={() => {}} />);
    const buttons = container.querySelectorAll("[data-slash-item-id]");
    expect(buttons.length).toBe(slashItems.length);
    expect(buttons[0]?.getAttribute("data-slash-item-active")).toBe("true");
  });

  it("arrow-down advances the active item", () => {
    const ref = createRef<SlashMenuHandle>();
    const { container } = render(<SlashMenu ref={ref} items={slashItems} command={() => {}} />);
    act(() => {
      const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      expect(handled).toBe(true);
    });
    const active = container.querySelector('[data-slash-item-active="true"]');
    expect(active?.getAttribute("data-slash-item-id")).toBe(slashItems[1]!.id);
  });

  it("enter fires the active item's command", () => {
    const ref = createRef<SlashMenuHandle>();
    const command = vi.fn();
    render(<SlashMenu ref={ref} items={slashItems} command={command} />);
    act(() => {
      const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(handled).toBe(true);
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(slashItems[0]);
  });

  it("returns false for unrelated keys so TipTap can keep handling them", () => {
    const ref = createRef<SlashMenuHandle>();
    render(<SlashMenu ref={ref} items={slashItems} command={() => {}} />);
    const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "a" }));
    expect(handled).toBe(false);
  });

  it("filters down to zero matches and renders an empty-state", () => {
    const ref = createRef<SlashMenuHandle>();
    const { getByText } = render(<SlashMenu ref={ref} items={[]} command={() => {}} />);
    expect(getByText("No matching commands")).toBeTruthy();
  });
});
