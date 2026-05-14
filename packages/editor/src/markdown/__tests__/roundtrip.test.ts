/**
 * Round-trip the golden corpus through the TS parser + serializer.
 *
 * Mirror of `core/lattice-core/tests/markdown_roundtrip.rs`; both gates must
 * stay green on every PR so the editor (TS) and core (Rust) implementations
 * agree on byte-identical canonical output.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parse, serialize } from "../index";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CORPUS_DIR = resolve(HERE, "../../../../../tests/markdown-roundtrip");

function fixtures(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .map((name) => join(CORPUS_DIR, name))
    .sort();
}

function normalise(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

describe("markdown round-trip", () => {
  const cases = fixtures();
  if (cases.length === 0) {
    throw new Error(`no fixtures found in ${CORPUS_DIR}`);
  }
  for (const path of cases) {
    const name = path.split(/[/\\]/).pop()!;
    it(`round-trips ${name}`, () => {
      const input = normalise(readFileSync(path, "utf8"));
      const doc = parse(input);
      const output = serialize(doc);
      expect(output).toBe(input);
    });
  }
});

describe("expected ast parity", () => {
  for (const path of fixtures()) {
    const expectedPath = path.replace(/\.md$/, ".expected.json");
    const name = path.split(/[/\\]/).pop()!;
    it(`matches expected.json for ${name}`, () => {
      let expectedRaw: string;
      try {
        expectedRaw = readFileSync(expectedPath, "utf8");
      } catch {
        // expected.json may be absent during early iteration; CI regenerates them.
        return;
      }
      const input = normalise(readFileSync(path, "utf8"));
      const doc = parse(input);
      const actual = JSON.stringify(doc, null, 2);
      const expected = normalise(expectedRaw).trim();
      expect(actual.trim()).toBe(expected);
    });
  }
});
