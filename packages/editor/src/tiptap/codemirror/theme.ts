/**
 * CodeMirror 6 theme that consumes Lattice design tokens.
 *
 * Per D7 in [`languages.ts`](./languages.ts), every colour / font value
 * resolves to a CSS variable declared in
 * [`packages/ui/src/tokens.css`](../../../../../ui/src/tokens.css). The same
 * token round-trip CI check that gates the Tailwind preset (PR #5) keeps
 * those variables in sync. No hex codes live in this file — when both
 * themes (light / dark) need to look different, the variables change, not
 * this file.
 *
 * The theme also intentionally does NOT swap the CodeMirror highlight
 * style; CM6 ships a sensible default that adapts to the surrounding
 * editor's foreground colour, and we want the look to evolve with the
 * design system without us re-tuning syntax colours by hand. A bespoke
 * highlight style can land later (probably in v0.7 once the ML / typed
 * block UX needs it).
 */

import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Build the Lattice CM6 theme. Returns a CodeMirror `Extension` ready to
 * drop into `EditorView` `extensions`.
 *
 * The theme is dark-mode aware by virtue of the underlying CSS variables —
 * `@lattice/ui/tokens.css` re-declares `--bg-elevated`, `--text-primary`,
 * etc. under `[data-theme="dark"]` and the matching `prefers-color-scheme`
 * media query, so the editor follows the rest of the app without us
 * registering separate light / dark themes here.
 */
export function latticeCodeMirrorTheme(): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--bg-elevated)",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono)",
        fontSize: "0.875rem",
        borderRadius: "0.375rem",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.5",
        overflow: "auto",
      },
      ".cm-content": {
        caretColor: "var(--accent-primary)",
        padding: "0.5rem 0",
      },
      ".cm-line": {
        padding: "0 0.75rem",
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--accent-primary)",
        borderLeftWidth: "2px",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "color-mix(in srgb, var(--accent-primary) 22%, transparent)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--bg-elevated)",
        borderRight: "1px solid var(--border)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-mono)",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--accent-primary) 6%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
        color: "var(--text-primary)",
      },
      ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
        backgroundColor: "color-mix(in srgb, var(--accent-tertiary) 28%, transparent)",
        outline: "1px solid var(--accent-tertiary)",
      },
      ".cm-searchMatch": {
        backgroundColor: "color-mix(in srgb, var(--accent-secondary) 22%, transparent)",
        outline: "1px solid var(--accent-secondary)",
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "color-mix(in srgb, var(--accent-secondary) 45%, transparent)",
      },
      ".cm-panels": {
        backgroundColor: "var(--bg-surface)",
        borderTop: "1px solid var(--border)",
        color: "var(--text-primary)",
      },
      ".cm-tooltip": {
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "color-mix(in srgb, var(--accent-primary) 18%, transparent)",
        color: "var(--text-primary)",
      },
    },
    { dark: false },
  );
}
