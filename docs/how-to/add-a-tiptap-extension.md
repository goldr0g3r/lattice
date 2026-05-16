# How to add a TipTap extension

> Adding an editor capability — a new block, a new mark, a new input
> rule. The conceptual deep dive is at
> [`../architecture/editor-internals.md`](../architecture/editor-internals.md);
> the on-disk Markdown contract is locked by
> [ADR-0015](../decisions/0015-markdown-flavor-and-serialization.md).

## When to do it

You're adding:

- A **new block** (callout, math block, fenced embed, typed
  Dataset/Model node).
- A **new inline mark** (wiki-link variant, role-tag).
- A **new input rule** (auto-format `--` to em-dash, `:emoji:` to
  Unicode, etc.).
- A **new keyboard binding** scoped to the editor.

If the change can be done by tweaking an existing extension, prefer
that — fewer extensions = fewer interactions to debug.

## Decide: block, mark, or extension?

Three TipTap building blocks; pick the one that matches your intent:

| Want                                          | Use         | Example                      |
| --------------------------------------------- | ----------- | ---------------------------- |
| A whole-paragraph thing with its own children | `Node`      | `Callout`, `MathBlock`       |
| A character-level styling that wraps text     | `Mark`      | `WikiLink`, `Bold`, `Italic` |
| Behaviour that doesn't add a node or mark     | `Extension` | `SlashCommands`, `History`   |

When in doubt, look at how the closest existing extension is
implemented under
[`packages/editor/src/tiptap/extensions/`](../../packages/editor/src/tiptap/extensions/).

## Steps

### 1. Author the extension

Create `packages/editor/src/tiptap/extensions/<my-feature>.ts`:

```ts
// packages/editor/src/tiptap/extensions/strikethrough-task.ts
import { Mark, mergeAttributes } from "@tiptap/core";

export const StrikethroughTask = Mark.create({
  name: "strikethrough_task",
  inclusive: false,

  addAttributes() {
    return { reason: { default: null } };
  },

  parseHTML() {
    return [{ tag: "s[data-strikethrough-task]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "s",
      mergeAttributes(HTMLAttributes, { "data-strikethrough-task": "true" }),
      0,
    ];
  },

  addCommands() {
    return {
      setStrikethroughTask:
        (reason: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { reason }),
      unsetStrikethroughTask:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addInputRules() {
    return [
      /* … */
    ];
  },
});
```

Keep the file focused: one extension, public-export the constant,
no other side effects.

### 2. Register it in the editor

Edit [`packages/editor/src/tiptap/index.ts`](../../packages/editor/src/tiptap/index.ts)
to include the extension where the editor's extension list is
assembled:

```ts
import { StrikethroughTask } from "./extensions/strikethrough-task";

export const latticeExtensions = [
  StarterKit.configure({
    /* … */
  }),
  WikiLink,
  Callout,
  MathInline,
  MathBlock,
  Fenced,
  StrikethroughTask, // ← add here
  // …
];
```

The order matters when extensions compete for the same input rules
or commands; new extensions usually go after the StarterKit and
before the more-specific ones.

### 3. Schema considerations

If your extension is a `Node`, decide:

- **Where it lives in the schema.** Block-level (sibling of
  `paragraph`)? Inline (child of `paragraph`)? The schema declares
  this via `group`.
- **Whether it has children.** A `Callout` does (`content:
"block+"`); a `Math` block doesn't (`content: ""`).
- **Whether it's draggable / selectable.** Set `draggable: true`
  for top-level blocks; `selectable: false` for utility wrappers.

Update the central schema in
[`packages/editor/src/tiptap/schema.ts`](../../packages/editor/src/tiptap/schema.ts)
if your node needs to coexist with other block / inline groups —
otherwise the extension's own `addOptions` keep it self-contained.

### 4. Markdown serialisation contract

The serialiser is **separate** from the extension. If your extension
introduces something that changes how a note serialises to disk, you
have two choices:

**Choice A — match an existing CommonMark+GFM construct.** The
serialiser already handles it; you only need to wire the
parser-side mapping in
[`packages/editor/src/markdown/parser.ts`](../../packages/editor/src/markdown/parser.ts)
to produce the new node when reading.

**Choice B — introduce a Lattice extension.** Per
[ADR-0015](../decisions/0015-markdown-flavor-and-serialization.md):

- Pick a stable serialised form. For a typed block, use a fenced
  code-block with `lattice:<kind>` info-string and JSON content.
