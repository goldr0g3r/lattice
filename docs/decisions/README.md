# Architecture Decision Records

> Light-weight, append-only log of the consequential decisions that shape Lattice.

## What is an ADR?

An **Architecture Decision Record** is a short Markdown file that captures
**a single architecturally significant decision**, the context that prompted it,
the alternatives that were considered, and the consequences of the choice.

We follow a trimmed [MADR](https://adr.github.io/madr/) format — see
[`0000-template.md`](0000-template.md).

## Why we keep them

- Future contributors (including future-us) can ask **"why is this like this?"**
  and get a real answer instead of guessing.
- Reversing a decision is easy when the reasoning is written down — you just
  refute the original Context.
- Code review for foundational changes becomes "does the ADR exist?" instead
  of "did the entire team align on Slack?".

## Lifecycle

```text
Proposed  -->  Accepted  -->  Deprecated
                     \--->  Superseded by ADR-XXXX
```

- **Proposed** — open as a PR for discussion; merges only once the decision is final.
- **Accepted** — merged to `main`; the decision is in effect.
- **Deprecated** — the decision no longer applies, but no replacement was needed.
- **Superseded** — replaced by a newer ADR; the header of the old ADR is
  updated to link forward, and the new ADR's header links back.

ADRs are **never deleted or rewritten in place**. They're an append-only log.

## How to write one

1. Copy [`0000-template.md`](0000-template.md) to `NNNN-<kebab-title>.md`,
   where `NNNN` is the next free four-digit number.
2. Fill in **Context** (one paragraph: what changed in the world that forces
   us to decide now?).
3. Fill in **Decision** (one paragraph in active voice: "We will use X.").
4. Fill in **Consequences** (Positive / Negative / Neutral bullet lists).
5. Fill in **Alternatives considered** — at least two, with why-rejected.
6. Open a PR titled `docs(adr): NNNN <decision title>`. Tag relevant reviewers.
7. When merged, link it from the table below.

## Index

| #    | Title                                                               | Status   | Date       |
| ---- | ------------------------------------------------------------------- | -------- | ---------- |
| 0001 | [Tauri 2 as the cross-platform shell](0001-tauri-2-cross-platform-shell.md) | Accepted | 2026-05-13 |
| 0002 | [Rust + sqlx + SQLite for the core](0002-rust-core-sqlx-sqlite.md)  | Accepted | 2026-05-13 |
| 0003 | [TipTap (ProseMirror) as the editor](0003-tiptap-prosemirror-editor.md) | Accepted | 2026-05-13 |
| 0004 | [Tantivy for full-text search](0004-tantivy-full-text-search.md)    | Accepted | 2026-05-13 |
| 0005 | [Yjs (yrs) for CRDT sync](0005-yrs-crdt-sync.md)                    | Accepted | 2026-05-13 |
| 0006 | [Local-first plain Markdown as source of truth](0006-local-first-plain-markdown.md) | Accepted | 2026-05-13 |
| 0007 | [AGPL-3.0 license](0007-agpl-3-license.md)                          | Accepted | 2026-05-13 |
| 0008 | [pnpm + Turborepo monorepo](0008-pnpm-turborepo-monorepo.md)        | Accepted | 2026-05-13 |
| 0009 | [Conventional Commits + squash-merge + trunk-based dev](0009-conventional-commits-trunk-based.md) | Accepted | 2026-05-13 |
| 0010 | [Design tokens and typography](0010-design-tokens-and-typography.md) | Accepted | 2026-05-13 |
| 0011 | [Font-loading strategy](0011-font-loading-strategy.md)              | Accepted | 2026-05-14 |
| 0012 | [Telemetry event schema and versioning](0012-telemetry-event-schema-versioning.md) | Accepted | 2026-05-14 |
| 0013 | [Vault-conflict resolution UX](0013-vault-conflict-resolution-ux.md) | Accepted | 2026-05-14 |
| 0014 | [File-watcher debounce window](0014-file-watcher-debounce.md)       | Accepted | 2026-05-14 |
