# How to add a design token

> Tokens are the only way colour, font, and spacing roles enter the
> codebase. The token system is locked by
> [ADR-0010](../decisions/0010-design-tokens-and-typography.md);
> parity between CSS and Tailwind is checked by `pnpm tokens:check`.

## When to do it

You're styling a new surface and the existing tokens don't cover the
role you need. Examples:

- A **new component variant** ("a deeper surface for the footer" →
  add `--bg-deep` if no existing token fits).
- A **new theme** beyond light + dark (community colour scheme).
- A **new typography role** (a UI-display variant separate from body
  / display / mono).

Don't add a token when:

- An existing one has the right semantic. Reuse `--accent-primary`,
  don't ship `--accent-cta-button-color`.
- The value is a one-off arbitrary tweak. Use a Tailwind utility on
  an existing token instead.

The role-based naming convention from
[ADR-0010](../decisions/0010-design-tokens-and-typography.md) is
**non-negotiable**: `--accent-primary`, not `--teal-500`. Color and
intent are separate axes.

## Steps

Three places to touch — all in the same PR.

### 1. Declare the token in `tokens.css`

Edit [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css).
Tokens declared in `:root` apply to the light theme; under
`[data-theme="dark"]` they override for the dark theme. Both
declarations must exist:

```css
:root {
  /* … existing tokens … */
  --bg-deep: #ece1ce;
}

[data-theme="dark"] {
  /* … existing tokens … */
  --bg-deep: #0a1015;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* … existing fallbacks … */
    --bg-deep: #0a1015;
  }
}
```

The third block — the `prefers-color-scheme` fallback — exists so
that the OS dark-mode preference applies before the user has
explicitly chosen a theme. Forgetting it means a fresh-install user
on a dark OS sees light tokens until they touch the theme toggle.

### 2. Expose it in the Tailwind preset

Edit [`packages/config/tailwind-preset/index.cjs`](../../packages/config/tailwind-preset/index.cjs).
Find the relevant `theme.extend.*` map and add the new token:

```js
// packages/config/tailwind-preset/index.cjs
module.exports = {
  theme: {
    extend: {
      backgroundColor: {
        "bg-canvas": "var(--bg-canvas)",
        "bg-surface": "var(--bg-surface)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-deep": "var(--bg-deep)", // ← add here
        // …
      },
      // …
    },
  },
};
```

The Tailwind utility class is named after the token — `--bg-deep`
becomes `bg-bg-deep`. The double prefix looks odd at first; it
makes "is this Tailwind's default `bg-blue-500` or a Lattice token?"
unambiguous.

### 3. Run the parity check

```bash
pnpm tokens:check
```

Expected output:

```text
✓ token-parity: <N> tokens in sync (3 excluded)
```

If the script reports `missing` or `extra`, the two files have drifted
— go back to whichever side you missed.

### 4. Use the token

```tsx
<footer className="bg-bg-deep border-t border-border" />
```

Or in a CSS file when reuse argues for it:

```css
.deep-surface {
  background-color: var(--bg-deep);
}
```

### 5. Lint and test

```bash
pnpm format:write
pnpm lint
pnpm typecheck
pnpm tokens:check
```

If you added a token that's part of a component's contract, add a
test asserting the component picks up the right CSS variable:

```tsx
import { render, screen } from "@testing-library/react";
import { Footer } from "./Footer";

it("uses --bg-deep on the footer surface", () => {
  render(<Footer />);
  const el = screen.getByRole("contentinfo");
  expect(getComputedStyle(el).backgroundColor).not.toBe(""); // jsdom doesn't resolve var(); just assert it's set.
});
```

For real colour assertions, use Playwright (post-v0.3) — jsdom
doesn't resolve CSS custom properties.

## Verify

End-to-end check:

```bash
git diff --stat packages/ui/src/tokens.css packages/config/tailwind-preset/index.cjs
# should show TWO files changed in the same PR.

pnpm tokens:check
# should print "✓ token-parity: …"

pnpm tauri:dev
# the new utility class should resolve to the right value in the
# running app's devtools (Computed pane → check the resolved color).
```

## Common issues

### `tokens:check` reports `missing`

The token is declared in `tokens.css` but not exposed in the
preset. Add it to the relevant `theme.extend.*` map.

### `tokens:check` reports `extra`

The token is referenced in the preset but not declared in
`tokens.css`. Either remove the preset reference (it's stale) or add
the declaration (you forgot it).

### The new token doesn't apply

Three causes:

1. The CSS file isn't imported. Check `apps/desktop/src/main.tsx`
   imports `@lattice/ui/tokens.css` (it does as of v0.1).
2. The Tailwind preset isn't picked up. Check
   `apps/desktop/tailwind.config.ts` references the preset.
3. You used Tailwind's default token name (`bg-blue-500`) instead of
   the Lattice utility (`bg-accent-primary`). Tailwind's defaults are
   not part of our system.

### The new token clashes with light vs dark

Test both themes — toggle via Settings or by manually setting
`document.documentElement.dataset.theme = "dark"` in the devtools
console. If the colour looks wrong in one theme, the override in
`tokens.css` is missing or wrong.

### A high-contrast / accessibility regression

`--text-primary` on `--bg-canvas` must hit WCAG AA contrast (≥ 4.5:1
for normal text, ≥ 3:1 for large). Verify with the Lighthouse audit
in the WebView devtools, or with a contrast-checker browser
extension. v1.0 has a full WCAG 2.2 AA audit; don't regress us.

## References

- [ADR-0010 — Design tokens and typography](../decisions/0010-design-tokens-and-typography.md)
- [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css) —
  the source of truth.
- [`packages/config/tailwind-preset/index.cjs`](../../packages/config/tailwind-preset/index.cjs)
  — the Tailwind side.
- [`scripts/check-token-parity.mjs`](../../scripts/check-token-parity.mjs)
  — the parity script run by `pnpm tokens:check`.
- [Tailwind: Extending the default theme](https://tailwindcss.com/docs/theme#extending-the-default-theme)
  — upstream docs.