- Add the case to **both** the TS serialiser
  ([`packages/editor/src/markdown/serializer.ts`](../../packages/editor/src/markdown/serializer.ts))
  and the Rust serialiser
  ([`core/lattice-core/src/markdown/serializer.rs`](../../core/lattice-core/src/markdown/serializer.rs)).
- Add a fixture under
  [`tests/markdown-roundtrip/`](../../tests/markdown-roundtrip/)
  exercising the new shape — recipe at
  [`add-a-markdown-roundtrip-fixture.md`](add-a-markdown-roundtrip-fixture.md).

Both serialisers must agree byte-for-byte; the corpus is the gate.

### 5. Slash command (optional)

If users will insert this block via the slash menu, register it in
[`packages/editor/src/tiptap/slash-items.ts`](../../packages/editor/src/tiptap/slash-items.ts):

```ts
{
  id: "strikethrough_task",
  title: "Cancelled task",
  keywords: ["task", "cancelled", "strike"],
  description: "Mark a task as cancelled.",
  group: "marks",
  command: ({ editor }) => editor.chain().focus().setStrikethroughTask("").run(),
}
```

Items sort within their `group` (`blocks` / `marks` / `embeds`).

### 6. Tests

Three levels of test:

**Extension unit** — does the extension exist and can it be added to
an editor? Lives under
[`packages/editor/src/tiptap/__tests__/`](../../packages/editor/src/tiptap/__tests__/).

```ts
import { Editor } from "@tiptap/core";
import { latticeExtensions } from "../index";
import { StrikethroughTask } from "../extensions/strikethrough-task";

it("exposes setStrikethroughTask command", () => {
  const editor = new Editor({
    extensions: [...latticeExtensions],
    content: "<p>hello</p>",
  });
  expect(typeof editor.commands.setStrikethroughTask).toBe("function");
  editor.destroy();
});
```

**Conversion** — does `to-doc.ts` / `from-doc.ts` round-trip the new
node?

**Round-trip fixture** — if step 4 introduced a new on-disk shape.

### 7. Documentation

Add a row to the relevant section of
[`../architecture/editor-internals.md`](../architecture/editor-internals.md).
If the extension changes the keyboard map or the Markdown flavour,
update [`../user-guide/`](../user-guide/) too.

## Verify

```bash
pnpm --filter @lattice/editor test
pnpm --filter @lattice/desktop test
pnpm --filter @lattice/editor typecheck
cargo test -p lattice-core --test markdown_roundtrip
```

Then in the running app: open a note, trigger the extension (slash
menu, keyboard shortcut, paste); save; reopen; assert the on-disk
Markdown is what you expected and the editor restored the same
state.

## Common issues

### "Extension must be of type Node | Mark | Extension"

You exported the wrong shape. The factory is `Node.create({ … })`,
`Mark.create({ … })`, or `Extension.create({ … })`. Don't reach into
TipTap's internals.

### Slash menu shows the item but command does nothing

The `command` function in `slash-items.ts` runs in the editor's
context but **doesn't end with `.run()`** by mistake. TipTap chains
need an explicit terminal `.run()`.

### Round-trip fails after the new extension

The serialiser doesn't know about your node. Either map it to an
existing CommonMark construct or follow the
`lattice:<kind>`-fenced-block pattern (Choice B above) and update
both serialisers.

### Two extensions clash on the same input rule

Order matters. Move the new extension earlier or later in
`latticeExtensions`; if that doesn't help, narrow your input rule's
regex to be more specific.

### TipTap docs link to a 1.x API

We're on 2.x. The 1.x docs are still up but use different names
(`createExtension` vs `Extension.create`). Always cross-reference
the 2.x docs at <https://tiptap.dev/docs>.

## References

- [`../architecture/editor-internals.md`](../architecture/editor-internals.md)
  — full editor architecture.
- [TipTap 2.x docs](https://tiptap.dev/docs) — upstream reference.
- [ProseMirror schema guide](https://prosemirror.net/docs/guide/#schema)
  — what `content`, `group`, `marks` actually mean.
- [ADR-0015](../decisions/0015-markdown-flavor-and-serialization.md)
  — Markdown flavor + custom-node serialisation rules.
- [`add-a-markdown-roundtrip-fixture.md`](add-a-markdown-roundtrip-fixture.md)
  — when the extension changes the on-disk format.
