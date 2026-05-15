/**
 * Integration test for `WorkspaceShell`.
 *
 * Mounts the real component with `vault_list_notes` / `vault_read_note`
 * (i.e. our `note_list` + `note_read` Tauri commands) mocked via vitest's
 * `vi.mock(...)` to return a 2-note fixture. Asserts that:
 *
 *   1. The sidebar + note list + editor pane all mount.
 *   2. The first note is auto-selected and its title shows in the editor pane.
 *   3. Clicking a different row swaps the active title.
 *
 * The `@lattice/editor` import is stubbed to a tiny stand-in so we don't
 * have to spin up TipTap + ProseMirror under jsdom (those have their own
 * mount tests over in `packages/editor/src/tiptap/__tests__/`).
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteContent, NoteSummary, VaultInfo } from "@lattice/core-bindings";

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(async () => () => {}),
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock("@lattice/editor", () => ({
  Editor: ({ initialDoc }: { initialDoc: { body: unknown[] } }) => (
    <div data-testid="mock-editor">{`editor:${initialDoc.body.length}`}</div>
  ),
}));

const NOTES: NoteSummary[] = [
  {
    id: "first.md",
    path: "first.md",
    title: "First note",
    modified_ms: 1_700_000_000_000,
    size_bytes: 10,
  },
  {
    id: "second.md",
    path: "second.md",
    title: "Second note",
    modified_ms: 1_690_000_000_000,
    size_bytes: 20,
  },
];

function makeContent(summary: NoteSummary): NoteContent {
  return {
    summary,
    raw: `# ${summary.title}\n`,
    doc: {
      frontmatter: { entries: [] },
      body: [
        {
          type: "heading",
          data: {
            level: 1,
            content: [{ type: "text", data: { value: summary.title } }],
          },
        },
      ],
    },
  };
}

const vault: VaultInfo = { root: "/tmp/vault", note_count: NOTES.length };

beforeEach(() => {
  invokeMock.mockReset();
  // Pretend we're inside the Tauri runtime so the renderer flips on its IO.
  (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};
});

describe("WorkspaceShell", () => {
  it("mounts the three columns and auto-opens the newest note", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { path?: string }) => {
      if (cmd === "note_list") return NOTES;
      if (cmd === "note_read") {
        const path = args?.path ?? "";
        const summary = NOTES.find((n) => n.path === path);
        if (!summary) throw new Error(`unexpected note_read for ${path}`);
        return makeContent(summary);
      }
      return null;
    });

    const { WorkspaceShell } = await import("../../shell/WorkspaceShell");
    render(
      <WorkspaceShell
        vault={vault}
        onSwitchVault={() => {}}
        onCloseVault={() => {}}
        themeToggle={null}
        versionInfo={null}
        theme="light"
        onToggleTheme={() => {}}
        onSetTheme={() => {}}
      />,
    );

    expect(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
    const rail = screen.getByLabelText("Notes in this vault");
    expect(rail).toBeInTheDocument();
    expect(screen.getByLabelText("Note editor")).toBeInTheDocument();

    // Both columns end up showing "First note" once auto-open lands (it's
    // the rail row + the editor pane's `<h1 aria-label="Note title">`), so
    // scope the rail assertions to the rail section.
    await within(rail).findByText("First note");
    expect(within(rail).getByText("Second note")).toBeInTheDocument();

    await waitFor(() => {
      const editor = screen.getByTestId("mock-editor");
      expect(editor.textContent).toBe("editor:1");
    });

    expect(invokeMock).toHaveBeenCalledWith("note_list");
    expect(invokeMock).toHaveBeenCalledWith("note_read", { path: "first.md" });
  });

  it("switches the editor when a different row is clicked", async () => {
    invokeMock.mockImplementation(async (cmd: string, args?: { path?: string }) => {
      if (cmd === "note_list") return NOTES;
      if (cmd === "note_read") {
        const summary = NOTES.find((n) => n.path === args?.path);
        return summary ? makeContent(summary) : null;
      }
      return null;
    });

    const { WorkspaceShell } = await import("../../shell/WorkspaceShell");
    render(
      <WorkspaceShell
        vault={vault}
        onSwitchVault={() => {}}
        onCloseVault={() => {}}
        themeToggle={null}
        versionInfo={null}
        theme="light"
        onToggleTheme={() => {}}
        onSetTheme={() => {}}
      />,
    );

    // Wait for auto-selection to settle.
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("note_read", { path: "first.md" });
    });

    const rail = screen.getByLabelText("Notes in this vault");
    const secondRow = within(rail).getByText("Second note").closest("button");
    expect(secondRow).not.toBeNull();
    secondRow!.click();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("note_read", { path: "second.md" });
    });

    await waitFor(() => {
      const header = screen.getByLabelText("Note title");
      expect(header.textContent).toBe("Second note");
    });
  });
});
