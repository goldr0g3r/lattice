/**
 * `NoteList` is pure-presentational: takes `notes: NoteSummary[]` + an
 * `onSelect(path)` callback. Tauri stays out of the picture entirely here.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NoteSummary } from "@lattice/core-bindings";

import { NoteList } from "../../shell/NoteList";

function summary(over: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id: "note.md",
    path: "note.md",
    title: "Note",
    modified_ms: 1_700_000_000_000,
    size_bytes: 12,
    ...over,
  };
}

const NOTES: NoteSummary[] = [
  summary({ path: "tesla.md", title: "Tesla Illustrator Project" }),
  summary({ path: "tencent.md", title: "Tencent promotion materials" }),
  summary({ path: "plans/day-night.md", title: "Day and night plan" }),
];

describe("NoteList", () => {
  it("renders one row per note plus the header + new-note CTA", () => {
    render(<NoteList notes={NOTES} selectedPath={null} onSelect={() => {}} />);

    expect(screen.getByText("All Notes")).toBeInTheDocument();
    // Header pill shows the count.
    expect(screen.getByText(String(NOTES.length))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new note" })).toBeInTheDocument();

    const rows = screen
      .getAllByRole("button")
      .filter(
        (el) =>
          el.dataset.active !== undefined ||
          el.textContent?.includes("Tesla") ||
          el.textContent?.includes("Tencent") ||
          el.textContent?.includes("Day and night"),
      );
    expect(rows.length).toBeGreaterThanOrEqual(NOTES.length);
    expect(screen.getByText("Tesla Illustrator Project")).toBeInTheDocument();
    expect(screen.getByText("Tencent promotion materials")).toBeInTheDocument();
    expect(screen.getByText("Day and night plan")).toBeInTheDocument();
  });

  it("marks the selected row with aria-current=true", () => {
    render(<NoteList notes={NOTES} selectedPath="tencent.md" onSelect={() => {}} />);
    const active = screen.getByText("Tencent promotion materials").closest("button");
    expect(active).toHaveAttribute("aria-current", "true");

    const inactive = screen.getByText("Tesla Illustrator Project").closest("button");
    expect(inactive).not.toHaveAttribute("aria-current");
  });

  it("fires onSelect with the row's path", () => {
    const onSelect = vi.fn();
    render(<NoteList notes={NOTES} selectedPath={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("Tesla Illustrator Project").closest("button")!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("tesla.md");
  });

  it("filters by title substring when the search box gets input", () => {
    render(<NoteList notes={NOTES} selectedPath={null} onSelect={() => {}} />);

    const search = screen.getByLabelText("Search notes") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "tencent" } });

    expect(screen.getByText("Tencent promotion materials")).toBeInTheDocument();
    expect(screen.queryByText("Tesla Illustrator Project")).not.toBeInTheDocument();
    expect(screen.queryByText("Day and night plan")).not.toBeInTheDocument();
  });

  it("shows an empty-search hint when the filter excludes every row", () => {
    render(<NoteList notes={NOTES} selectedPath={null} onSelect={() => {}} />);
    const search = screen.getByLabelText("Search notes") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "zzzzzz" } });
    expect(screen.getByText(/No notes match/)).toBeInTheDocument();
  });

  it("fires onCreate when the + New note footer button is clicked", () => {
    const onCreate = vi.fn();
    render(<NoteList notes={NOTES} selectedPath={null} onSelect={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "Create new note" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state when the vault has no notes", () => {
    render(<NoteList notes={[]} selectedPath={null} onSelect={() => {}} />);
    expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
  });
});
