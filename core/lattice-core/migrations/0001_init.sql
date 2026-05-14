-- Lattice core metadata schema (v0.1).
--
-- The vault on disk is the source of truth (ADR-0006); this database is a
-- rebuildable cache. If it is deleted, the watcher re-scans the vault and
-- regenerates every row.

CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    title         TEXT,
    frontmatter   TEXT,
    body_hash     TEXT,
    created       TEXT NOT NULL,
    updated       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notes_path_idx ON notes(path);
CREATE INDEX IF NOT EXISTS notes_updated_idx ON notes(updated);

CREATE TABLE IF NOT EXISTS tags (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id       TEXT NOT NULL,
    tag_id        INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id)  REFERENCES tags(id)  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS note_tags_tag_idx ON note_tags(tag_id);

CREATE TABLE IF NOT EXISTS links (
    src           TEXT NOT NULL,
    dst           TEXT NOT NULL,
    kind          TEXT NOT NULL,
    PRIMARY KEY (src, dst, kind)
);

CREATE INDEX IF NOT EXISTS links_dst_idx ON links(dst);
CREATE INDEX IF NOT EXISTS links_src_idx ON links(src);

CREATE TABLE IF NOT EXISTS attachments (
    id            TEXT PRIMARY KEY NOT NULL,
    note_id       TEXT NOT NULL,
    path          TEXT NOT NULL,
    mime          TEXT,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS attachments_note_idx ON attachments(note_id);
