import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

// `tailwind-preset` is a CommonJS module that exports a Tailwind Config object.
// We `require` it dynamically so this test stays pure ESM-friendly.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../../..");
const TOKENS_CSS = join(REPO_ROOT, "packages/ui/src/tokens.css");
const PRESET_CJS = join(REPO_ROOT, "packages/config/tailwind-preset/index.cjs");

function extractTokenNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of css.matchAll(/--([a-z][a-z0-9-]*)\s*:/gi)) {
    names.add(match[1]!);
  }
  return names;
}

describe("design-token round-trip (PR #5)", () => {
  it("every var() reference in the preset resolves to a CSS variable declared in tokens.css", () => {
    const tokens = extractTokenNames(readFileSync(TOKENS_CSS, "utf8"));
    const preset = readFileSync(PRESET_CJS, "utf8");
    const referenced = new Set<string>();
    for (const match of preset.matchAll(/var\(--([a-z][a-z0-9-]*)\)/gi)) {
      referenced.add(match[1]!);
    }

    const orphans = [...referenced].filter((t) => !tokens.has(t));
    expect(orphans).toEqual([]);
  });

  it("tokens.css declares the role-based names ADR-0010 promises", () => {
    const tokens = extractTokenNames(readFileSync(TOKENS_CSS, "utf8"));
    const required = [
      "bg-canvas",
      "bg-surface",
      "bg-elevated",
      "text-primary",
      "text-secondary",
      "accent-primary",
      "accent-secondary",
      "border",
      "font-serif",
      "font-sans",
      "font-mono",
    ];
    for (const name of required) {
      expect(tokens.has(name), `--${name} must be declared in tokens.css`).toBe(true);
    }
  });
});
