/**
 * @lattice/core-bindings — typed Rust ↔ TypeScript bridge.
 *
 * The `generated/` directory is rewritten by `cargo test -p lattice-core`
 * (ts-rs runs as part of the type-export tests). CI verifies the generated
 * files match what the current core would emit; if they drift, regenerate
 * locally and commit the diff.
 */

export type { Note } from "./generated/Note";
export type { Tag } from "./generated/Tag";
export type { Link } from "./generated/Link";
export type { LinkKind } from "./generated/LinkKind";
export type { Attachment } from "./generated/Attachment";
export type { VaultInfo } from "./generated/VaultInfo";
export type { LatticeError } from "./generated/LatticeError";
export type { IndexEvent } from "./generated/IndexEvent";
export type { IndexEventKind } from "./generated/IndexEventKind";

// Markdown AST mirror of core/lattice-core/src/markdown/ (v0.2 PR #1).
export type { NoteDoc } from "./generated/NoteDoc";
export type { Block } from "./generated/Block";
export type { Inline } from "./generated/Inline";
export type { ListItem } from "./generated/ListItem";
export type { Row } from "./generated/Row";
export type { Frontmatter } from "./generated/Frontmatter";
export type { FrontmatterEntry } from "./generated/FrontmatterEntry";
export type { Alignment } from "./generated/Alignment";
export type { CalloutKind } from "./generated/CalloutKind";

export const CORE_BINDINGS_VERSION = "0.1.0";
