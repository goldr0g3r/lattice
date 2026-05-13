# ADR-0010: Design tokens and typography

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: design, ui, theming, typography, tokens

## Context

The visual identity has to land before any UI code is written. Two
forces shape it:

1. **The product positioning** — local-first, calm, ML-engineer aesthetic.
   Not Notion's pastel-and-blocks, not Obsidian's hacker-grey-default.
   Confident, readable, slightly literary.
2. **A reference image** (cream/teal "Tealda" + deep-navy
   "Daydreaming") — the founder's chosen mood. Serif display, warm
   neutrals, one strong accent, one warm accent, a generous canvas.

We need a **token system** (not raw hex values scattered across
components), a **light + dark pair** that share semantic names, and a
**typography stack** that handles serif display, sans body, and mono
code — across Windows + Linux + Android.

This needs to be locked **before** PR #9 ([UI package](../../packages/ui)),
which encodes everything in `tokens.css` + Tailwind preset.

## Decision

We adopt **semantic CSS custom properties** as the single source of
truth, exposed as Tailwind theme tokens via a shared preset
(`packages/config/tailwind-preset`).

Token naming is **role-based, not color-based** (`--accent-primary`,
not `--teal-500`). This keeps light/dark/future-theme parity trivial
and avoids the "we have a green button on a green background" smell.

### Tokens

**Light theme** (default, "Tealda" cream)

```css
:root {
  --bg-canvas: #faf6f0;
  --bg-surface: #ffffff;
  --bg-elevated: #fffbf5;
  --text-primary: #1a1f26;
  --text-secondary: #6b7280;
  --accent-primary: #5db8a8; /* teal mint — primary CTA */
  --accent-secondary: #e85a3c; /* warm orange — tag chips */
  --border: #ece7de;
}
```

**Dark theme** ("Daydreaming" navy)

```css
[data-theme="dark"] {
  --bg-canvas: #0e1418;
  --bg-surface: #161b22;
  --bg-elevated: #1c232c;
  --text-primary: #f5f1ea;
  --text-secondary: #8b95a2;
  --accent-primary: #5db8a8; /* same teal across themes */
  --accent-secondary: #e6603d; /* orange — "# Personal" tag */
  --accent-tertiary: #a4bd52; /* olive — accent dot */
  --border: #2a3340;
}
```

### Typography

| Role | Family | Source | Sizes (Tailwind scale) |
| --- | --- | --- | --- |
| Display / headings | **Newsreader** (serif) | `@fontsource/newsreader` | `text-3xl` → `text-6xl` |
| Body / UI | **Inter** (sans) | `@fontsource/inter` | `text-sm` → `text-lg` |
| Code / monospace | **JetBrains Mono** | `@fontsource/jetbrains-mono` | `text-sm` in code blocks |

All three are self-hosted via `@fontsource/*` (offline-first, no
Google Fonts call). A `--font-fallback-serif` / `--font-fallback-sans`
/ `--font-fallback-mono` chain handles the rare unsupported glyph.

### Theme switching

- Light is the default; `prefers-color-scheme` flips to dark on first
  load if the OS prefers it.
- A `useTheme()` hook (Zustand store) persists the explicit choice
  in `localStorage`; the persisted choice wins over OS preference.

## Consequences

### Positive

- **One source of truth.** Every component pulls from CSS variables;
  themes are a single attribute flip at the `<html>` root. No
  per-component overrides.
- **Tailwind preset wraps it**, so authors write
  `bg-bg-surface text-text-primary border-border` and stay inside the
  system.
- **Distinctive look out of the gate.** Serif display + warm
  cream is rare in dev tools; matches the literary / engineering-notebook
  vibe the product is reaching for.
- **Accessibility-friendly.** All token pairs meet WCAG AA contrast
  (`--text-primary` on `--bg-canvas` ≥ 13:1 in both themes;
  `--text-secondary` on `--bg-canvas` ≥ 4.6:1).
- **Self-hosted fonts** keep the app local-first; no analytics call
  on every cold start.
- **Shared accent across themes** (the teal `--accent-primary`)
  preserves brand recognition in both modes.

### Negative

- **Three font families** add ~250 KB to the bundle (subset, woff2).
  Acceptable on desktop; on Android we'll consider a `display: swap`
  variant subset to Latin only.
- **Newsreader / Inter / JetBrains Mono** are all variable fonts — old
  Linux WebKitGTK ( ≤ 2.36 ) may render fallback weights. Mitigation:
  fallback chain.
- **No "high contrast" theme** in v0.1. Tracked for v1.0
  accessibility audit.

### Neutral

- We use `data-theme="dark"` (not the `:dark` Tailwind plugin's
  `class="dark"`) so we can add `data-theme="solarized"` etc.
  community themes in v0.9 without restructuring.
- The reference image is captured in the repo under
  `docs/research/reference-image-light-dark.png` for future-us to
  see what we were going for.

## Alternatives considered

### Option A — Color-named tokens (`--teal-500`)

- **Pros**: matches Tailwind's default palette mental model; designers
  used to it.
- **Cons**: adding a dark theme means renaming every reference; no
  semantic intent (is `--teal-500` the CTA or the border?). Hard to
  swap brand colors later.
- **Why rejected**: semantic > literal.

### Option B — Use shadcn's default tokens (`--primary`, `--muted`, etc.)

- **Pros**: copy-paste from shadcn UI scaffolds.
- **Cons**: shadcn's default palette is generic; the brand wedge gets
  lost. Also their token names mix layout and color (`--popover`,
  `--popover-foreground`) in a way that's confusing for non-shadcn
  primitives.
- **Why rejected**: we'll inherit shadcn primitives but rewire them to
  our token names in the preset.

### Option C — One sans family, no serif

- **Pros**: smaller bundle; safer.
- **Cons**: surrenders the visual wedge — the literary feel is half
  the personality.
- **Why rejected**: distinctiveness > 100 KB bundle.

### Option D — System fonts only

- **Pros**: zero bundle cost.
- **Cons**: visual fragmentation across Windows / Linux / Android (each
  ships a different system serif); brand consistency suffers.
- **Why rejected**: cross-platform consistency matters more than 250 KB.

## References

- The reference image: light "Tealda" and dark "Daydreaming"
  screenshots provided by the founder.
- [Newsreader (Production Type) on Google Fonts](https://fonts.google.com/specimen/Newsreader)
- [Inter on Google Fonts](https://rsms.me/inter/)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [Fontsource](https://fontsource.org/) — self-hosting strategy.
- [Material Design — token reference](https://m3.material.io/foundations/design-tokens/how-to-read-tokens) — naming-by-role inspiration.
- [Tailwind CSS — theme customization](https://tailwindcss.com/docs/theme).
- [WCAG 2.2 — color contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [ARCHITECTURE.md](../../ARCHITECTURE.md), [ROADMAP.md](../../ROADMAP.md) v0.1 visual-identity bullet.
