/**
 * `@lattice/editor/tiptap` — TipTap-based block editor surface (v0.2 PR #2).
 *
 * Public exports:
 *
 *   - `Editor` — React component that wraps `useEditor` and binds to a
 *     [`NoteDoc`](https://github.com/goldr0g3r/lattice/blob/main/packages/core-bindings/src/generated/NoteDoc.ts).
 *   - `buildExtensions` — the canonical Lattice extension list (one TipTap
 *     node per `NoteDoc` block / inline variant).
 *   - `noteDocToProseMirror` / `proseMirrorToNoteDoc` — lossless converters
 *     between the two representations; the conversion-corpus test in
 *     `__tests__/conversion.test.ts` is the safety net.
 *   - `LATTICE_NODE_NAMES`, `slashItems` — exposed so downstream packages
 *     can extend the slash menu or the schema without re-importing internals.
 */

export { Editor, type EditorProps } from "./Editor";
export { buildExtensions, LATTICE_NODE_NAMES, type LatticeNodeName } from "./schema";
export { noteDocToProseMirror } from "./from-doc";
export { proseMirrorToNoteDoc } from "./to-doc";
export type { PMMark, PMNode } from "./from-doc";
export { slashItems, type SlashItem } from "./slash-items";
export {
  PRELOADED_LANGUAGES,
  LAZY_LANGUAGES,
  LANGUAGE_ALIASES,
  LAZY_ALIASES,
  getLanguage,
  getPreloadedLanguage,
  languageMenuItems,
  knownLanguageIds,
  resolveCanonicalId,
  normalizeInfo,
  type LanguageFactory,
  type LazyLanguageFactory,
  type LanguageMenuItem,
} from "./codemirror/languages";
export { latticeCodeMirrorTheme } from "./codemirror/theme";
export { latticeCodeMirrorNodeView } from "./codemirror/node-view";
