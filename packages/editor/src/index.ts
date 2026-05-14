/**
 * `@lattice/editor` — TS mirror of the Rust editor surface.
 *
 * v0.2 PR #1 (merged): Markdown parser/serializer pair under `./markdown/`.
 * v0.2 PR #2 (this PR): TipTap block editor + slash command menu under
 * `./tiptap/`. Both surfaces share the `NoteDoc` AST exported from
 * `@lattice/core-bindings`.
 */

export * from "./markdown";
export * from "./tiptap";

export const EDITOR_PACKAGE_VERSION = "0.1.0";
