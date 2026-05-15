/**
 * `<CommandPalette>` + `WorkspaceShell` Mod+K wiring.
 *
 * Three layers tested:
 *
 *  1. Direct mount of `<CommandPalette>` with a small `AppCommand[]` —
 *     mounts on `open=true`, fuzzy-filters by the input, fires `run` +
 *     closes on Enter (covers D1 / D6 / D7 from `registry.ts`).
 *  2. `builtInCommands(ctx)` exposes the v0.2 lock-set + stubs toast for
 *     "Search notes" / "Open settings" (covers D4).
 *  3. `WorkspaceShell` mounts the palette and `Ctrl+K` toggles it (covers
 *     D2 — global keydown listener + Mod-detection fallback).
 *
 * `cmdk` is jsdom-friendly but renders into a Radix Portal. Queries go
 * through `screen.*` so we hit `document.body` rather than the test
 * container.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteContent, NoteSummary, VaultInfo } from "@lattice/core-bindings";

import { CommandPalette } from "../CommandPalette";
import { builtInCommands, type AppCommand, type CommandContext } from "../../commands/registry";

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

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    vault: null,
    notes: [],
    theme: "light",
    openVault: vi.fn(),
    switchVault: vi.fn(),
    closeVault: vi.fn(),
    openNote: vi.fn(),
    createNote: vi.fn(),
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
    openSearch: vi.fn(),
    openSettings: vi.fn(),
    togglePalette: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

function sampleCommands(ctx: CommandContext): AppCommand[] {
  return [
    {
      id: "test.alpha",
      label: "Alpha command",
      keywords: ["one", "first"],
      group: "Vault",
      run: ctx.openVault,
    },
    {
      id: "test.beta",
      label: "Beta command",
      keywords: ["two", "second"],
      group: "Notes",
      run: ctx.createNote,
    },
    {
      id: "test.gamma",
      label: "Gamma command",
      keywords: ["three"],
      group: "View",
      run: ctx.openSettings,
    },
  ];
}

describe("CommandPalette", () => {
  it("does not render the dialog body when closed", () => {
    const ctx = makeCtx();
    render(
      <CommandPalette
        open={false}
        onOpenChange={() => {}}
        commands={sampleCommands(ctx)}
        ctx={ctx}
      />,
    );
    expect(screen.queryByLabelText("Search commands")).not.toBeInTheDocument();
  });

  it("mounts the dialog with every command grouped", () => {
    const ctx = makeCtx();
    render(
      <CommandPalette open onOpenChange={() => {}} commands={sampleCommands(ctx)} ctx={ctx} />,
    );

    expect(screen.getByLabelText("Search commands")).toBeInTheDocument();
    expect(screen.getByText("Alpha command")).toBeInTheDocument();
    expect(screen.getByText("Beta command")).toBeInTheDocument();
    expect(screen.getByText("Gamma command")).toBeInTheDocument();
    expect(screen.getByText("Vault")).toBeInTheDocument();
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
  });

  it("filters items via cmdk fuzzy match on label + keywords", async () => {
    const user = userEvent.setup();
    const ctx = makeCtx();
    render(
      <CommandPalette open onOpenChange={() => {}} commands={sampleCommands(ctx)} ctx={ctx} />,
    );

    const input = screen.getByLabelText("Search commands");
    await user.type(input, "alpha");

    // cmdk leaves filtered-out items in the DOM with aria-hidden + display:none;
    // checking visibility via role lets us be robust to the exact implementation.
    await waitFor(() => {
      const visible = screen
        .getAllByRole("option")
        .filter((el) => el.getAttribute("aria-disabled") !== "true");
      const labels = visible.map((el) => el.textContent ?? "");
      expect(labels.some((l) => l.includes("Alpha"))).toBe(true);
      expect(labels.some((l) => l.includes("Beta"))).toBe(false);
      expect(labels.some((l) => l.includes("Gamma"))).toBe(false);
    });

    await user.clear(input);
    await user.type(input, "second");
    await waitFor(() => {
      const visible = screen
        .getAllByRole("option")
        .filter((el) => el.getAttribute("aria-disabled") !== "true");
      const labels = visible.map((el) => el.textContent ?? "");
      expect(labels.some((l) => l.includes("Beta"))).toBe(true);
    });
  });

  it("calls run() and onOpenChange(false) when Enter is pressed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const runAlpha = vi.fn();
    const ctx = makeCtx({ openVault: runAlpha });
    render(
      <CommandPalette open onOpenChange={onOpenChange} commands={sampleCommands(ctx)} ctx={ctx} />,
    );

    const input = screen.getByLabelText("Search commands");
    await user.type(input, "alpha");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await waitFor(() => {
      expect(runAlpha).toHaveBeenCalledTimes(1);
    });
  });

  it("renders an empty state when no commands match the query", async () => {
    const user = userEvent.setup();
    const ctx = makeCtx();
    render(
      <CommandPalette open onOpenChange={() => {}} commands={sampleCommands(ctx)} ctx={ctx} />,
    );

    await user.type(screen.getByLabelText("Search commands"), "zzznomatch");
    expect(await screen.findByText("No commands match.")).toBeInTheDocument();
  });
});

describe("builtInCommands", () => {
  it("registers the v0.2 lock-set in stable id order", () => {
    const ctx = makeCtx();
    const ids = builtInCommands(ctx).map((c) => c.id);
    expect(ids).toEqual([
      "vault.open",
      "vault.switch",
      "vault.close",
      "note.create",
      "view.search",
      "view.theme",
      "view.settings",
      "view.palette",
    ]);
  });

  it("flips the theme label according to ctx.theme", () => {
    const dark = builtInCommands(makeCtx({ theme: "dark" })).find((c) => c.id === "view.theme")!;
    const light = builtInCommands(makeCtx({ theme: "light" })).find((c) => c.id === "view.theme")!;
    expect(dark.label).toMatch(/light/i);
    expect(light.label).toMatch(/dark/i);
  });

  it("stubs Search notes with a toast (search ships in v0.3)", async () => {
    const toast = vi.fn();
    const ctx = makeCtx({ toast });
    const search = builtInCommands(ctx).find((c) => c.id === "view.search")!;
    await search.run(ctx);
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("Search"),
      expect.objectContaining({ kind: "info" }),
    );
  });
});

const NOTES: NoteSummary[] = [
  {
    id: "alpha.md",
    path: "alpha.md",
    title: "Alpha",
    modified_ms: 1_700_000_000_000,
    size_bytes: 12,
  },
  { id: "beta.md", path: "beta.md", title: "Beta", modified_ms: 1_690_000_000_000, size_bytes: 14 },
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

const VAULT: VaultInfo = { root: "/tmp/vault", note_count: NOTES.length };

describe("WorkspaceShell — Ctrl+K opens the palette", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    (window as unknown as { __TAURI_INTERNALS__: object }).__TAURI_INTERNALS__ = {};
  });

  it("listens for Ctrl+K globally and shows the palette", async () => {
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
        vault={VAULT}
        onSwitchVault={() => {}}
        onCloseVault={() => {}}
        themeToggle={null}
        versionInfo={null}
        theme="light"
        onToggleTheme={() => {}}
        onSetTheme={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("note_list");
    });

    expect(screen.queryByLabelText("Search commands")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    const input = await screen.findByLabelText("Search commands");
    expect(input).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Open vault…")).toBeInTheDocument();
    expect(within(dialog).getByText("Toggle command palette")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByText("Open note: Alpha")).toBeInTheDocument();
    });
  });

  it("Mod+K toggles the palette closed on a second press", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "note_list") return [] as NoteSummary[];
      return null;
    });

    const { WorkspaceShell } = await import("../../shell/WorkspaceShell");
    render(
      <WorkspaceShell
        vault={VAULT}
        onSwitchVault={() => {}}
        onCloseVault={() => {}}
        themeToggle={null}
        versionInfo={null}
        theme="dark"
        onToggleTheme={() => {}}
        onSetTheme={() => {}}
      />,
    );

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("note_list");
    });

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await screen.findByLabelText("Search commands");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => {
      expect(screen.queryByLabelText("Search commands")).not.toBeInTheDocument();
    });
  });
});
