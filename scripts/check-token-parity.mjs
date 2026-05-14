#!/usr/bin/env node
/**
 * Lattice token parity check (PR #5).
 *
 * Verifies the role-based tokens declared in `packages/ui/src/tokens.css`
 * (per [ADR-0010](docs/decisions/0010-design-tokens-and-typography.md)) are
 * all exposed as Tailwind utilities by
 * `packages/config/tailwind-preset/index.cjs`, and that the preset doesn't
 * reference any `var(--...)` that the CSS file doesn't declare.
 *
 * Exits 0 when both sets match, 1 with a unified diff when they drift.
 *
 * Run locally:   node scripts/check-token-parity.mjs
 * Run in CI:     pnpm tokens:check
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_CSS = join(REPO_ROOT, "packages/ui/src/tokens.css");
const PRESET_CJS = join(REPO_ROOT, "packages/config/tailwind-preset/index.cjs");

// Tokens that the preset deliberately doesn't expose as Tailwind utilities.
// Keep this list short and document the reason inline.
const PRESET_EXCLUSIONS = new Set([
  // Font-stack variables are consumed via `fontFamily.{serif,sans,mono}`, not as
  // standalone Tailwind utility variables.
  "font-serif",
  "font-sans",
  "font-mono",
]);

function parseTokensCss(text) {
  // Capture every `--token-name:` declaration regardless of which selector
  // block it's in. We're checking *which* names exist, not their values.
  const tokens = new Set();
  for (const match of text.matchAll(/--([a-z][a-z0-9-]*)\s*:/gi)) {
    tokens.add(match[1]);
  }
  return tokens;
}

function parsePresetVars(text) {
  const tokens = new Set();
  for (const match of text.matchAll(/var\(--([a-z][a-z0-9-]*)\)/gi)) {
    tokens.add(match[1]);
  }
  return tokens;
}

function diff(label, expected, actual) {
  const missing = [...expected].filter((t) => !actual.has(t)).sort();
  const extra = [...actual].filter((t) => !expected.has(t)).sort();
  if (missing.length === 0 && extra.length === 0) return null;
  const lines = [`${label} mismatch:`];
  for (const t of missing) lines.push(`  - missing: --${t}`);
  for (const t of extra) lines.push(`  + extra:   --${t}`);
  return lines.join("\n");
}

function withoutExclusions(set) {
  return new Set([...set].filter((t) => !PRESET_EXCLUSIONS.has(t)));
}

function main() {
  const tokensText = readFileSync(TOKENS_CSS, "utf8");
  const presetText = readFileSync(PRESET_CJS, "utf8");

  const declared = parseTokensCss(tokensText);
  const referenced = parsePresetVars(presetText);

  // Exclusions apply to both sides — they are tokens we know live only in CSS
  // (e.g. font stacks consumed via `fontFamily` instead of utility classes).
  const declaredCompared = withoutExclusions(declared);
  const referencedCompared = withoutExclusions(referenced);

  const issues = [];

  const missingInPreset = diff(
    "Token declared in tokens.css but not exposed in Tailwind preset",
    declaredCompared,
    referencedCompared,
  );
  if (missingInPreset) issues.push(missingInPreset);

  const orphanInPreset = diff(
    "Token referenced in Tailwind preset but not declared in tokens.css",
    referenced,
    declared,
  );
  if (orphanInPreset) issues.push(orphanInPreset);

  if (issues.length > 0) {
    console.error("\u2716 token-parity check failed\n");
    for (const block of issues) console.error(block + "\n");
    console.error(
      "Fix by editing both `packages/ui/src/tokens.css` and `packages/config/tailwind-preset/index.cjs` together.",
    );
    process.exit(1);
  }

  console.info(
    `\u2713 token-parity: ${referenced.size} tokens in sync (${PRESET_EXCLUSIONS.size} excluded)`,
  );
}

main();
