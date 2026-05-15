/**
 * NoteDoc <-> ProseMirror JSON conversion contract.
 *
 * For every fixture in `tests/markdown-roundtrip/` we run
 * `proseMirrorToNoteDoc(noteDocToProseMirror(parse(md)))` and assert deep
 * equality with `parse(md)`. The pair must be lossless so the editor can
 * load and save vault files without diverging from the on-disk Markdown.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parse } from "../../markdown";
import { noteDocToProseMirror } from "../from-doc";
import { proseMirrorToNoteDoc } from "../to-doc";

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

describe("noteDoc <-> proseMirror conversion", () => {
  const cases = fixtures();
  if (cases.length === 0) {
    throw new Error(`no fixtures found in ${CORPUS_DIR}`);
  }
  for (const path of cases) {
    const name = path.split(/[/\\]/).pop()!;
    it(`round-trips ${name}`, () => {
      const md = normalise(readFileSync(path, "utf8"));
      const doc = parse(md);
      const pm = noteDocToProseMirror(doc);
      const back = proseMirrorToNoteDoc(pm, doc.frontmatter);
      expect(back).toEqual(doc);
    });
  }
});
