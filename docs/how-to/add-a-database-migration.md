# How to add a database migration

> The SQLite metadata schema lives at
> [`core/lattice-core/migrations/`](../../core/lattice-core/migrations/).
> `sqlx::migrate!` runs every migration in order on vault open. The
> conceptual story is at
> [`../architecture/data-model.md#sqlite-index--vaultlatticeindexdb`](../architecture/data-model.md#sqlite-index--vaultlatticeindexdb).

## When to do it

You're changing the **shape** of the metadata index. Examples:

- New column on `notes` (e.g. `body_excerpt`).
- New table (e.g. `task_items` for v0.4).
- New index for a query that's hitting a perf budget.

You **don't** need a migration when:

- You're only changing how a value is computed (the column type and
  meaning is the same).
- The change is to attached files / Tantivy / runtime caches —
  those rebuild on demand.
- You're tweaking pure SQL queries against the existing schema.

## Migration discipline

Three rules:

1. **Migrations are append-only.** Once `0001_init.sql` is in `main`,
   it never changes — even if it's "wrong". Fix forward with a
   subsequent migration.
2. **Migrations are forward-only.** No down-migrations. The `index.db`
   is a rebuildable cache; if a user needs to roll back, they delete
   `<vault>/.lattice/index.db` and reopen.
3. **Schema migrations are minor-version-bound.** A migration in
   v0.X.0 may not be undone in v0.X.1. Don't introduce a migration
   you might want to revert; sit on it for a milestone if uncertain.

## Steps

### 1. Pick the next number

```bash
ls core/lattice-core/migrations/
```

Migrations are `<NNNN>_<title>.sql`. Take the next free 4-digit
number. Title is short and descriptive (`add_notes_excerpt`,
`create_task_items`).

### 2. Write the SQL

```sql
-- core/lattice-core/migrations/0002_add_notes_excerpt.sql

ALTER TABLE notes ADD COLUMN excerpt TEXT;

CREATE INDEX IF NOT EXISTS notes_excerpt_idx ON notes(excerpt);
```

Conventions we follow (mirror the existing
[`0001_init.sql`](../../core/lattice-core/migrations/0001_init.sql)):

- One **logical change** per migration.
- `IF NOT EXISTS` on `CREATE` statements — re-running is a no-op.
- Capital `CREATE TABLE`, capital `PRIMARY KEY`, capital `FOREIGN
KEY`. Two spaces between columns, type, and constraints.
- A header comment naming the migration and pointing at the issue
  / ADR if it's non-obvious.

### 3. Update Rust code that touches the schema

If you added a column, the corresponding `sqlx::query_as!` /
`sqlx::query!` invocations must reference it. Update:

- The struct in
  [`core/lattice-core/src/types.rs`](../../core/lattice-core/src/types.rs)
  or the relevant module (e.g. `Note`, `NoteSummary`).
- All `SELECT` / `INSERT` / `UPDATE` statements that touch the
  table.
- The `#[derive(TS)]` will refresh the TS bindings on the next
  `cargo test -p lattice-core`.

`sqlx::query!` is **compile-time-checked** against a real database
file at `DATABASE_URL`. If you forget to wire one up, set:

```bash
export DATABASE_URL="sqlite:///tmp/lattice-build.db"
```

…then run `cargo sqlx prepare` to bake the offline metadata into
`.sqlx/`. CI uses the offline metadata, so the prepared files must
be committed.

### 4. Backfill if needed

If the new column needs a derived value for existing rows, do the
backfill **in the migration** — pure SQL, no Rust:

```sql
UPDATE notes SET excerpt = substr(title, 1, 120) WHERE excerpt IS NULL;
```

Don't backfill in Rust at vault-open time; that mixes "is the
schema migration applied?" with "is the data populated?" and makes
debugging miserable.

### 5. Add a test

Two cases to cover:

**Migration runs cleanly on a fresh DB:**

```rust
// core/lattice-core/src/db.rs (or a dedicated test file)
#[tokio::test]
async fn migrations_apply_to_fresh_database() {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    // Assert the new column / table / index exists.
    let row = sqlx::query!(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'"
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(row.sql.unwrap_or_default().contains("excerpt"));
}
```

**Migration runs cleanly on top of the previous schema** (the
"upgrade" path):

The `sqlx::migrate!()` macro handles ordering automatically; the
previous test exercises the full chain. If you need a regression
test for the upgrade-from-N path specifically, seed an in-memory DB
with a hand-written subset of the previous schema, then run the new
migration.

### 6. Update the data-model doc

Edit [`../architecture/data-model.md`](../architecture/data-model.md)
to reflect the new column / table.

## Verify

```bash
cargo test -p lattice-core
cargo sqlx prepare --workspace      # if you used sqlx::query!
git status .sqlx/                   # offline metadata may have changed
git diff core/lattice-core/migrations/
```

Then, in a real vault:

```bash
pnpm tauri:dev
# In the app, open a fresh vault. Check that .lattice/index.db reflects the new schema:
# sqlite3 ~/test-vault/.lattice/index.db ".schema notes"
```

The output of `.schema notes` should include the new column.

## Common issues

### "no such column: excerpt"

Either:

1. The migration didn't run — old `index.db` carrying the old
   schema. Delete the file; reopen the vault.
2. The migration ran but you forgot to update the Rust struct.
   Re-check `sqlx::query_as!` against your `Note` struct.

### `cargo sqlx prepare` fails

Set `DATABASE_URL` to a real (or in-memory) SQLite URL. The macro
needs a live DB to typecheck queries:

```bash
export DATABASE_URL="sqlite:///tmp/lattice-build.db"
sqlx database create
sqlx migrate run --source core/lattice-core/migrations
cargo sqlx prepare --workspace
```

### Migration changes a column type

SQLite doesn't really support `ALTER TABLE … ALTER COLUMN`. The
recipe is:

```sql
CREATE TABLE notes_new ( /* new shape */ );
INSERT INTO notes_new SELECT … FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
-- recreate indexes, foreign keys
```

Test this thoroughly; it's the failure mode that loses data if
mishandled.

### Existing user vaults don't auto-migrate

They do — `sqlx::migrate!` runs every migration that hasn't been
recorded in the `_sqlx_migrations` table. The first time a user opens
a vault on a new app version, the migration applies. If a user
reports it didn't, ask for the `index.db` and the
`<vault>/.lattice/logs/lattice.*.log` — there'll be a `tracing` line
indicating the migration error.

### Forgot to commit `.sqlx/` offline metadata

CI fails the Rust build with an `sqlx::query!` macro error. Run
`cargo sqlx prepare --workspace` and commit the diff under `.sqlx/`.

## References

- [`../architecture/data-model.md`](../architecture/data-model.md) —
  the schema documented in prose.
- [`core/lattice-core/migrations/`](../../core/lattice-core/migrations/)
  — the actual files.
- [`core/lattice-core/src/db.rs`](../../core/lattice-core/src/db.rs)
  — the pool + migration runner.
- [`sqlx::migrate!`](https://docs.rs/sqlx/latest/sqlx/macro.migrate.html)
  — upstream macro docs.
- [SQLite ALTER TABLE limits](https://www.sqlite.org/lang_altertable.html)
  — the workaround for unsupported alterations.
