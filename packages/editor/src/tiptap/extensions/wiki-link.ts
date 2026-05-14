/**
 * `[[Target]]` and `[[Target|Alias]]` — the Lattice wiki-link inline node.
 *
 * v0.2 PR #2 ships only the node + serialization. v0.2 PR #4 adds the `[[`
 * autocomplete UI and click-to-navigate behaviour (issue #36).
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

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
});
