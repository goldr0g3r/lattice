/**
 * KaTeX math rendering contract (v0.2 PR #5).
 *
 * Mounts the editor under jsdom with a NoteDoc that contains both an
 * inline `$E = mc^2$` node and a block `$$\int_0^1 x^2 \, dx$$` node and
 * asserts that the live `addNodeView()` DOM contains KaTeX's `.katex`
 * root class (and `.katex-display` for the block) — i.e. the
 * `MathInline` / `MathBlock` React components actually injected the
 * rendered HTML.
 *
 * `renderToString` is a pure function (it doesn't touch the DOM), so it
 * stays safe to call from headless tests; this file only proves that
 * the editor's node-view machinery wires it in (D5 in
 * `../components/MathInline.tsx`).
 */

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDoc } from "@lattice/core-bindings";

import { MathBlock } from "../components/MathBlock";
import { MathInline } from "../components/MathInline";
import { Editor } from "../Editor";

function mathDoc(): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [
      {
        type: "paragraph",
        data: {
          content: [
            { type: "text", data: { value: "Inline " } },
            { type: "math", data: { display: false, src: "E = mc^2" } },
            { type: "text", data: { value: " here." } },
          ],
        },
      },
      {
        type: "math",
        data: { src: "\\int_0^1 x^2 \\, dx" },
      },
    ],
  };
}

function malformedMathDoc(): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [
      {
        type: "paragraph",
        data: {
          content: [{ type: "math", data: { display: false, src: "\\notacommand{" } }],
        },
      },
    ],
  };
}

describe("KaTeX math rendering", () => {
  beforeEach(() => {
    if (!("ResizeObserver" in globalThis)) {
      class StubResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
        StubResizeObserver;
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders inline math via KaTeX inside the live editor DOM", async () => {
    const { container } = render(<Editor initialDoc={mathDoc()} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const inlineWrapper = container.querySelector(
      'span.lattice-math.lattice-math--inline[data-math="inline"]',
    );
    expect(inlineWrapper).not.toBeNull();
    expect(inlineWrapper?.getAttribute("data-src")).toBe("E = mc^2");
    expect(inlineWrapper?.querySelector(".katex")).not.toBeNull();
  });

  it("renders block math via KaTeX with .katex-display", async () => {
    const { container } = render(<Editor initialDoc={mathDoc()} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const blockWrapper = container.querySelector(
      'div.lattice-math.lattice-math--block[data-math="block"]',
    );
    expect(blockWrapper).not.toBeNull();
    expect(blockWrapper?.getAttribute("data-src")).toBe("\\int_0^1 x^2 \\, dx");
    expect(blockWrapper?.querySelector(".katex-display")).not.toBeNull();
    expect(blockWrapper?.querySelector(".katex")).not.toBeNull();
  });

  it("renders a katex-error span for malformed LaTeX (D3)", async () => {
    const { container } = render(<Editor initialDoc={malformedMathDoc()} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const inlineWrapper = container.querySelector('span.lattice-math[data-math="inline"]');
    expect(inlineWrapper).not.toBeNull();
    expect(inlineWrapper?.querySelector(".katex-error")).not.toBeNull();
  });

  it("MathInline / MathBlock are wired into the components barrel", () => {
    expect(MathInline).toBeTypeOf("function");
    expect(MathBlock).toBeTypeOf("function");
  });
});
