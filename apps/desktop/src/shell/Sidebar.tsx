/**
 * Left-rail navigation for the 3-column workspace shell.
 *
 * Renders the Lattice wordmark + branded mark, the nav items
 * (Home / Notes / Settings — see [`NAV_ITEMS`](./types.ts)), and a footer
 * "user" block showing the vault root + theme toggle.
 *
 * Colour comes from `--sidebar-bg` / `--sidebar-fg` / `--sidebar-fg-muted`
 * tokens (defined in [`shell.css`](../shell.css), itself token-driven so
 * dark mode + token-parity stay correct per ADR-0010).
 */

import { Home, NotebookPen, Settings as SettingsIcon } from "lucide-react";

import { Wordmark, cn } from "@lattice/ui";

import { NAV_ITEMS, type NavId } from "./types";

const ICONS: Record<NavId, typeof Home> = {
  home: Home,
  notes: NotebookPen,
  settings: SettingsIcon,
};

export interface SidebarProps {
  /** Which nav item is highlighted; renders `aria-current="page"`. */
  activeNav: NavId;
  /** Click handler — `WorkspaceShell` routes Notes → focus the rail. */
  onSelectNav: (id: NavId) => void;
  /** Vault root shown in the footer "user" block (path or vault name). */
  vaultLabel?: string;
  /** Renderer for the theme-toggle button so the shell owns the state. */
  themeToggle?: React.ReactNode;
}

export function Sidebar({ activeNav, onSelectNav, vaultLabel, themeToggle }: SidebarProps) {
  return (
    <aside
      aria-label="Workspace navigation"
      className="flex h-full flex-col bg-[color:var(--sidebar-bg)] text-[color:var(--sidebar-fg)]"
    >
      <header className="flex items-center gap-2 px-5 pb-2 pt-6">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-canvas/10 font-serif text-lg font-semibold text-[color:var(--sidebar-fg)]"
        >
          L
        </span>
        <Wordmark className="text-xl text-[color:var(--sidebar-fg)]" />
      </header>
      <nav aria-label="Primary" className="mt-6 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.id];
          const active = item.id === activeNav;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectNav(item.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary",
                active
                  ? "bg-bg-canvas/10 text-[color:var(--sidebar-fg)]"
                  : "text-[color:var(--sidebar-fg-muted)] hover:bg-bg-canvas/5 hover:text-[color:var(--sidebar-fg)]",
              )}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <footer className="flex items-center gap-3 border-t border-bg-canvas/15 px-4 py-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-canvas/15 font-serif text-base text-[color:var(--sidebar-fg)]"
        >
          {(vaultLabel ?? "?").trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[color:var(--sidebar-fg)]">Local vault</p>
          <p
            className="truncate font-mono text-[0.7rem] text-[color:var(--sidebar-fg-muted)]"
            title={vaultLabel}
          >
            {vaultLabel ?? "—"}
          </p>
        </div>
        {themeToggle}
      </footer>
    </aside>
  );
}
