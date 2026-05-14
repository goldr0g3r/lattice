/**
 * Slash command TipTap extension.
 *
 * Wraps `@tiptap/suggestion` with our [`slashItems`](../slash-items.ts) and a
 * React popper (`components/SlashMenu.tsx`) for the picker. The plugin runs
 * `command(item)` against the editor and removes the slash range itself —
 * the caller's `command(editor)` body assumes a clean caret position.
 *
 * Targets the v0.2 PR #2 acceptance bullet for issue #33:
 * "Slash command menu (`/`) opens at the caret with keyboard-only navigation,
 *  fuzzy filter, and a confirmable insert".
 */

import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";

import { SlashMenu, type SlashMenuHandle, type SlashMenuProps } from "../components/SlashMenu";
import { filterSlashItems, slashItems, type SlashItem } from "../slash-items";

export interface SlashCommandsOptions {
  items: readonly SlashItem[];
}

/** Default options exposed for tests + downstream packages. */
export const defaultSlashCommandsOptions: SlashCommandsOptions = {
  items: slashItems,
};

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return defaultSlashCommandsOptions;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },
        items: ({ query }) => filterSlashItems(this.options.items, query),
        render: createPopper,
      }),
    ];
  },
});

interface PopperHandle {
  onStart: (props: SuggestionProps<SlashItem, SlashItem>) => void;
  onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

function createPopper(): PopperHandle {
  let renderer: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
  let popup: Instance<TippyProps> | null = null;

  return {
    onStart(props) {
      if (typeof document === "undefined") return;
      renderer = new ReactRenderer(SlashMenu, {
        props: buildMenuProps(props),
        editor: props.editor,
      });
      popup = tippy(document.body, {
        getReferenceClientRect: rectFromProps(props),
        appendTo: () => document.body,
        content: renderer.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
        theme: "lattice-slash",
      });
    },
    onUpdate(props) {
      renderer?.updateProps(buildMenuProps(props));
      popup?.setProps({ getReferenceClientRect: rectFromProps(props) });
    },
    onKeyDown({ event }) {
      if (event.key === "Escape") {
        popup?.hide();
        return true;
      }
      return renderer?.ref?.onKeyDown(event) ?? false;
    },
    onExit() {
      popup?.destroy();
      popup = null;
      renderer?.destroy();
      renderer = null;
    },
  };
}

function buildMenuProps(props: SuggestionProps<SlashItem, SlashItem>): SlashMenuProps {
  return {
    items: props.items,
    command: (item) => {
      props.command(item);
    },
  };
}

function rectFromProps(props: SuggestionProps<SlashItem, SlashItem>): () => DOMRect {
  // `clientRect` is typed as `(() => DOMRect | null) | null` by `@tiptap/suggestion`;
  // tippy.js requires a non-null DOMRect, so fall back to a zero-rect at the
  // top-left of the viewport (the popup briefly stays hidden anyway).
  const fallback = (): DOMRect =>
    typeof DOMRect === "function"
      ? new DOMRect(0, 0, 0, 0)
      : ({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          toJSON() {
            return this;
          },
        } as DOMRect);
  return () => props.clientRect?.() ?? fallback();
}
