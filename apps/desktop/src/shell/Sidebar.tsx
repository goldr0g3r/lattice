/**
 * Left-rail navigation for the 3-column workspace shell.
 *
 * Renders the Lattice wordmark + branded mark, the nav items
 * (Home / Notes / Settings — see [`NAV_ITEMS`](./types.ts)), and a footer
 * "user" block showing the vault name + an avatar initial + the theme
 * toggle.
 *
 * # Visual polish pass (v0.2 PR #6 — `feat/shell-visual-polish`)
 *
 *  - **Active row.** Light mode applies a darker sage tint
 *    (`--sidebar-active-bg`) with a 3 px white left-edge marker
 *    (`--sidebar-active-marker`) — matches the "Elephant" reference.
 *    Dark mode swaps to a solid blue pill (`--sidebar-active-bg:
 *    #3b82f6`) with no marker, matching the deep-slate reference.
 *    The marker token is `transparent` in dark so the left-edge bar
 *    visually vanishes without a conditional class.
 *  - **Inactive row.** Uses `--sidebar-fg-muted` text with a tiny
 *    hover lift (`--sidebar-hover-bg`).
 *  - **User chip.** Renders the vault name + path under a circle
 *    holding the first letter of the vault. **No** "Apple Designer"
 *    subtitle from the reference — surfacing a fake job title for an
 *    on-disk vault would be dishonest UX. Theme toggle lives next to
 *    the chip so the editor pane keeps full vertical room.
 *
 * Colour comes exclusively from `--sidebar-*` tokens (defined in
 * [`tokens.css`](../../../../packages/ui/src/tokens.css)). The bar/pill
 * shape works in both themes because both `--sidebar-active-bg` and
 * `--sidebar-active-marker` are theme-scoped.
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

function vaultDisplayName(label: string | undefined): string {
  if (!label) return "Local vault";
  const trimmed = label.replace(/[\\/]+$/u, "");
  const segments = trimmed.split(/[\\/]+/u).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1]! : "Local vault";
}

export function Sidebar({ activeNav, onSelectNav, vaultLabel, themeToggle }: SidebarProps) {
  const initial = (vaultLabel ?? "?").trim().charAt(0).toUpperCase() || "?";
  const displayName = vaultDisplayName(vaultLabel);

  return (
    <aside
      aria-label="Workspace navigation"
      className="flex h-full flex-col bg-sidebar-bg text-sidebar-fg"
    >
      <header className="flex items-center gap-2 px-5 pb-2 pt-7">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-card font-serif text-lg font-semibold text-sidebar-fg"
        >
          L
        </span>
        <Wordmark className="text-xl tracking-tight text-sidebar-fg" />
      </header>
      <nav aria-label="Primary" className="mt-7 flex flex-1 flex-col gap-1 px-3">
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
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium leading-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-0",
                active
                  ? "bg-sidebar-active-bg text-sidebar-active-fg"
                  : "text-sidebar-fg-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-sidebar-active-marker"
                />
              )}
              <Icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <footer className="flex items-center gap-3 border-t border-sidebar-divider px-4 py-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-card font-serif text-base text-sidebar-fg"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-sidebar-fg">{displayName}</p>
          <p className="truncate font-mono text-[0.7rem] text-sidebar-fg-muted" title={vaultLabel}>
            {vaultLabel ?? "—"}
          </p>
        </div>
        {themeToggle}
      </footer>
    </aside>
  );
}
