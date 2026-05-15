/**
 * Public React components for `@lattice/editor/tiptap`.
 *
 * Kept as a separate entry so headless consumers (CI tests, server-side
 * conversion) can import `noteDocToProseMirror` / `proseMirrorToNoteDoc`
 * without pulling React into the bundle.
 */

export { SlashMenu, type SlashMenuHandle, type SlashMenuProps } from "./SlashMenu";
export { Editor, type EditorProps } from "../Editor";
export { MathInline } from "./MathInline";
export { MathBlock } from "./MathBlock";
