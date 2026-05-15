/**
 * CodeMirror 6 language registry for Lattice fenced code blocks (v0.2 PR #3,
 * closes issue [#34](https://github.com/goldr0g3r/lattice/issues/34)).
 *
 * # Locked design decisions
 *
 * The full set of decisions for the v0.2 CodeMirror PR lives here because
 * this is the first file a reviewer reads. The peer files
 * ([`theme.ts`](./theme.ts), [`node-view.ts`](./node-view.ts)) follow the
 * same contract.
 *
 * - **D1 — language registry**. 22 entries are preloaded (eager imports) so
 *   the cold render of a fenced block doesn't await a dynamic chunk:
 *   javascript / typescript / jsx / tsx (one package, four entries),
 *   python, rust, go, java, cpp + c (one package, two entries), json, yaml,
 *   markdown, html, css, sql, xml, php, shell (which covers `bash` / `sh` /
 *   `zsh`), plus dockerfile / lua / toml from `@codemirror/legacy-modes`.
 *   The long tail (ruby, perl, swift, haskell, kotlin, scala, powershell,
 *   r, …) lives in a dynamic `import()` map keyed on info-string and is
 *   loaded the first time a block requests it.
 * - **D2 — node-view shape**. TipTap `NodeViewRenderer` returns a single
 *   `dom = <pre data-fenced>` wrapping a CodeMirror `EditorView`. The
 *   `attrs: { info, body }` shape is unchanged from the v0.2 PR #2 atom
 *   node so the NoteDoc <-> ProseMirror converter pair in
 *   [`from-doc.ts`](../from-doc.ts) / [`to-doc.ts`](../to-doc.ts) stays
 *   identical and the 13-fixture conversion corpus keeps passing untouched.
 * - **D3 — body sync**. CM6's `EditorView.updateListener` fires on every
 *   `docChanged` transaction and pushes the new text into the TipTap node
 *   via `view.dispatch(tr.setNodeAttribute(getPos(), "body", body))`. No
 *   debounce — TipTap already coalesces transactions inside the same task.
 * - **D4 — info sync**. The language dropdown is rendered inside the
 *   node-view's `<pre>` wrapper. Selecting a new language rewrites the
 *   `attrs.info` via the same `setNodeAttribute` path and swaps the CM6
 *   language extension with `Compartment.reconfigure`.
 * - **D5 — keyboard escape**. ArrowUp at the first visual line moves the
 *   selection to the TipTap document above the node; ArrowDown at the last
 *   line moves it to the document below. Mod-A inside CM6 selects the CM6
 *   buffer (not the whole TipTap doc). All of this is enforced by a
 *   `Prec.high` keymap registered on the `EditorView` in
 *   [`node-view.ts`](./node-view.ts).
 * - **D6 — round-trip**. Unchanged. The fenced node still uses
 *   `attrs: { info, body }`; the converters in `from-doc.ts` / `to-doc.ts`
 *   are untouched in this PR.
 * - **D7 — design tokens**. The CM6 theme in [`theme.ts`](./theme.ts) reads
 *   `var(--bg-elevated)` / `var(--text-primary)` / `var(--accent-primary)` /
 *   `var(--border)` / `var(--font-mono)` from
 *   [`packages/ui/src/tokens.css`](../../../../../ui/src/tokens.css). No
 *   hard-coded colours.
 * - **D8 — SSR / jsdom**. This file is pure data — language descriptors and
 *   a dynamic import map — and is safe to import in node. The
 *   `EditorView` itself is only constructed inside the node-view, which
 *   only runs in the browser (TipTap calls `addNodeView()` lazily on
 *   mount). The headless `*.test.ts` corpus stays green; the node-view
 *   test in `__tests__/node-view.test.tsx` runs under jsdom.
 */

import { LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";

import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";

/**
 * Factory that returns a CM6 `LanguageSupport` for the given info-string.
 * Modules are pulled in eagerly at import time so the call is synchronous.
 */
export type LanguageFactory = () => LanguageSupport;

/**
 * Lazy variant — returned by `getLanguage` for entries that live behind a
 * dynamic `import()` so the long tail doesn't bloat the initial bundle.
 */
export type LazyLanguageFactory = () => Promise<LanguageSupport>;

/**
 * Normalise an info-string to the lowercase first token. Markdown info
 * strings may include trailing metadata (e.g. ` ```ts file=foo.ts `); we
 * key the registry on the language identifier only.
 */
export function normalizeInfo(info: string): string {
  const trimmed = info.trim().toLowerCase();
  if (trimmed === "") return "";
  // `#` is included so aliases like `c#` and `f#` survive normalisation.
  const match = trimmed.match(/^[a-z0-9+#_.-]+/);
  return match?.[0] ?? "";
}

function fromStream(parser: StreamParser<unknown>): LanguageSupport {
  return new LanguageSupport(StreamLanguage.define(parser));
}

/**
 * Preloaded language registry — 22 distinct entries keyed by canonical
 * info-string. Aliases live in [`LANGUAGE_ALIASES`](#LANGUAGE_ALIASES) so
 * tests can reason about the underlying entry set without alias spam.
 */
export const PRELOADED_LANGUAGES: Readonly<Record<string, LanguageFactory>> = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  python: () => python(),
  rust: () => rust(),
  go: () => go(),
  java: () => java(),
  cpp: () => cpp(),
  c: () => cpp(),
  json: () => json(),
  yaml: () => yaml(),
  markdown: () => markdown(),
  html: () => html(),
  css: () => css(),
  sql: () => sql(),
  xml: () => xml(),
  php: () => php(),
  shell: () => fromStream(shell),
  dockerfile: () => fromStream(dockerFile),
  lua: () => fromStream(lua),
  toml: () => fromStream(toml),
};

/**
 * Aliases that map onto a preloaded canonical entry. Keep this conservative
 * — only register aliases that are unambiguous in the Markdown ecosystem.
 */
export const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  py: "python",
  py3: "python",
  rs: "rust",
  golang: "go",
  "c++": "cpp",
  cxx: "cpp",
  cc: "cpp",
  hpp: "cpp",
  h: "c",
  md: "markdown",
  mdown: "markdown",
  mkd: "markdown",
  yml: "yaml",
  htm: "html",
  scss: "css",
  bash: "shell",
  sh: "shell",
  zsh: "shell",
  ksh: "shell",
  dockerbuild: "dockerfile",
  containerfile: "dockerfile",
  xhtml: "html",
};

/**
 * Lazy-loaded long-tail languages keyed by info-string. The dynamic
 * `import()` is what lets Vite / Rollup split each entry into its own
 * chunk so the initial editor bundle stays lean. Anything in
 * `PRELOADED_LANGUAGES` takes precedence over this map at lookup time.
 */
export const LAZY_LANGUAGES: Readonly<Record<string, LazyLanguageFactory>> = {
  ruby: async () => {
    const { ruby } = await import("@codemirror/legacy-modes/mode/ruby");
    return fromStream(ruby);
  },
  perl: async () => {
    const { perl } = await import("@codemirror/legacy-modes/mode/perl");
    return fromStream(perl);
  },
  swift: async () => {
    const { swift } = await import("@codemirror/legacy-modes/mode/swift");
    return fromStream(swift);
  },
  haskell: async () => {
    const { haskell } = await import("@codemirror/legacy-modes/mode/haskell");
    return fromStream(haskell);
  },
  scala: async () => {
    const { scala } = await import("@codemirror/legacy-modes/mode/clike");
    return fromStream(scala);
  },
  kotlin: async () => {
    const { kotlin } = await import("@codemirror/legacy-modes/mode/clike");
    return fromStream(kotlin);
  },
  csharp: async () => {
    const { csharp } = await import("@codemirror/legacy-modes/mode/clike");
    return fromStream(csharp);
  },
  dart: async () => {
    const { dart } = await import("@codemirror/legacy-modes/mode/clike");
    return fromStream(dart);
  },
  objectivec: async () => {
    const { objectiveC } = await import("@codemirror/legacy-modes/mode/clike");
    return fromStream(objectiveC);
  },
  r: async () => {
    const { r } = await import("@codemirror/legacy-modes/mode/r");
    return fromStream(r);
  },
  powershell: async () => {
    const { powerShell } = await import("@codemirror/legacy-modes/mode/powershell");
    return fromStream(powerShell);
  },
  julia: async () => {
    const { julia } = await import("@codemirror/legacy-modes/mode/julia");
    return fromStream(julia);
  },
  scheme: async () => {
    const { scheme } = await import("@codemirror/legacy-modes/mode/scheme");
    return fromStream(scheme);
  },
  clojure: async () => {
    const { clojure } = await import("@codemirror/legacy-modes/mode/clojure");
    return fromStream(clojure);
  },
  erlang: async () => {
    const { erlang } = await import("@codemirror/legacy-modes/mode/erlang");
    return fromStream(erlang);
  },
  elm: async () => {
    const { elm } = await import("@codemirror/legacy-modes/mode/elm");
    return fromStream(elm);
  },
  groovy: async () => {
    const { groovy } = await import("@codemirror/legacy-modes/mode/groovy");
    return fromStream(groovy);
  },
  diff: async () => {
    const { diff } = await import("@codemirror/legacy-modes/mode/diff");
    return fromStream(diff);
  },
  nginx: async () => {
    const { nginx } = await import("@codemirror/legacy-modes/mode/nginx");
    return fromStream(nginx);
  },
  vb: async () => {
    const { vb } = await import("@codemirror/legacy-modes/mode/vb");
    return fromStream(vb);
  },
  fortran: async () => {
    const { fortran } = await import("@codemirror/legacy-modes/mode/fortran");
    return fromStream(fortran);
  },
};

/**
 * Long-tail aliases. Same shape as [`LANGUAGE_ALIASES`](#LANGUAGE_ALIASES)
 * but targeting `LAZY_LANGUAGES` keys.
 */
export const LAZY_ALIASES: Readonly<Record<string, string>> = {
  rb: "ruby",
  pl: "perl",
  hs: "haskell",
  cs: "csharp",
  "c#": "csharp",
  fs: "csharp",
  "objective-c": "objectivec",
  objc: "objectivec",
  pwsh: "powershell",
  ps1: "powershell",
  jl: "julia",
  clj: "clojure",
  cljs: "clojure",
  erl: "erlang",
  f90: "fortran",
  f95: "fortran",
  vbnet: "vb",
};

/**
 * Set of every info-string this registry recognises, including aliases on
 * both the preloaded and lazy sides. Useful for the language-picker UI and
 * tests.
 */
export function knownLanguageIds(): readonly string[] {
  return Object.freeze(
    [
      ...Object.keys(PRELOADED_LANGUAGES),
      ...Object.keys(LANGUAGE_ALIASES),
      ...Object.keys(LAZY_LANGUAGES),
      ...Object.keys(LAZY_ALIASES),
    ].sort(),
  );
}

/** Items shown in the language-picker dropdown (canonical entries only). */
export interface LanguageMenuItem {
  /** Canonical info-string written into `attrs.info`. */
  id: string;
  /** Human-friendly label. */
  label: string;
  /** Whether the entry is preloaded — used to show a "loading…" affordance. */
  preloaded: boolean;
}

/**
 * Build a sorted list of canonical entries for the language-picker.
 *
 * `(plain text)` lives at the top so users can pick "no syntax". The rest
 * is sorted by `label` for predictable UX.
 */
export function languageMenuItems(): readonly LanguageMenuItem[] {
  const items: LanguageMenuItem[] = [{ id: "", label: "Plain text", preloaded: true }];
  for (const id of Object.keys(PRELOADED_LANGUAGES)) {
    items.push({ id, label: prettyLabel(id), preloaded: true });
  }
  for (const id of Object.keys(LAZY_LANGUAGES)) {
    items.push({ id, label: prettyLabel(id), preloaded: false });
  }
  return Object.freeze(
    items.sort((a, b) => {
      if (a.id === "") return -1;
      if (b.id === "") return 1;
      return a.label.localeCompare(b.label);
    }),
  );
}

const LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  cpp: "C++",
  csharp: "C#",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  objectivec: "Objective-C",
  php: "PHP",
  powershell: "PowerShell",
  shell: "Shell",
  sql: "SQL",
  toml: "TOML",
  tsx: "TSX",
  typescript: "TypeScript",
  vb: "Visual Basic",
  xml: "XML",
  yaml: "YAML",
};

