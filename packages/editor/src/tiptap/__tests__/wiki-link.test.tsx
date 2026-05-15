/**
 * jsdom-side contract tests for the wiki-link autocomplete UI.
 *
 * Mirrors `slash-menu.test.tsx` — we test the React popup directly
 * (`WikiLinkMenu`) for keyboard + selection behaviour and assert the
 * `<Editor wikiLink={...}>` mount path doesn't crash. Heavy DOM
 * interaction (`[[` typing → suggestion menu opens → click row → wiki-link
 * node inserted) is fragile in jsdom because of TipTap's IME / selection
 * shims, so we keep the assertions focused on contracts rather than a
 * keystroke replay.
 */

import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDoc } from "@lattice/core-bindings";

import { Editor } from "../Editor";
import {
  WikiLinkMenu,
  type WikiLinkMenuHandle,
  type WikiLinkMenuProps,
} from "../components/WikiLinkMenu";
import type { NoteCandidate } from "../extensions/wiki-link";

function sampleNotes(): NoteCandidate[] {
  return [
    { id: "notes/alpha.md", title: "Alpha", snippet: "First note in the vault" },
    { id: "notes/beta.md", title: "Beta" },
    { id: "notes/gamma.md", title: "Gamma", snippet: "Third candidate" },
  ];
}

function sampleDoc(): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [
      {
        type: "paragraph",
        data: {
          content: [
            { type: "text", data: { value: "See " } },
            {
              type: "wiki_link",
              data: { target: "Alpha", alias: null },
            },
            { type: "text", data: { value: " for context." } },
          ],
        },
      },
    ],
  };
}

function renderMenu(overrides: Partial<WikiLinkMenuProps> = {}) {
  const ref = createRef<WikiLinkMenuHandle>();
  const command = overrides.command ?? vi.fn();
  const items = overrides.items ?? sampleNotes();
  const query = overrides.query ?? "";
  const utils = render(<WikiLinkMenu ref={ref} items={items} query={query} command={command} />);
  return { ref, command, items, utils };
}

describe("WikiLinkMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens with one row per candidate (active = first)", () => {
    const { utils, items } = renderMenu();
    const buttons = utils.container.querySelectorAll("[data-wiki-item-id]");
    expect(buttons.length).toBe(items.length);
    expect(buttons[0]?.getAttribute("data-wiki-item-active")).toBe("true");
  });

  it("renders titles and snippets when provided", () => {
    const { utils } = renderMenu();
    expect(utils.getByText("Alpha")).toBeTruthy();
    expect(utils.getByText("First note in the vault")).toBeTruthy();
    expect(utils.getByText("Beta")).toBeTruthy();
    expect(utils.getByText("Third candidate")).toBeTruthy();
  });

  it("arrow-down advances active item (D4)", () => {
    const { ref, utils, items } = renderMenu();
    act(() => {
      const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      expect(handled).toBe(true);
    });
    const active = utils.container.querySelector('[data-wiki-item-active="true"]');
    const expectedKey = items[1]?.id ?? items[1]?.title;
    expect(active?.getAttribute("data-wiki-item-id")).toBe(expectedKey);
  });

  it("arrow-up wraps backwards through the list (D4)", () => {
    const { ref, utils, items } = renderMenu();
    act(() => {
      const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      expect(handled).toBe(true);
    });
    const active = utils.container.querySelector('[data-wiki-item-active="true"]');
    const last = items[items.length - 1];
    const expectedKey = last?.id ?? last?.title;
    expect(active?.getAttribute("data-wiki-item-id")).toBe(expectedKey);
  });

  it("enter fires the active candidate's command (D4)", () => {
    const command = vi.fn();
    const { ref, items } = renderMenu({ command });
    act(() => {
      const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
      expect(handled).toBe(true);
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith(items[0]);
  });

  it("returns false for unrelated keys so TipTap can still type them", () => {
    const { ref } = renderMenu();
    const handled = ref.current?.onKeyDown(new KeyboardEvent("keydown", { key: "a" }));
    expect(handled).toBe(false);
  });

  it("renders empty-state with the typed query in the hint (D5)", () => {
    const { utils } = renderMenu({ items: [], query: "Brand New Note" });
    expect(utils.getByText("No matching notes")).toBeTruthy();
    expect(utils.getByText(/\[\[Brand New Note\]\]/)).toBeTruthy();
  });

  it("strips the |alias suffix from the empty-state hint (D5)", () => {
    const { utils } = renderMenu({ items: [], query: "Project|short" });
    expect(utils.getByText(/\[\[Project\]\]/)).toBeTruthy();
  });
});

describe("Editor wiki-link wiring", () => {
  beforeEach(() => {
    if (!("ResizeObserver" in globalThis)) {
      class StubResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
        StubResizeObserver;
    }
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a wiki-link node in the initial doc", async () => {
    const { container } = render(<Editor initialDoc={sampleDoc()} />);
    const anchor = await new Promise<Element | null>((resolve) => {
      const start = Date.now();
      const tick = () => {
        const found = container.querySelector("a[data-wiki-link]");
        if (found) return resolve(found);
        if (Date.now() - start > 2000) return resolve(null);
        setTimeout(tick, 16);
      };
      tick();
    });
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("data-target")).toBe("Alpha");
  });

  it("accepts an injected getNoteTitles + onNavigate without crashing on mount", () => {
    const getNoteTitles = vi.fn(async (_q: string) => sampleNotes());
    const onNavigate = vi.fn();
    expect(() =>
      render(<Editor initialDoc={sampleDoc()} wikiLink={{ getNoteTitles, onNavigate }} />),
    ).not.toThrow();
  });
});
