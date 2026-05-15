/**
 * Node-view smoke test for the CodeMirror-backed fenced block.
 *
 * We mount the full Lattice editor against a minimal NoteDoc that contains
 * a single fenced block, then assert:
 *
 *   - the rendered DOM has the CM6 `.cm-editor` class (acceptance bullet:
 *     "a code-block node renders a CodeMirror 6 instance, not a `<pre>`"),
 *   - a language `<select>` is rendered in the node-view header
 *     (acceptance bullet: "language selector dropdown at the top of the
 *     block"),
 *   - the picker carries every preloaded entry,
 *   - changing the picker value flips the underlying NoteDoc's `info`
 *     attribute (D4 — info sync via `setNodeAttribute`).
 *
 * The corpus-level "round-trips losslessly to MD" acceptance bullet is
 * already covered by `__tests__/conversion.test.ts` (13 fixtures) and
 * `src/markdown/__tests__/roundtrip.test.ts` (26 fixtures), both of
 * which stay green with zero edits in this PR.
 */

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDoc } from "@lattice/core-bindings";

import { Editor } from "../../Editor";
import { PRELOADED_LANGUAGES } from "../languages";

function fencedDoc(info: string, body: string): NoteDoc {
  return {
    frontmatter: { entries: [] },
    body: [
      {
        type: "fenced",
        data: { info, body },
      },
    ],
  };
}

describe("CodeMirror node-view", () => {
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
    // jsdom's Range.getClientRects is partially implemented and CM6's
    // selection-layer measurement walks it on every focus / dispatch — stub
    // out the missing piece so the test stderr stays clean.
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
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a CodeMirror EditorView and a language picker", async () => {
    const { container } = render(
      <Editor initialDoc={fencedDoc("typescript", "const answer = 42;\n")} />,
    );

    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).not.toBeNull();
    });

    const wrapper = container.querySelector("pre[data-fenced]");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains("lattice-cm-fenced")).toBe(true);

    const select = container.querySelector<HTMLSelectElement>("select.lattice-cm-fenced__language");
    expect(select).not.toBeNull();
    expect(select?.value).toBe("typescript");

    const optionValues = Array.from(select?.options ?? []).map((opt) => opt.value);
    expect(optionValues).toContain("");
    for (const preloaded of Object.keys(PRELOADED_LANGUAGES)) {
      expect(optionValues, `picker missing preload ${preloaded}`).toContain(preloaded);
    }
  });

  it("changing the picker updates the fenced node's `info` attribute", async () => {
    let latest: NoteDoc | null = null;
    const { container } = render(
      <Editor
        initialDoc={fencedDoc("javascript", "const x = 1;\n")}
        onChange={(doc) => {
          latest = doc;
        }}
      />,
    );

    const select = await waitFor(() => {
      const el = container.querySelector<HTMLSelectElement>("select.lattice-cm-fenced__language");
      if (!el) throw new Error("language picker not mounted yet");
      return el;
    });

    await act(async () => {
      fireEvent.change(select, { target: { value: "rust" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(latest).not.toBeNull();
      const first = latest?.body[0];
      expect(first?.type).toBe("fenced");
      if (first?.type === "fenced") {
        expect(first.data.info).toBe("rust");
        expect(first.data.body).toBe("const x = 1;\n");
      }
    });
  });

  it("falls back to plain text when the info-string is empty", async () => {
    const { container } = render(<Editor initialDoc={fencedDoc("", "anything at all\n")} />);

    await waitFor(() => {
      expect(container.querySelector(".cm-editor")).not.toBeNull();
    });

    const select = container.querySelector<HTMLSelectElement>("select.lattice-cm-fenced__language");
    expect(select?.value).toBe("");
  });
});
