/**
 * `[[Target]]` and `[[Target|Alias]]` — the Lattice wiki-link inline node.
 *
 * v0.2 PR #2 shipped the bare atom node + serialization. v0.2 PR #4
 * (issue [#36](https://github.com/goldr0g3r/lattice/issues/36)) layers an
 * autocomplete suggestion plugin, a click-to-navigate plugin, and a
 * `[[Target]]` / `[[Target|Alias]]` typing input rule on top — without
 * changing the on-disk shape.
 *
 * # Locked design decisions (reviewers — read me first)
 *
 *  - **D1 — trigger.** `@tiptap/suggestion` doesn't accept a multi-char
 *    trigger natively, so we override `findSuggestionMatch` instead of
 *    relying on the default regex. Our custom matcher scans backwards from
 *    the caret for the last `[[` that has no closing `]` yet; everything
 *    between that `[[` and the caret is the query. This is more permissive
 *    than the default regex (which forbids `[` and `\s` in the query) and
 *    avoids the "`allowedPrefixes` trips on the first `[`" failure mode.
 *  - **D2 — query parse.** Query is the text between the `[[` and the
 *    caret, verbatim. `|` splits target / alias for the inserter (the part
 *    before `|` is what we filter on, the part after is the alias the user
 *    typed). A `]` inside the query closes the menu so the input rule
 *    (below) can take over and convert the full `[[X]]` / `[[X|Y]]` text.
 *  - **D3 — fuzzy match.** Case-insensitive substring on `title`. We don't
 *    sort or apply a "recently edited" bias here; instead we preserve the
 *    order returned by `getNoteTitles` so the data source owns recency.
 *    Document this trade-off so future PRs that wire vault data can hand
 *    in pre-sorted results without us inverting them.
 *  - **D4 — selection.** ↑/↓ moves the active row, ⏎ inserts the wiki-link
 *    node (target = `id ?? title`, alias = whatever the user typed after
 *    `|`), Esc closes the menu, mouse hover + click work too. Keyboard
 *    handling lives on the React menu component via the same
 *    `forwardRef` + `useImperativeHandle` shape as `SlashMenu`.
 *  - **D5 — empty state.** When `getNoteTitles` returns `[]` the popup
 *    renders a "No matching notes" row with a hint to press `Esc` to keep
 *    typing `[[query]]` as plain text. The default `getNoteTitles` (in
 *    `defaultWikiLinkOptions`) returns `[]` — so absent host wiring the
 *    user sees the empty state and the input-rule path keeps working.
 *  - **D6 — click-to-navigate.** A separate ProseMirror plugin intercepts
 *    `mousedown` on `[data-wiki-link]` and calls `options.onNavigate`.
 *    TipTap's contenteditable swallows default anchor clicks, so binding
 *    to the `<a>` element in `renderHTML` is not enough — we have to
 *    handle it at the plugin level on the editor view's DOM.
 *  - **D7 — round-trip.** The node's `attrs`, `parseHTML`, and
 *    `renderHTML` are unchanged from PR #54. The 13-fixture NoteDoc <->
 *    ProseMirror corpus and the 26-fixture Markdown round-trip corpus
 *    therefore stay green with zero fixture edits.
 *  - **D8 — SSR.** The extension imports React (via the menu component) on
 *    the suggestion-render side only, and that constructor runs inside a
 *    `typeof document !== "undefined"` guard. Node-side tests that only
 *    import the extension to construct the schema don't touch React or
 *    the DOM.
 *
 * # Data-source decoupling
 *
 * The vault list and the "open or create" navigation are injected from
 * the desktop shell via `WikiLinkOptions`. The shell-redesign PR adds
 * `vault_list_notes` / `vault_read_note` IPC commands; wiring those into
 * `getNoteTitles` / `onNavigate` is a follow-up PR after both branches
 * merge. Until then the editor compiles with the no-op defaults and the
 * empty-state path is what the user sees.
 */

import { Node, mergeAttributes, nodeInputRule, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance, type Props as TippyProps } from "tippy.js";

import {
  WikiLinkMenu,
  type WikiLinkMenuHandle,
  type WikiLinkMenuProps,
} from "../components/WikiLinkMenu";

