/**
 * The React-level Lattice editor.
 *
 * Wraps `@tiptap/react`'s `useEditor` with our schema + slash-command
 * extension, owns the [`NoteDoc`] <-> ProseMirror conversion at the edges, and
 * emits `onChange(doc)` debounced via TipTap's built-in `onUpdate`.
 *
 * The component is intentionally headless about disk IO; the desktop shell
 * (`apps/desktop`) is what loads / saves vault files.
 */

import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";

import type { Frontmatter, NoteDoc } from "@lattice/core-bindings";

import type { WikiLinkOptions } from "./extensions/wiki-link";
import { SlashCommands } from "./extensions/slash-commands";
import { noteDocToProseMirror } from "./from-doc";
import { buildExtensions } from "./schema";
import { proseMirrorToNoteDoc } from "./to-doc";

export interface EditorProps {
  /** Initial document to load into the editor. */
  initialDoc: NoteDoc;
  /** Fires on every editor update with the latest [`NoteDoc`]. */
  onChange?: (doc: NoteDoc) => void;
  /** Optional empty-doc hint shown by the `@tiptap/extension-placeholder`. */
  placeholder?: string;
  /** Whether the editor is editable (true by default). */
  editable?: boolean;
  /** Optional class name applied to the outer `EditorContent` wrapper. */
  className?: string;
  /**
   * Optional `[[wiki-link]]` configuration. When omitted the extension
   * runs with the no-op defaults (empty autocomplete + console-log
   * navigation). The desktop shell injects a vault-backed data source +
   * an "open or create" navigation handler here.
   */
  wikiLink?: Partial<WikiLinkOptions>;
}

export function Editor(props: EditorProps) {
  const { initialDoc, onChange, placeholder, editable = true, className, wikiLink } = props;
  // Capture the frontmatter so the inverse conversion can hand it back on every
  // `onChange` without forcing the caller to re-attach it.
  const frontmatterRef = useRef<Frontmatter>(initialDoc.frontmatter);

  const editor = useEditor({
    extensions: [...buildExtensions({ placeholder, wikiLink }), SlashCommands],
    content: noteDocToProseMirror(initialDoc),
    editable,
    editorProps: {
      attributes: {
        class: "lattice-editor-prose",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      if (!onChange) return;
      const json = editor.getJSON();
      const doc = proseMirrorToNoteDoc(json as never, frontmatterRef.current);
      onChange(doc);
    },
  });

  // Keep the editable flag in sync if the parent toggles it.
  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // Replace document content when `initialDoc` identity changes (e.g. the
  // user switched notes). We compare by reference because deep equality on
  // the whole doc would be expensive and the caller controls when to swap.
  const lastInitialDocRef = useRef(initialDoc);
  useEffect(() => {
    if (!editor) return;
    if (lastInitialDocRef.current === initialDoc) return;
    lastInitialDocRef.current = initialDoc;
    frontmatterRef.current = initialDoc.frontmatter;
    editor.commands.setContent(
      noteDocToProseMirror(initialDoc) as unknown as Record<string, unknown>,
    );
  }, [editor, initialDoc]);

  return <EditorContent editor={editor} className={className} />;
}
