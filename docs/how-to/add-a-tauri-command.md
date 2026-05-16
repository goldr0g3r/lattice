# How to add a Tauri command

> The recipe for exposing a Rust function to the React renderer over
> Tauri IPC. The conceptual deep dive is at
> [`../architecture/ipc-contract.md`](../architecture/ipc-contract.md).

## When to do it

You're adding new behaviour the renderer needs to call. Examples:

- A new vault-side action ("rename note", "duplicate note").
- A new system query ("get OS theme", "list available languages").
- An event channel from Rust to the renderer (file watcher).

If the renderer can do it locally without the core (formatting a
date, computing a derived value), don't add a command.

## Steps

The flow has three touch points: domain function, command wrapper,
renderer call.

### 1. Domain function in `core/lattice-core`

Put business logic in the core; the IPC layer is thin. Pick the
right module under `core/lattice-core/src/`:

```rust
// core/lattice-core/src/notes.rs
pub async fn rename(vault: &Vault, from: &str, to: &str) -> LatticeResult<NoteSummary> {
    let from_path = vault.resolve_relative(from)?;
    let to_path = vault.resolve_relative(to)?;
    if !from_path.exists() {
        return Err(LatticeError::NoteNotFound { path: from.into() });
    }
    tokio::fs::rename(&from_path, &to_path).await?;
    let mut conn = vault.db().acquire().await?;
    sqlx::query!("UPDATE notes SET path = ? WHERE path = ?", to, from)
        .execute(&mut *conn)
        .await?;
    summarize(&to_path, vault).await
}
```

Conventions:

- `LatticeResult<T>` for return type.
- All filesystem access through `Vault::resolve_relative` so paths
  outside the vault are rejected.
- All DB access through `vault.db().acquire().await?`.
- Add a unit test in the same file under `#[cfg(test)] mod tests`.

### 2. Tauri command in `apps/desktop/src-tauri`

Wrap the domain function with a `#[tauri::command]`:

```rust
// apps/desktop/src-tauri/src/commands/notes.rs
#[tauri::command]
pub async fn note_rename(
    state: State<'_, VaultState>,
    from: String,
    to: String,
) -> Result<NoteSummary, LatticeError> {
    let guard = state.vault.lock().await;
    let vault = guard.as_ref().ok_or_else(no_vault_error)?;
    notes::rename(vault, &from, &to).await
}
```

Then **register** it in `lib.rs` — Tauri's macro is strict about
the list:

```rust
.invoke_handler(tauri::generate_handler![
    commands::notes::note_list,
    commands::notes::note_read,
    commands::notes::note_write,
    commands::notes::note_create,
    commands::notes::note_rename,   // ← add here
])
```

Forgetting this step is the #1 cause of "command not found" errors
at runtime.

### 3. Capability grant

Tauri 2 enforces a CSP-like capability model on IPC. Add the new
command to the matching capability file under
[`apps/desktop/src-tauri/capabilities/`](../../apps/desktop/src-tauri/capabilities/):

```jsonc
{
  // existing fields …
  "permissions": [
    "core:default",
    "core:event:default",
    "dialog:default",
    "fs:allow-app-read",
    "core:webview:default",
    {
      "identifier": "core:command:default",
      "allow": [
        "note_list",
        "note_read",
        "note_write",
        "note_create",
        "note_rename", // ← add here
      ],
    },
  ],
}
```

Without this, the renderer call fails with a "not allowed" error.

### 4. Type generation (`ts-rs`)

If the new command introduces a Rust struct that crosses IPC,
`#[derive(TS)]` it:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../packages/core-bindings/src/generated/")]
pub struct RenameNoteResult { … }
```

Then regenerate:

```bash
cargo test -p lattice-core
git status packages/core-bindings/src/generated/
```

`git status` should show new / modified `.ts` files. **Commit them**
alongside the Rust change. CI's `Verify generated ts-rs bindings are
committed` step fails otherwise.

### 5. Renderer call

```ts
// apps/desktop/src/commands/note-commands.ts
import { invoke } from "@tauri-apps/api/core";
import type { NoteSummary } from "@lattice/core-bindings";

export async function renameNote(
  from: string,
  to: string,
): Promise<NoteSummary> {
  return invoke<NoteSummary>("note_rename", { from, to });
}
```

The argument keys are **snake_case** matching the Rust parameter
names. The return type is the generated TS type from step 4.

### 6. Tests

Two tests minimum:

**Rust** — exercise the domain function:

```rust
// core/lattice-core/src/notes.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn rename_moves_file_and_updates_db() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = Vault::create(tmp.path()).await.unwrap();
        // … seed a note, rename it, assert both filesystem and DB.
    }
}
```

**TypeScript** — mock `invoke` and assert the wrapper:

```tsx
import { vi, expect, it } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

it("renameNote calls note_rename with snake_case keys", async () => {
  const { invoke } = await import("@tauri-apps/api/core");
  vi.mocked(invoke).mockResolvedValue({
    id: "x",
    path: "after.md",
    title: null,
    modified_ms: 0,
  });

  const { renameNote } = await import("./note-commands");
  await renameNote("before.md", "after.md");

  expect(invoke).toHaveBeenCalledWith("note_rename", {
    from: "before.md",
    to: "after.md",
  });
});
```

## Verify

```bash
cargo test -p lattice-core
pnpm --filter @lattice/desktop test
pnpm --filter @lattice/desktop typecheck
git status packages/core-bindings/src/generated/  # should be clean after commit
```

Run `pnpm tauri:dev`; trigger the new command from the renderer's
devtools console:

```ts
await window.__TAURI__.core.invoke("note_rename", {
  from: "old.md",
  to: "new.md",
});
```

A `LatticeError` JSON in the console is fine — that means the
command was found and ran. A "command not found" or "not allowed"
means you missed step 2 or step 3.

## Common issues

### "Command not found" at runtime

You forgot to register the command in
`tauri::generate_handler![...]` in `lib.rs`. Step 2.

### "Not allowed" at runtime

You forgot to add the command to the capability file. Step 3.

### Renderer sees `undefined` instead of the data

Check the snake_case ↔ camelCase contract. Lattice keeps **snake_case
on both sides**; if you accidentally pass `{ noteId: "x" }` from the
renderer to a command expecting `note_id`, Tauri will deserialise
the param to `None` / default.

### `Verify generated ts-rs bindings are committed` fails

You added a new struct with `#[derive(TS)]` but didn't run the test
that regenerates the bindings. Run `cargo test -p lattice-core` and
commit the diff under `packages/core-bindings/src/generated/`.

### Mutex held across `await` causes deadlock

If your command holds `state.vault.lock().await` and the inner code
awaits another mutex (telemetry, watcher), you risk deadlock. Take
the lock, copy / clone what you need, drop the lock, then `.await`.

## References

- [`../architecture/ipc-contract.md`](../architecture/ipc-contract.md) —
  the full IPC story.
- [`apps/desktop/src-tauri/src/commands/`](../../apps/desktop/src-tauri/src/commands/)
  — copy any module here; `notes.rs` is the cleanest model.
- [Tauri 2 `command` reference](https://v2.tauri.app/develop/calling-rust/)
  — upstream docs.
- [`core/lattice-core/src/error.rs`](../../core/lattice-core/src/error.rs)
  — `LatticeError` definition; that's the only error type that's
  allowed to cross IPC.
