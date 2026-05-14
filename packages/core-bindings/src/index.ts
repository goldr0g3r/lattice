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

export const CORE_BINDINGS_VERSION = "0.1.0";
