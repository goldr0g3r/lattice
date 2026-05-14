# ADR-0011: Font-loading strategy

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: ui, performance, typography, fonts, cold-start

## Context

[ADR-0010](0010-design-tokens-and-typography.md) picks **three self-hosted
font families** — Newsreader (serif display), Inter (sans body), and
JetBrains Mono (code) — wired via `@fontsource/*`. We need to load them in a
way that:

- **Meets the v0.1 cold-start budget** (<1.5 s before window paint on a CI
  runner, per the [Epic v0.1 DoD](../../.github/issues/epics.yml)).
- **Avoids flash-of-invisible-text (FOIT)** on Linux WebKitGTK, which is
  the slowest WebView in our matrix at variable-font rasterisation.
- **Doesn't ship hundreds of kilobytes** of glyphs nobody renders. Lattice
  is English-first; we can defer non-Latin coverage to v1.0 i18n.
- **Cross-platform consistency** — the same SVG glyph on Windows, Linux,
  Android within ~2 px metric tolerance.

PR #9 (`feat(ui): initial visual identity — typography, logo, app icon`)
needs this nailed down before it imports `@fontsource/*` into
`packages/ui/src/fonts.ts`.

## Decision

**We will import the Latin-subset variable-weight files of each family
from `@fontsource-variable/*` with `font-display: swap` and the
serif/sans/mono fallback chains already declared in
[ADR-0010](0010-design-tokens-and-typography.md).**

Concretely (PR #9 wiring):

```ts
// packages/ui/src/fonts.ts
import "@fontsource-variable/newsreader/index.css";       // Latin subset, variable
import "@fontsource-variable/inter/index.css";            // Latin subset, variable
import "@fontsource-variable/jetbrains-mono/index.css";   // Latin subset, variable
```

`font-display: swap` is already the default of `@fontsource-variable/*`.
The CSS variables in [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css)
declare each family with a system-font fallback chain so the OS default
paints immediately and our chosen face swaps in as soon as the file
arrives. Build-time subsetting (via `subfont` against the actual used
glyphs) is **deferred to v1.0 perf hardening** — at v0.1 the Latin
subsets already keep us under budget.

## Consequences

### Positive

- **First paint is immediate.** The system-font fallback paints under
  100 ms even on a cold Linux runner; Newsreader / Inter / Mono swap in
  within the next ~200 ms.
- **Bundle stays under ~250 KB** for the three families combined
  (Latin-subset variable woffs), comfortably within the v0.1 budget.
- **Variable fonts** mean we can dial weight/optical size in code without
  shipping a bunch of static cuts — one woff per family covers
  `text-base` through `text-6xl`.
- **`@fontsource-variable/*` is `display: swap` by default.** No FOIT;
  the brief FOUT is the same trade Notion / Linear / Vercel make and the
  audience is fine with it.

### Negative

- **Brief FOUT on cold start** — the very first paint shows in the fallback
  chain (system serif / sans / mono). Mitigation: the system serif on
  Windows (Cambria) and Linux (DejaVu Serif) are visually close enough to
  Newsreader that the swap is subtle.
- **Latin coverage only.** Users writing Cyrillic, Greek, CJK, etc. will
  see the fallback chain for those scripts in v0.1. v1.0 i18n adds the
  relevant subsets per locale.
- **WebKitGTK ≤ 2.36** doesn't honour every variable-font axis perfectly.
  We accept the cosmetic regression on stale distros and document the
  minimum WebKitGTK version in [CONTRIBUTING.md](../../CONTRIBUTING.md).

### Neutral

- The fallback chain is declared inside `tokens.css` (per
  [ADR-0010](0010-design-tokens-and-typography.md)) — no per-component
  override.
- We don't preload fonts via `<link rel="preload">` in v0.1; the swap is
  fast enough and preload bloat hurts time-to-interactive. Revisit if
  the v0.4 perf benchmarks regress.

## Alternatives considered

### Option A — `@fontsource/*` full files (all weights, all subsets)

- **Pros**: simplest possible import; one CSS line per family.
- **Cons**: ~1.2 MB combined; ships glyphs for every language nobody
  asked for; defeats our local-first "minimal cost" pitch.
- **Why rejected**: bundle-size hit isn't worth the simplicity for v0.1.

### Option C — Build-time subsetting via `subfont` in CI

- **Pros**: smallest possible bundle (only the glyphs we actually render).
- **Cons**: extra CI step; `subfont` requires a headless browser run to
  detect glyph usage; complicates the build. Save for the v1.0 perf
  push.
- **Why rejected**: complexity bait for v0.1; revisit when the JS bundle
  starts crossing real budgets.

### Option D — System fonts only

- **Pros**: zero bundle cost; no FOUT.
- **Cons**: surrenders the visual wedge — the literary serif feel is
  half of the identity per
  [ADR-0010](0010-design-tokens-and-typography.md).
- **Why rejected**: distinctiveness > 250 KB.

### Option E — Static cuts of each weight (regular / medium / bold)

- **Pros**: smallest per-weight files.
- **Cons**: needs 3+ requests per family; loses smooth weight
  interpolation. Variable fonts are objectively better here.
- **Why rejected**: variable wins on bytes + UX.

## References

- [Fontsource Variable docs](https://fontsource.org/docs/variable-fonts)
- [`font-display` swap deep-dive — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display)
- [Newsreader (Production Type)](https://fonts.google.com/specimen/Newsreader)
- [Inter — `rsms.me/inter`](https://rsms.me/inter/)
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/)
- [`subfont` CLI](https://github.com/Munter/subfont) — build-time
  subsetting tool, evaluated for v1.0.
- [ADR-0010](0010-design-tokens-and-typography.md) — the design-token
  decision that picked these three families.