function prettyLabel(id: string): string {
  if (id in LABEL_OVERRIDES) return LABEL_OVERRIDES[id]!;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/**
 * Resolve an info-string to a `LanguageSupport`. The lookup order is:
 *
 *   1. Empty / unknown info → `null` (caller leaves the editor unhighlighted).
 *   2. Canonical preload hit → synchronous factory.
 *   3. Preload alias → resolve, then synchronous factory.
 *   4. Canonical lazy hit → dynamic `import()` chunk.
 *   5. Lazy alias → resolve, then dynamic `import()` chunk.
 *
 * Returns `null` when the language is unknown so the caller can render the
 * block as plain text.
 */
export async function getLanguage(rawInfo: string): Promise<LanguageSupport | null> {
  const id = resolveCanonicalId(rawInfo);
  if (id === null) return null;
  const preloaded = PRELOADED_LANGUAGES[id];
  if (preloaded) return preloaded();
  const lazy = LAZY_LANGUAGES[id];
  if (lazy) return lazy();
  return null;
}

/**
 * Synchronous variant — only consults the preload table. Returns `null` for
 * lazy or unknown languages. Used by the node-view for the initial render
 * so the editor mounts without an `await` round-trip.
 */
export function getPreloadedLanguage(rawInfo: string): LanguageSupport | null {
  const id = resolveCanonicalId(rawInfo);
  if (id === null) return null;
  const preloaded = PRELOADED_LANGUAGES[id];
  return preloaded ? preloaded() : null;
}

/**
 * Resolve a raw info-string down to a canonical entry id (key in
 * `PRELOADED_LANGUAGES` or `LAZY_LANGUAGES`). Returns `null` if neither
 * the canonical nor alias tables know about the language.
 */
export function resolveCanonicalId(rawInfo: string): string | null {
  const normalized = normalizeInfo(rawInfo);
  if (normalized === "") return null;
  if (normalized in PRELOADED_LANGUAGES) return normalized;
  if (normalized in LANGUAGE_ALIASES) return LANGUAGE_ALIASES[normalized]!;
  if (normalized in LAZY_LANGUAGES) return normalized;
  if (normalized in LAZY_ALIASES) return LAZY_ALIASES[normalized]!;
  return null;
}
