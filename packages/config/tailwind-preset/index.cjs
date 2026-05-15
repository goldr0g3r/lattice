/**
 * Lattice shared Tailwind preset.
 *
 * Token names map to CSS variables defined in packages/ui/src/tokens.css.
 * Per ADR-0010, names are role-based (`bg-canvas`), not color-based
 * (`teal-500`). The token round-trip CI check (PR #5) ensures keys here
 * match the variables declared in tokens.css.
 *
 * Visual polish pass (v0.2 — `feat/shell-visual-polish`) layers the new
 * sidebar / note-list / editor / status / shadow / radius scales beside
 * the existing surface + accent + border + font tokens. Existing utility
 * names (`bg-bg-canvas`, `text-text-primary`, `bg-accent-primary`, …) are
 * preserved verbatim so v0.2 PR #58 components keep rendering without
 * edits — the new utilities are additive.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: {
          canvas: "var(--bg-canvas)",
          surface: "var(--bg-surface)",
          elevated: "var(--bg-elevated)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
        },
        accent: {
          primary: "var(--accent-primary)",
          secondary: "var(--accent-secondary)",
          tertiary: "var(--accent-tertiary)",
        },
        border: "var(--border)",
        sidebar: {
          bg: "var(--sidebar-bg)",
          fg: "var(--sidebar-fg)",
          "fg-muted": "var(--sidebar-fg-muted)",
          card: "var(--sidebar-card-bg)",
          divider: "var(--sidebar-divider)",
          "active-bg": "var(--sidebar-active-bg)",
          "active-fg": "var(--sidebar-active-fg)",
          "active-marker": "var(--sidebar-active-marker)",
          hover: "var(--sidebar-hover-bg)",
        },
        notelist: {
          bg: "var(--notelist-bg)",
          "row-active": "var(--notelist-row-active-bg)",
          "row-hover": "var(--notelist-row-hover-bg)",
          divider: "var(--notelist-divider)",
        },
        editor: {
          bg: "var(--editor-bg)",
        },
        window: {
          bg: "var(--app-window-bg)",
        },
        status: {
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          info: "var(--status-info)",
          neutral: "var(--status-neutral)",
        },
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Newsreader", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        window: "var(--shadow-window)",
      },
      lineHeight: {
        tight: "var(--leading-tight)",
        snug: "var(--leading-snug)",
      },
    },
  },
  plugins: [],
};