/** Candidate emitted by the host's data source. */
export interface NoteCandidate {
  /** Display title. Required. */
  title: string;
  /**
   * Stable identifier (e.g. vault-relative path or slug). When omitted the
   * inserter falls back to `title`, so the simplest data sources can hand
   * back `{ title }` arrays and still see correct round-trips.
   */
  id?: string;
  /** Optional one-line snippet rendered under the title in the menu. */
  snippet?: string;
}

/** Argument shape for the click-to-navigate callback. */
export interface WikiLinkNavigation {
  /** The `target` attribute of the clicked wiki-link node. */
  target: string;
  /** The `alias` attribute, or `null` when none was typed. */
  alias: string | null;
}

/** Configuration for the wiki-link extension. */
export interface WikiLinkOptions {
  /**
   * Async data source for the autocomplete suggestions. Returning an empty
   * array opens the menu with the "No matching notes" empty-state row
   * (D5). The default implementation returns `[]` so the editor compiles
   * stand-alone; the desktop shell injects a vault-backed implementation.
   */
  getNoteTitles: (query: string) => Promise<readonly NoteCandidate[]>;
  /**
   * Called on `mousedown` over a rendered wiki-link (D6). The default
   * implementation logs to `console.info` so accidental clicks aren't
   * silent during development. The shell replaces this with an
   * "open-or-create" navigation handler.
   */
  onNavigate: (link: WikiLinkNavigation) => void;
}

/**
 * Default options exposed so tests + downstream packages can reuse the
 * "compiles stand-alone" baseline. Both fields are no-ops; configuring
 * either at the Editor level is opt-in.
 */
export const defaultWikiLinkOptions: WikiLinkOptions = {
  getNoteTitles: () => Promise.resolve([] as readonly NoteCandidate[]),
  onNavigate: (link) => {
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info("[wiki-link] navigate", link);
    }
  },
};

const wikiLinkSuggestionKey = new PluginKey("latticeWikiLinkSuggestion");
const wikiLinkClickKey = new PluginKey("latticeWikiLinkClick");

/** Greatest-power-of-two regex that recognises a typed `[[Target]]` / `[[Target|Alias]]`. */
const WIKI_LINK_INPUT_RULE = /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]$/;

/**
 * Custom suggestion matcher for the `[[` trigger (D1). Scans the text in
 * `nodeBefore` for the last `[[` that has no `]` after it; treats
 * everything between that `[[` and the caret as the query. Returning
 * `null` tears down the menu — which is what we want as soon as the user
 * types `]` (so the typing input rule below can take over).
 */
const findWikiLinkMatch: SuggestionOptions["findSuggestionMatch"] = ({ $position }) => {
  const nodeBefore = $position.nodeBefore;
  if (!nodeBefore?.isText) return null;
  const text = nodeBefore.text ?? "";
  if (text.length === 0) return null;

  const triggerIdx = text.lastIndexOf("[[");
  if (triggerIdx === -1) return null;

  const query = text.slice(triggerIdx + 2);
  if (query.includes("]")) return null;
  if (query.startsWith("[")) return null;

  const textFrom = $position.pos - text.length;
  return {
    range: {
      from: textFrom + triggerIdx,
      to: textFrom + triggerIdx + 2 + query.length,
    },
    query,
    text: text.slice(triggerIdx),
  };
};

export const WikiLink = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return defaultWikiLinkOptions;
  },

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-target") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-target": String(attrs.target ?? ""),
        }),
      },
      alias: {
        default: null as string | null,
        parseHTML: (el): string | null => el.getAttribute("data-alias"),
        renderHTML: (attrs): Record<string, string> => {
          const alias = attrs.alias;
          return alias === null || alias === undefined ? {} : { "data-alias": String(alias) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-wiki-link]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const target = String(node.attrs.target ?? "");
    const alias = node.attrs.alias;
    const display = alias === null || alias === undefined ? target : String(alias);
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "true",
        href: `#/note/${encodeURIComponent(target)}`,
      }),
      display,
    ];
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: WIKI_LINK_INPUT_RULE,
        type: this.type,
        getAttributes: (match) => {
          const target = (match[1] ?? "").trim();
          const aliasRaw = match[2];
          const alias = aliasRaw !== undefined ? aliasRaw.trim() : null;
          return {
            target,
            alias: alias && alias.length > 0 ? alias : null,
          };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { onNavigate, getNoteTitles } = this.options;
    return [
      buildSuggestionPlugin({
        editor: this.editor,
        getNoteTitles,
      }),
      buildClickPlugin(onNavigate),
    ];
  },
});

