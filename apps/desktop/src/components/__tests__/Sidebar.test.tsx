/**
 * Sidebar — smoke + a11y. The component is pure (no IPC, no globals)
 * so the test only mounts it and checks structure.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { Sidebar } from "../../shell/Sidebar";
import { NAV_ITEMS, type NavId } from "../../shell/types";

describe("Sidebar", () => {
  it("renders the wordmark + every NAV_ITEMS entry as a button", () => {
    render(<Sidebar activeNav="notes" onSelectNav={() => {}} vaultLabel="/tmp/vault" />);

    expect(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
    expect(screen.getByLabelText("Lattice")).toBeInTheDocument();

    for (const item of NAV_ITEMS) {
      expect(screen.getByRole("button", { name: item.label })).toBeInTheDocument();
    }
  });

  it.each<[NavId]>([["home"], ["notes"], ["settings"]])(
    "marks %s as the active nav row with aria-current=page",
    (id) => {
      render(<Sidebar activeNav={id} onSelectNav={() => {}} />);
      const label = NAV_ITEMS.find((n) => n.id === id)!.label;
      const active = screen.getByRole("button", { name: label });
      expect(active).toHaveAttribute("aria-current", "page");

      for (const other of NAV_ITEMS) {
        if (other.id === id) continue;
        const node = screen.getByRole("button", { name: other.label });
        expect(node).not.toHaveAttribute("aria-current");
      }
    },
  );

  it("calls onSelectNav with the clicked item's id", () => {
    const onSelect = vi.fn();
    render(<Sidebar activeNav="notes" onSelectNav={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, "home");
    expect(onSelect).toHaveBeenNthCalledWith(2, "settings");
  });

  it("surfaces the vault label in the footer", () => {
    render(
      <Sidebar activeNav="notes" onSelectNav={() => {}} vaultLabel="/Users/me/Documents/Vault" />,
    );
    expect(screen.getByText("/Users/me/Documents/Vault")).toBeInTheDocument();
    expect(screen.getByText("Local vault")).toBeInTheDocument();
  });
});
