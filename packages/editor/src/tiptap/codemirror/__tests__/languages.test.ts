/**
 * Language registry contract for the CodeMirror node-view.
 *
 * Verifies the preload / lazy split documented in
 * [`languages.ts`](../languages.ts) (D1):
 *
 *   - At least 20 distinct preloaded entries.
 *   - Aliases resolve to the canonical preload entries.
 *   - Lazy entries resolve for at least three known long-tail languages.
 *   - Unknown info-strings degrade to `null` so the node-view falls back
 *     to plain text instead of throwing.
 */

import { describe, expect, it } from "vitest";

import {
  LANGUAGE_ALIASES,
  LAZY_ALIASES,
  LAZY_LANGUAGES,
  PRELOADED_LANGUAGES,
  getLanguage,
  getPreloadedLanguage,
  knownLanguageIds,
  languageMenuItems,
  normalizeInfo,
  resolveCanonicalId,
} from "../languages";

describe("language registry", () => {
  it("preloads at least 20 distinct entries (acceptance bullet)", () => {
    const ids = Object.keys(PRELOADED_LANGUAGES);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it("preloads every language called out in issue #34", () => {
    const required = [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "java",
      "cpp",
      "json",
      "yaml",
      "markdown",
      "html",
      "css",
      "sql",
      "xml",
      "php",
      "shell",
    ];
    for (const id of required) {
      expect(PRELOADED_LANGUAGES, `missing preload for ${id}`).toHaveProperty(id);
    }
  });

  it("resolves the common Markdown aliases (js, ts, py, rs, yml, md, bash)", () => {
    const aliasCases: Array<[string, string]> = [
      ["js", "javascript"],
      ["ts", "typescript"],
      ["py", "python"],
      ["rs", "rust"],
      ["yml", "yaml"],
      ["md", "markdown"],
      ["bash", "shell"],
      ["sh", "shell"],
      ["c++", "cpp"],
    ];
    for (const [alias, canonical] of aliasCases) {
      expect(resolveCanonicalId(alias)).toBe(canonical);
    }
  });

  it("normalises uppercase + trailing-metadata info strings", () => {
    expect(normalizeInfo("TypeScript")).toBe("typescript");
    expect(normalizeInfo("  rust  ")).toBe("rust");
    expect(normalizeInfo("ts file=foo.ts")).toBe("ts");
    expect(normalizeInfo("")).toBe("");
  });

  it("synchronously hands back preloaded language support", () => {
    const support = getPreloadedLanguage("typescript");
    expect(support).not.toBeNull();
    expect(support?.language).toBeDefined();
  });

  it("synchronously returns null for lazy + unknown entries", () => {
    expect(getPreloadedLanguage("ruby")).toBeNull();
    expect(getPreloadedLanguage("not-a-language")).toBeNull();
    expect(getPreloadedLanguage("")).toBeNull();
  });

  it("lazy-loads at least three known long-tail languages", async () => {
    const lazyTargets = ["ruby", "perl", "swift"];
    for (const id of lazyTargets) {
      expect(LAZY_LANGUAGES, `lazy registry missing ${id}`).toHaveProperty(id);
      const support = await getLanguage(id);
      expect(support, `getLanguage(${id}) must resolve a LanguageSupport`).not.toBeNull();
      expect(support?.language).toBeDefined();
    }
  });

  it("lazy aliases route to lazy canonical ids", async () => {
    const aliasCases: Array<[string, string]> = [
      ["rb", "ruby"],
      ["pl", "perl"],
      ["pwsh", "powershell"],
      ["c#", "csharp"],
    ];
    for (const [alias, canonical] of aliasCases) {
      expect(resolveCanonicalId(alias)).toBe(canonical);
      expect(LAZY_LANGUAGES, `lazy registry missing canonical for ${alias}`).toHaveProperty(
        canonical,
      );
    }
  });

  it("returns null for completely unknown info-strings", async () => {
    expect(resolveCanonicalId("not-a-language")).toBeNull();
    expect(await getLanguage("not-a-language")).toBeNull();
    expect(await getLanguage("")).toBeNull();
  });

  it("language picker items put `Plain text` first and list every canonical entry", () => {
    const items = languageMenuItems();
    expect(items[0]?.id).toBe("");
    expect(items[0]?.label).toBe("Plain text");
    const ids = items.map((item) => item.id);
    for (const preloaded of Object.keys(PRELOADED_LANGUAGES)) {
      expect(ids, `picker missing preload ${preloaded}`).toContain(preloaded);
    }
    for (const lazy of Object.keys(LAZY_LANGUAGES)) {
      expect(ids, `picker missing lazy ${lazy}`).toContain(lazy);
    }
  });

  it("`knownLanguageIds` returns a superset of every alias + canonical", () => {
    const known = new Set(knownLanguageIds());
    for (const key of Object.keys(PRELOADED_LANGUAGES)) expect(known.has(key)).toBe(true);
    for (const key of Object.keys(LANGUAGE_ALIASES)) expect(known.has(key)).toBe(true);
    for (const key of Object.keys(LAZY_LANGUAGES)) expect(known.has(key)).toBe(true);
    for (const key of Object.keys(LAZY_ALIASES)) expect(known.has(key)).toBe(true);
  });
});
