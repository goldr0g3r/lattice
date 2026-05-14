/**
 * Lattice shared Tailwind preset.
 *
 * Token names map to CSS variables defined in packages/ui/src/tokens.css.
 * Per ADR-0010, names are role-based (`bg-canvas`), not color-based
 * (`teal-500`). The token round-trip CI check (PR #5) ensures keys here
 * match the variables declared in tokens.css.
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
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Newsreader", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};
