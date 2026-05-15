/**
 * TipTap node-view factory that hosts a CodeMirror 6 instance inside every
 * `fenced` block.
 *
 * Implements decisions D2–D5 from [`languages.ts`](./languages.ts):
 *
 *   - D2 — `<pre data-fenced>` wrapper around a CM6 `EditorView`.
 *   - D3 — `updateListener` pushes the new body back into the TipTap node
 *     via `setNodeAttribute(getPos(), "body", body)`. No debounce — TipTap
 *     already coalesces transactions inside the same microtask.
 *   - D4 — language-picker `<select>` writes `attrs.info` via the same
 *     path and the language `Compartment` is reconfigured.
 *   - D5 — `ArrowUp` on the first line and `ArrowDown` on the last line
 *     escape to the surrounding TipTap document; `Mod-A` selects the CM6
 *     buffer (not the whole TipTap doc). `Backspace` on an empty doc
 *     deletes the fenced node entirely so the block can be removed from
 *     the keyboard alone.
 *
 * The file imports `@codemirror/view` etc. at the top level, but the
 * `EditorView` constructor is only invoked inside the renderer returned
 * by [`latticeCodeMirrorNodeView`](#latticeCodeMirrorNodeView) which
 * TipTap only calls on `addNodeView()` mount in the browser. Importing
 * this module in node does NOT spin up a DOM (D8).
 */

import { autocompletion, closeBrackets } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  selectAll as selectAllCommand,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

import type { NodeViewRenderer } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import {
  getLanguage,
  getPreloadedLanguage,
  languageMenuItems,
  resolveCanonicalId,
} from "./languages";
import { latticeCodeMirrorTheme } from "./theme";

/**
 * Build a TipTap `NodeViewRenderer` for the Lattice fenced node. The
 * resulting node-view owns a single `<pre data-fenced>` wrapper, a header
 * with the language picker, and a CM6 `EditorView` for the code itself.
 */
export function latticeCodeMirrorNodeView(): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    const dom = document.createElement("pre");
    dom.setAttribute("data-fenced", "true");
    dom.className = "lattice-cm-fenced";

    const header = document.createElement("div");
    header.className = "lattice-cm-fenced__header";
    header.setAttribute("contenteditable", "false");

    const select = document.createElement("select");
    select.className = "lattice-cm-fenced__language";
    select.setAttribute("aria-label", "Language");
    for (const item of languageMenuItems()) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.preloaded ? item.label : `${item.label} (lazy)`;
      select.appendChild(option);
    }
    syncSelectValue(select, String(node.attrs["info"] ?? ""));
    header.appendChild(select);

    const host = document.createElement("div");
    host.className = "lattice-cm-fenced__host";
    host.setAttribute("contenteditable", "false");

    dom.appendChild(header);
    dom.appendChild(host);

    const languageCompartment = new Compartment();

    const moveOutOfBlock = (direction: "up" | "down"): boolean => {
      const pos = getPos();
      if (typeof pos !== "number") return false;
      const here = editor.state.doc.nodeAt(pos);
      if (!here) return false;
      const targetPos = direction === "up" ? pos - 1 : pos + here.nodeSize + 1;
      const docSize = editor.state.doc.content.size;
      if (targetPos < 0 || targetPos > docSize) return false;
      const { state } = editor.view;
      const resolved = state.doc.resolve(Math.max(0, Math.min(targetPos, docSize)));
      const selection = TextSelection.near(resolved, direction === "up" ? -1 : 1);
      editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView());
      editor.view.focus();
      return true;
    };

    const escapeKeymap = keymap.of([
      {
        key: "ArrowUp",
        run: (cmView) => {
          const head = cmView.state.selection.main.head;
          const firstLineTo = cmView.state.doc.line(1).to;
          if (head > firstLineTo) return false;
          return moveOutOfBlock("up");
        },
      },
      {
        key: "ArrowDown",
        run: (cmView) => {
          const head = cmView.state.selection.main.head;
          const lastLine = cmView.state.doc.line(cmView.state.doc.lines);
          if (head < lastLine.from) return false;
          return moveOutOfBlock("down");
        },
      },
      {
        key: "Mod-a",
        run: selectAllCommand,
      },
      {
        key: "Backspace",
        run: (cmView) => {
          if (cmView.state.doc.length !== 0) return false;
          const pos = getPos();
          if (typeof pos !== "number") return false;
          const here = editor.state.doc.nodeAt(pos);
          if (!here) return false;
          const { state } = editor.view;
          editor.view.dispatch(
            state.tr
              .delete(pos, pos + here.nodeSize)
              .scrollIntoView()
              .setMeta("addToHistory", true),
          );
          editor.view.focus();
          return true;
        },
      },
    ]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const pos = getPos();
      if (typeof pos !== "number") return;
      const body = update.state.doc.toString();
      const currentBody = String(editor.state.doc.nodeAt(pos)?.attrs["body"] ?? "");
      if (body === currentBody) return;
      editor.view.dispatch(
        editor.view.state.tr.setNodeAttribute(pos, "body", body).setMeta("addToHistory", true),
      );
    });

    const initialLanguage = getPreloadedLanguage(String(node.attrs["info"] ?? ""));
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: String(node.attrs["body"] ?? ""),
        extensions: [
          Prec.high(escapeKeymap),
          lineNumbers(),
          foldGutter(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          highlightSelectionMatches(),
          history(),
          drawSelection(),
          indentOnInput(),
          indentUnit.of("  "),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          latticeCodeMirrorTheme(),
          EditorView.editable.of(editor.isEditable),
          languageCompartment.of(initialLanguage ?? []),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            ...foldKeymap,
            indentWithTab,
          ]),
          updateListener,
        ],
      }),
    });

    if (!initialLanguage) {
      const rawInfo = String(node.attrs["info"] ?? "");
      if (resolveCanonicalId(rawInfo) !== null) {
        void getLanguage(rawInfo).then((lang) => {
          if (!lang) return;
          view.dispatch({ effects: languageCompartment.reconfigure(lang) });
        });
      }
    }

    select.addEventListener("change", () => {
      const next = select.value;
      const pos = getPos();
      if (typeof pos === "number") {
        editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "info", next));
      }
      void getLanguage(next).then((lang) => {
        view.dispatch({ effects: languageCompartment.reconfigure(lang ?? []) });
      });
    });

    return {
      dom,
      update(updatedNode) {
        if (updatedNode.type.name !== "fenced") return false;
        const nextBody = String(updatedNode.attrs["body"] ?? "");
        if (nextBody !== view.state.doc.toString()) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: nextBody },
          });
        }
        const nextInfo = String(updatedNode.attrs["info"] ?? "");
        syncSelectValue(select, nextInfo);
        return true;
      },
      selectNode() {
        dom.classList.add("ProseMirror-selectednode");
        view.focus();
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      stopEvent(event) {
        const target = event.target;
        if (target instanceof Node && header.contains(target)) return true;
        if (target instanceof Node && host.contains(target)) return true;
        return false;
      },
      ignoreMutation() {
        return true;
      },
      destroy() {
        view.destroy();
      },
    };
  };
}

function syncSelectValue(selectEl: HTMLSelectElement, info: string): void {
  const canonical = resolveCanonicalId(info);
  const desired = canonical ?? "";
  if (selectEl.value === desired) return;
  const hasOption = Array.from(selectEl.options).some((opt) => opt.value === desired);
  selectEl.value = hasOption ? desired : "";
}
