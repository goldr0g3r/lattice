/**
 * Lattice fonts, loaded per
 * [ADR-0011](../../../docs/decisions/0011-font-loading-strategy.md).
 *
 * Imports the Latin-subset variable-weight files of each family. `font-display:
 * swap` is the default for `@fontsource-variable/*`, so the first paint uses
 * the system-fallback chain declared in `tokens.css` and the chosen face
 * swaps in as soon as the file arrives.
 *
 * Hosts (the desktop renderer, Storybook, future mobile app) `import` this
 * file once at startup; tree-shaking has nothing to remove (these are CSS
 * side-effects), and the woff files end up in the build's static assets.
 */

import "@fontsource-variable/newsreader";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

export const FONTS_LOADED = true;
