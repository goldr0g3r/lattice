/**
 * Mermaid + Excalidraw embed dispatcher contract (v0.2 PR #6 — embeds
 * slice, issue #37).
 *
 * Mounts the editor against minimal NoteDocs that contain `mermaid` /
 * `excalidraw` fenced blocks and asserts the dispatcher (see
 * `../embeds/node-view-dispatcher.ts`) routed each one to the matching
 * React node-view — i.e. `[data-mermaid]` / `[data-excalidraw]` appear
 * in the live DOM and the CodeMirror chrome (`.cm-editor`) does NOT.
 *
 * Mermaid is **mocked** at the module level for two reasons:
 *
 *   1. Mermaid's real module graph is ~1 MB minified and famously slow
 *      to evaluate inside jsdom (cold load is 10-30 s on a developer
 *      laptop and even slower in CI). Mocking keeps the routing test
 *      under a second per case so the CI matrix stays snappy.
 *   2. We're asserting **dispatch routing** + the error branch (D5),
 *      not Mermaid's parser correctness. The upstream `mermaid`
 *      package owns its own parser tests.
 *
 * The malformed-source assertion drives the mock to
 * `.mockRejectedValueOnce` so we exercise the error branch (D5)
 * without depending on Mermaid's real grammar.
 *
 * Also asserts the CodeMirror fallback (the original PR #55 path) stays
 * bit-identical for non-embed info-strings (D1), so the dispatcher
 * introduced in this PR doesn't regress the code-block UX.
 */

import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDoc } from "@lattice/core-bindings";

import { Editor } from "../Editor";
import { isExcalidrawInfo, isMermaidInfo } from "../embeds";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({
      svg: "<svg data-mermaid-mock='ok'></svg>",
      diagramType: "flowchart",
    }),
  },
}));

// Resolved lazily so the import order inside `MermaidEmbed`'s `useEffect`
// gets the same mocked module the tests configure here.
async function mermaidMock() {
  const mod = await import("mermaid");
  return vi.mocked(mod.default);
}

function fencedDoc(info: string, body: string): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [{ type: "fenced", data: { info, body } }],
  };
}

describe("fenced-block embeds dispatcher", () => {
  beforeEach(async () => {
    // TipTap touches ResizeObserver via @tiptap/react; jsdom doesn't ship it.
    if (!("ResizeObserver" in globalThis)) {
      class StubResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
      (globalThis as unknown as { ResizeObserver: typeof StubResizeObserver }).ResizeObserver =
        StubResizeObserver;
    }
    // CM6's selection layer walks Range.getClientRects on every focus /
    // dispatch; jsdom partially implements it. Stub the missing methods
    // so the CodeMirror-fallback assertion stays quiet.
    const proto = (globalThis as { Range?: { prototype: Range } }).Range?.prototype;
    if (proto && typeof proto.getClientRects !== "function") {
      Object.defineProperty(proto, "getClientRects", {
        configurable: true,
        value: () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }),
      });
    }
    if (proto && typeof proto.getBoundingClientRect !== "function") {
      Object.defineProperty(proto, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: 0,
          height: 0,
          toJSON: () => ({}),
        }),
      });
    }

    // Reset the Mermaid mock to its default happy-path resolved value
    // so each test starts from a known baseline regardless of any
    // `.mockRejectedValueOnce` set up by a previous case.
    const mermaid = await mermaidMock();
    mermaid.render.mockReset();
    mermaid.render.mockResolvedValue({
      svg: "<svg data-mermaid-mock='ok'></svg>",
      diagramType: "flowchart",
    });
    mermaid.initialize.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes a ```mermaid block to the Mermaid embed (D1)", async () => {
    const { container } = render(
      <Editor initialDoc={fencedDoc("mermaid", "flowchart LR\n  A --> B\n")} />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid]")).not.toBeNull();
    });
    expect(container.querySelector("[data-info='mermaid']")).not.toBeNull();
    // CodeMirror fallback must NOT mount alongside the Mermaid view.
    expect(container.querySelector(".cm-editor")).toBeNull();
    // Once the lazy import resolves the mock SVG should appear inline.
    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-mock]")).not.toBeNull();
    });
  });

  it("routes a ```excalidraw block to the placeholder card (D3)", async () => {
    const { container } = render(
      <Editor initialDoc={fencedDoc("excalidraw", "attachments/abc-123/system-arch.png\n")} />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-excalidraw]")).not.toBeNull();
    });
    const wrapper = container.querySelector<HTMLElement>("[data-excalidraw]");
    expect(wrapper?.textContent ?? "").toMatch(/attachments\/abc-123\/system-arch\.png/);
    const pathEl = container.querySelector<HTMLElement>("[data-excalidraw-path]");
    expect(pathEl?.textContent).toBe("attachments/abc-123/system-arch.png");
    // CodeMirror fallback must NOT mount alongside the Excalidraw view.
    expect(container.querySelector(".cm-editor")).toBeNull();
  });

  it("falls through to CodeMirror 6 for non-embed info-strings (D1 fallback)", async () => {
    const { container } = render(<Editor initialDoc={fencedDoc("typescript", "const x = 1;\n")} />);

    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).not.toBeNull();
    });
    expect(container.querySelector("[data-mermaid]")).toBeNull();
    expect(container.querySelector("[data-excalidraw]")).toBeNull();
    // CM6 picker chrome from PR #55 stays exactly as before — language
    // select on the header, `pre[data-fenced].lattice-cm-fenced` wrapper.
    const wrapper = container.querySelector("pre[data-fenced]");
    expect(wrapper?.classList.contains("lattice-cm-fenced")).toBe(true);
    const select = container.querySelector<HTMLSelectElement>("select.lattice-cm-fenced__language");
    expect(select?.value).toBe("typescript");
  });

  it("surfaces a [data-mermaid-error] for malformed diagrams (D5)", async () => {
    const mermaid = await mermaidMock();
    mermaid.render.mockRejectedValueOnce(
      new Error("Parse error on line 1: unexpected token 'oops'"),
    );

    const { container } = render(
      <Editor initialDoc={fencedDoc("mermaid", "definitelyNotAValidDiagram --!! syntax oops\n")} />,
    );

    await waitFor(() => {
      expect(container.querySelector("[data-mermaid-error]")).not.toBeNull();
    });
    const errorBlock = container.querySelector<HTMLElement>("[data-mermaid-error]");
    expect(errorBlock?.textContent ?? "").toContain("Mermaid render failed");
    expect(errorBlock?.textContent ?? "").toContain("unexpected token");
    // Raw source is shown in a sibling <pre><code> so the user can edit
    // it without scrolling away to find what they typed.
    expect(errorBlock?.querySelector("pre code")?.textContent ?? "").toContain(
      "definitelyNotAValidDiagram",
    );
  });

  it("exports info-string predicates the dispatcher uses (D1)", () => {
    expect(isMermaidInfo("mermaid")).toBe(true);
    expect(isMermaidInfo("MERMAID")).toBe(true);
    expect(isMermaidInfo(" mermaid ")).toBe(true);
    expect(isMermaidInfo("typescript")).toBe(false);
    expect(isMermaidInfo("")).toBe(false);

    expect(isExcalidrawInfo("excalidraw")).toBe(true);
    expect(isExcalidrawInfo("EXCALIDRAW")).toBe(true);
    expect(isExcalidrawInfo(" excalidraw ")).toBe(true);
    expect(isExcalidrawInfo("rust")).toBe(false);
    expect(isExcalidrawInfo("")).toBe(false);
  });
});
