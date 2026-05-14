# ADR-0012: Telemetry event schema and versioning

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: telemetry, observability, schema, privacy

## Context

PR #8 ships the v0.1 telemetry pipe. It is **off by default** and **opt-in
per the privacy stance** baked into the product
([`docs/vision.md`](../vision.md) — "Local-first, always"). Once a user opts
in, the schema is on a wire, and the receiver — whether the official Lattice
endpoint or a self-hosted one — must accept events from versions of Lattice
older than itself.

We need a versioning policy that:

- Lets the sender add new optional fields without breaking older receivers.
- Lets the receiver reject obviously-malformed events without exotic logic.
- Stays human-readable in logs and the `docs/telemetry.md` schema doc.
- Doesn't bloat each event with multi-byte version tags or framing.

## Decision

**Every telemetry event is JSON with two header fields:**

- `event` — a stable kebab-case identifier (e.g. `"app.start"`, `"vault.opened"`).
- `schema_minor` — a monotonically increasing `u16` per event type.

**Field-level evolution is additive only.** A field once introduced may
never be removed or have its type changed. Renaming requires shipping a new
event identifier and deprecating the old one. New fields bump
`schema_minor` so receivers can opt-in to the richer shape.

```jsonc
{
  "event": "vault.opened",
  "schema_minor": 1,
  "ts": "2026-05-14T11:30:00Z",
  "client": { "app": "lattice-desktop", "version": "0.1.0", "platform": "windows" },
  "props": {
    "note_count": 1287,
    "vault_size_bucket": "1k-10k"
  }
}
```

Receivers ignore unknown fields. Senders include `schema_minor` on every
event; receivers may key analytics by `(event, schema_minor)` to detect
old senders. The full registry of `(event, schema_minor)` pairs lives in
[`docs/telemetry.md`](../telemetry.md), versioned in Git.

## Consequences

### Positive

- **Zero deploy-coupling.** Receivers can be older than senders; senders
  can be older than receivers. Both work.
- **Forward-compatible.** Adding `props.last_vault_age_days` to
  `vault.opened` is a `schema_minor` bump; older receivers see it as an
  unknown field and drop it.
- **Auditable.** The receiver's dashboards stratify by `schema_minor` so
  outliers from very-old clients are obvious.
- **Privacy-friendly.** Each event ships with the smallest payload that
  conveys the signal; we never ship raw note content, file paths, or
  user identifiers.

### Negative

- **No hard schema validation on the sender.** A typo'd field name
  becomes a "new optional field" instead of a compile-time error. We
  mitigate with a `tracing`-backed audit in dev builds that compares
  every emitted event against the registry in `docs/telemetry.md` and
  warns on drift.
- **`schema_minor` is per-event-type, not global.** Slightly more
  bookkeeping (a small constant per event type vs one constant per app).

### Neutral

- We don't ship a `schema_major` field. A breaking change in an event
  ships as a new event identifier — semantically equivalent to bumping
  the major and clearer to read in dashboards.
- Receivers may compress on the wire (gzip); the JSON shape is the
  contract, not the bytes.

## Alternatives considered

### Option A — Hard semver per event (`event:noteSaved.v1`, `.v2`)

- **Pros**: each version of each event is its own first-class identifier.
- **Cons**: receiver tables explode (1 event family → N tables);
  rolling additive changes still ship as "v2" even though semantically
  the change was backwards-compatible.
- **Why rejected**: too much ceremony for the additive-only case.

### Option C — Centralised schema registry (Avro / Protobuf / JSON Schema)

- **Pros**: machine-checkable; SDK can refuse to send malformed events.
- **Cons**: overkill for v0.1 — adds a deploy dependency (registry
  service) and a build-time codegen step. Lattice's telemetry volume
  doesn't justify the infrastructure for years.
- **Why rejected**: revisit if/when we have >5 receiver-side teams.
  v0.1's needs are met by a doc + an additive-only convention.

### Option D — No versioning (just additive forever)

- **Pros**: smallest event payload.
- **Cons**: dashboards can't tell a 0.1 client from a 1.0 client; we
  can't sunset deprecated fields without breaking ancient senders.
- **Why rejected**: explicit version metadata is too cheap to omit.

## References

- [`docs/telemetry.md`](../telemetry.md) — registry of events and their
  current `schema_minor`.
- ["Schema evolution for analytics events" — Snowplow docs](https://docs.snowplow.io/).
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) —
  the philosophy of "additive only is your friend" applied to events.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — telemetry is opt-in,
  documented under the Security model section.
