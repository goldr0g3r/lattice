/**
 * Raw HTML block — `<details>...</details>` and friends.
 *
 * v0.2 doesn't render the HTML live (security boundary); the body is stored
 * verbatim on the `html` attribute and surfaced in a read-only `<pre>` so the
 * user can see what's there. v0.2 PR #5 may add an opt-in "render HTML"
 * preview behind a per-vault setting.
 */

import { Node, mergeAttributes } from "@tiptap/core";

export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,
  selectable: true,
  defining: true,

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (el): string => {
          const code = el.querySelector("code");
          return code?.textContent ?? el.textContent ?? "";
        },
        renderHTML: (): Record<string, string> => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-html-block]", preserveWhitespace: "full" as const }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, { "data-html-block": "true" }),
      ["code", String(node.attrs.html ?? "")],
    ];
  },
});

export const HtmlInline = Node.create({
  name: "htmlInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      html: {
        default: "",
        parseHTML: (el): string => el.getAttribute("data-html") ?? "",
        renderHTML: (attrs): Record<string, string> => ({
          "data-html": String(attrs.html ?? ""),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-html-inline]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-html-inline": "true" }),
      String(node.attrs.html ?? ""),
    ];
  },
});
