/**
 * Node-side contract tests for the WikiLink extension.
 *
 * These tests run in the default (node) Vitest environment — they only
 * touch the extension's pure-data surface (factory, defaults, filter
 * helper, schema integration) so they don't need jsdom. The full DOM
 * surface (popper + keyboard handling) is exercised by the jsdom-backed
 * `wiki-link.test.tsx` suite.
 */

import { describe, expect, it } from "vitest";

import {
  defaultWikiLinkOptions,
  filterNoteCandidates,
  WikiLink,
  type NoteCandidate,
} from "../extensions/wiki-link";
import { buildExtensions, LATTICE_NODE_NAMES } from "../schema";

describe("WikiLink extension", () => {
  it("registers under the wikiLink name", () => {
    expect(WikiLink.name).toBe("wikiLink");
    expect(LATTICE_NODE_NAMES).toContain("wikiLink");
  });

  it("exposes defaults that compile stand-alone (D5 empty-state path)", async () => {
    const { getNoteTitles, onNavigate } = defaultWikiLinkOptions;
    await expect(getNoteTitles("anything")).resolves.toEqual([]);
    expect(typeof onNavigate).toBe("function");
    expect(() => onNavigate({ target: "x", alias: null })).not.toThrow();
  });

  it("preserves the data-source order (D3 — no recency override)", () => {
    const candidates: NoteCandidate[] = [{ title: "Beta" }, { title: "Alpha" }, { title: "Gamma" }];
    const all = filterNoteCandidates(candidates, "");
    expect(all.map((c) => c.title)).toEqual(["Beta", "Alpha", "Gamma"]);
  });

  it("filters case-insensitively on the part before the alias pipe (D2 + D3)", () => {
    const candidates: NoteCandidate[] = [
      { title: "Vault Setup" },
      { title: "Vector Math" },
      { title: "Wiki Linking" },
    ];
    const allV = filterNoteCandidates(candidates, "v");
    expect(allV.map((c) => c.title)).toEqual(["Vault Setup", "Vector Math"]);

    const aliased = filterNoteCandidates(candidates, "wiki|short alias");
    expect(aliased.map((c) => c.title)).toEqual(["Wiki Linking"]);

    const upper = filterNoteCandidates(candidates, "VECTOR");
    expect(upper.map((c) => c.title)).toEqual(["Vector Math"]);
  });

  it("returns a fresh array each call to keep callers from mutating defaults", () => {
    const candidates: NoteCandidate[] = [{ title: "A" }, { title: "B" }];
    const first = filterNoteCandidates(candidates, "");
    const second = filterNoteCandidates(candidates, "");
    expect(first).not.toBe(second);
    first.push({ title: "C" });
    expect(second.map((c) => c.title)).toEqual(["A", "B"]);
  });

  it("builds the canonical extension list with default WikiLink options", () => {
    const exts = buildExtensions();
    const names = exts.map((ext) => ext.name);
    expect(names).toContain("wikiLink");
  });

  it("accepts injected wikiLink options without crashing the builder", () => {
    const calls: string[] = [];
    const exts = buildExtensions({
      wikiLink: {
        getNoteTitles: async (q) => {
          calls.push(q);
          return [{ title: "Injected" }];
        },
      },
    });
    expect(exts.map((ext) => ext.name)).toContain("wikiLink");
    expect(calls).toEqual([]);
  });
});
