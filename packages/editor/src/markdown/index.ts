/**
 * Markdown parser + serializer (TS mirror of `core/lattice-core/src/markdown/`).
 *
 * Round-trip gate: `serialize(parse(input)) === input` for every fixture in
 * [`tests/markdown-roundtrip/`](../../../../tests/markdown-roundtrip/). The
 * matching Rust gate lives at `core/lattice-core/tests/markdown_roundtrip.rs`.
 */

export { parse } from "./parser";
export { serialize } from "./serializer";
export type {
  Alignment,
  Block,
  CalloutKind,
  Frontmatter,
  FrontmatterEntry,
  Inline,
  ListItem,
  NoteDoc,
  Row,
} from "@lattice/core-bindings";