function buildSuggestionPlugin({
  editor,
  getNoteTitles,
}: {
  editor: Editor;
  getNoteTitles: WikiLinkOptions["getNoteTitles"];
}): Plugin {
  return Suggestion<NoteCandidate, NoteCandidate>({
    pluginKey: wikiLinkSuggestionKey,
    editor,
    char: "[",
    allowSpaces: true,
    allowedPrefixes: null,
    startOfLine: false,
    findSuggestionMatch: findWikiLinkMatch,
    items: async ({ query }) => {
      const candidates = await getNoteTitles(query);
      return filterNoteCandidates(candidates, query);
    },
    command: ({ editor: ed, range, props }) => {
      // The match captures `[[` + the query (D1). The query may contain
      // `|alias` (D2) — keep whatever the user typed there, but the
      // selected candidate decides the target.
      const queryText = ed.state.doc.textBetween(range.from + 2, range.to, "\n", "\n");
      const pipeIdx = queryText.indexOf("|");
      const aliasRaw = pipeIdx >= 0 ? queryText.slice(pipeIdx + 1) : "";
      const alias = aliasRaw.trim();
      const target = (props.id ?? props.title).trim();
      ed.chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "wikiLink",
          attrs: { target, alias: alias.length > 0 ? alias : null },
        })
        .insertContent(" ")
        .run();
    },
    render: createWikiLinkPopper,
  });
}

/**
 * D3 — case-insensitive substring match on `title`. We preserve the input
 * order so the data source owns sorting / recency-bias.
 */
export function filterNoteCandidates(
  candidates: readonly NoteCandidate[],
  query: string,
): NoteCandidate[] {
  const pipeIdx = query.indexOf("|");
  const head = pipeIdx >= 0 ? query.slice(0, pipeIdx) : query;
  const needle = head.trim().toLowerCase();
  if (needle === "") return [...candidates];
  return candidates.filter((candidate) => candidate.title.toLowerCase().includes(needle));
}

function buildClickPlugin(onNavigate: WikiLinkOptions["onNavigate"]): Plugin {
  return new Plugin({
    key: wikiLinkClickKey,
    props: {
      handleDOMEvents: {
        mousedown(_view, event) {
          const targetEl = event.target;
          if (!(targetEl instanceof Element)) return false;
          const anchor = targetEl.closest("a[data-wiki-link]");
          if (!anchor) return false;
          event.preventDefault();
          const target = anchor.getAttribute("data-target") ?? "";
          const aliasAttr = anchor.getAttribute("data-alias");
          onNavigate({ target, alias: aliasAttr });
          return true;
        },
      },
    },
  });
}

interface PopperHandle {
  onStart: (props: SuggestionProps<NoteCandidate, NoteCandidate>) => void;
  onUpdate: (props: SuggestionProps<NoteCandidate, NoteCandidate>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

function createWikiLinkPopper(): PopperHandle {
  let renderer: ReactRenderer<WikiLinkMenuHandle, WikiLinkMenuProps> | null = null;
  let popup: Instance<TippyProps> | null = null;

  return {
    onStart(props) {
      if (typeof document === "undefined") return;
      renderer = new ReactRenderer(WikiLinkMenu, {
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
        theme: "lattice-wiki-link",
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

function buildMenuProps(props: SuggestionProps<NoteCandidate, NoteCandidate>): WikiLinkMenuProps {
  return {
    items: props.items,
    query: props.query,
    command: (candidate) => {
      props.command(candidate);
    },
  };
}

function rectFromProps(props: SuggestionProps<NoteCandidate, NoteCandidate>): () => DOMRect {
  // `clientRect` is typed as `(() => DOMRect | null) | null` by
  // `@tiptap/suggestion`; tippy.js requires a non-null DOMRect, so fall
  // back to a zero-rect at the top-left of the viewport.
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
