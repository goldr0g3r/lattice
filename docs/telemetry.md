# Telemetry

> Lattice telemetry is **off by default**. Nothing is collected unless the
> user opts in via `Settings → Telemetry → Enable`.
> Decision record:
> [ADR-0012](decisions/0012-telemetry-event-schema-versioning.md).
> Pipe implementation: `core/lattice-core/src/telemetry.rs` (PR #8).

## Stance

- **Off by default.** First-launch behaviour: zero events emitted.
- **Local-first.** When enabled, events are appended to a JSONL file under
  `<vault>/.lattice/logs/telemetry.jsonl`. The user owns the file; they can
  inspect, redact, delete, or rsync it to a self-hosted receiver. The
  in-app shipper that POSTs batches to a configured endpoint lands in a
  follow-up PR; for now, "self-hosted endpoint" means "anything that can
  consume JSONL on disk".
- **No vault content.** Events carry typed `props` only — never note
  bodies, full paths, or any user-authored text. The exhaustive
  registry below documents every field.
- **No identifiers.** No user id, no device fingerprint, no IP-derived
  geolocation. The `client` tag is `{ app, version, platform }` and
  nothing else.

## Wire shape

Every event is one JSON object on its own line:

```json
{
  "event": "vault.opened",
  "schema_minor": 1,
  "ts": "2026-05-14T11:30:00Z",
  "client": {
    "app": "lattice-desktop",
    "version": "0.1.0",
    "platform": "windows"
  },
  "props": {
    "note_count": 1287,
    "vault_size_bucket": "1k-10k"
  }
}
```

Field-level evolution is **additive only** per
[ADR-0012](decisions/0012-telemetry-event-schema-versioning.md). New
fields bump `schema_minor`; receivers ignore unknown fields.
Renaming requires shipping a new `event` name and deprecating the old.

## Settings

Persisted in `<user-config-dir>/lattice/config.json` under the `telemetry`
key:

```json
{
  "last_vault": "/Users/me/MyVault",
  "telemetry": {
    "enabled": false,
    "endpoint": ""
  }
}
```

The desktop shell exposes this via the
`telemetry_settings_get` / `telemetry_settings_set` Tauri commands
(`apps/desktop/src-tauri/src/commands/system.rs`).

## Event registry (v0.1)

The exhaustive list of events that may ship in v0.1. Anything not listed
here will not be emitted by the in-tree code; reviewers should reject
PRs that add new events without updating this table.

| Event          | `schema_minor` | Trigger                               | `props` shape                                                                              |
| -------------- | -------------: | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app.start`    |              1 | Process boot, after logging is up.    | `{ "cold_start_ms": number }`                                                              |
| `app.shutdown` |              1 | Graceful shutdown.                    | `{ "uptime_seconds": number }`                                                             |
| `vault.opened` |              1 | After `vault_open` succeeds.          | `{ "note_count": number, "vault_size_bucket": "0-100" \| "100-1k" \| "1k-10k" \| "10k+" }` |
| `vault.closed` |              1 | After `vault_close`.                  | `{ "uptime_seconds": number }`                                                             |
| `index.tick`   |              1 | One file-watcher debounce tick.       | `{ "events_in_batch": number, "debounce_ms": number, "tick_latency_ms": number }`          |
| `crash.report` |              1 | Uncaught panic captured by the shell. | `{ "kind": string, "backtrace_hash": string }` — backtrace is hashed; no symbol names ship |

> Buckets coarsen high-cardinality counters so individual users aren't
> identifiable from the dataset.

## Adding a new event

1. Append a row to the table above.
2. Pick a stable kebab-case `event` name (`<domain>.<verb>`).
3. Start at `schema_minor: 1`.
4. Emit via `TelemetryClient::emit(event, schema_minor, app_version, props)`.
5. Reviewer must confirm `props` doesn't leak content.

## Adding a field to an existing event

1. Bump `schema_minor` for that event in the table.
2. Add the new field to the `props` shape column.
3. Make the field optional in the receiver schema.
4. Reviewer must confirm backward-compatibility (receivers of earlier
   `schema_minor` keep working).
