# ADR-0019: Graph snapshot data shape, paging, and limits

- **Status**: Accepted
- **Date**: 2026-05-15
- **Deciders**: @goldr0g3r
- **Tags**: graph, cytoscape, ipc, performance, v0.3

## Context

The v0.3 graph view (issue [#46](../../.github/issues/v0.3-tasks.yml))
renders the vault as a node-link diagram in
[Cytoscape.js](https://js.cytoscape.org/). Two scopes ship together:

- **Local view** — the 2-hop neighbourhood of the currently-open note
  (typical size: tens of nodes, hundreds of edges).
- **Global view** — every linked note in the vault (typical size: a
  10 000-note vault has 5–20 k linked notes and 20–80 k edges).

[ARCHITECTURE.md](../../ARCHITECTURE.md) budgets **<100 ms** for a
1 000-node graph snapshot — the IPC round-trip plus the JSON payload
serialise + the Cytoscape layout call, end to end. Beyond 1 000 nodes
the layout engine is what dominates (force-directed is O(n²) without
quadtrees), and the renderer struggles past ~5 000 nodes on mid-range
hardware regardless of how cleanly we serialise.

The shape of the snapshot is therefore a load-bearing decision: it
determines how the snapshot is paged, whether the renderer can
incrementally hydrate, and whether back-end and front-end agree on what
a "node" or an "edge" is.

## Decision

**We will ship a single typed `GraphSnapshot { nodes, edges, scope,
truncated }` shape across the IPC boundary, generated paged-by-default
with a hard 1 000-node ceiling, sliderable up to a 5 000-node hard
maximum.** The `lattice-core` graph crate exposes one Tauri command —
`graph_snapshot(scope: GraphScope) -> GraphSnapshot` — and the
front-end never paginates incrementally; the slider re-fetches.

Concretely:

```rust
pub enum GraphScope {
    Local { note_id: String, depth: u8 },     // depth ≤ 4, default 2
    Global { limit: u32, page: u32 },         // limit ≤ 5_000, default 1_000
}

pub struct GraphSnapshot {
    pub nodes: Vec<GraphNode>,                // capped at scope.limit
    pub edges: Vec<GraphEdge>,                // only edges with both endpoints in nodes
    pub scope: GraphScope,                    // echoed back for client state
    pub truncated: bool,                      // true if the cap dropped real data
    pub total_nodes_estimate: u32,            // SELECT count(*) from notes — for the slider hint
}

pub struct GraphNode {
    pub id: String,                           // note id (vault-relative path until v0.5)
    pub title: String,
    pub tags: Vec<String>,                    // for the colour-by-tag toggle
    pub degree: u16,                          // pre-computed for sizing
}

pub struct GraphEdge {
    pub src: String,
    pub dst: String,
    pub kind: LinkKind,                       // wiki_link | markdown | embed
}
```

Selection priority for the global view (when `limit < total_nodes`):

1. Top-`limit` nodes by **degree** (most-connected first), then
2. Lexical order by `title` to make the cut deterministic.

The `truncated` boolean drives a "Showing 1 000 of N notes — increase
in the depth slider" hint in the UI.

The IPC payload is plain `serde_json` — no binary frame, no streaming.
At 1 000 nodes / 4 000 edges the JSON weighs ~250 KB, well inside one
Tauri IPC message; we revisit if benchmarks regress.

## Consequences

### Positive

- **Predictable budget.** The 1 000-node ceiling is the budget guarantee;
  the slider exists so power users can opt into 5 000 with eyes open.
- **Stable IPC shape.** The single shape works for local and global; the
  front-end has one `GraphView` component that switches its query, not
  its rendering pipeline.
- **Tag colouring without a second round-trip.** `tags` ship with each
  node, so the colour-by-tag toggle is local UI state.
- **Pre-computed `degree`.** Cytoscape sizing reads `degree` directly;
  no need to count edges on the front end after layout.
- **Deterministic truncation.** Degree-then-title means the same vault
  always returns the same top-1 000 nodes — no jitter in the rendered
  set across reloads.

### Negative

- **Re-fetch on slider change.** Bumping the limit from 1 000 → 2 000
  refetches the whole snapshot rather than appending. We accept the
  ~150 ms extra latency for the simpler protocol; sliders move rarely.
- **5 000-node hard max** means a 20 k-note vault never sees its full
  graph at once. Mitigation: the local view + path search (post-v0.3)
  cover targeted exploration; the global view is for shape/health
  intuition, not exhaustive review.
- **`total_nodes_estimate` requires a `count(*)` per call.** O(1) in
  SQLite once `notes.path` is indexed (it is — see
  [`migrations/0001_init.sql`](../../core/lattice-core/migrations/0001_init.sql)).

### Neutral

- We choose `Vec<String>` over a separate `tag_id` table for the wire
  shape; tag deduplication is the renderer's job. Wire size impact for
  realistic vaults (~3 tags per note × 5 bytes avg × 1 000 nodes ≈
  15 KB) is negligible.
- `LinkKind` is reused verbatim from
  [`core/lattice-core/src/types.rs`](../../core/lattice-core/src/types.rs)
  so the type compiles against the existing `Link` row without a
  separate enum.

## Alternatives considered

### Option A — Streaming IPC (push nodes/edges in batches)

- **Pros**: client could render progressively.
- **Cons**: Tauri 2 IPC is request/response with no first-class
  streaming; we'd need to bolt on event-based delivery and
  reconciliation. Significant complexity for a feature most users will
  use at <500 nodes.
- **Why rejected**: complexity vs. negligible UX win at our budget
  scale.

### Option B — Server-side layout (computed in Rust, shipped as positions)

- **Pros**: deterministic across machines; lighter client.
- **Cons**: force-directed layouts are interactive (drag, pin, zoom);
  the layout engine has to live where the user can manipulate it.
  We'd ship positions only to throw them out on first drag.
- **Why rejected**: wrong layer.

### Option C — Unbounded snapshot, let Cytoscape handle it

- **Pros**: simplest API.
- **Cons**: a 20 k-note vault stalls the renderer for seconds. Our
  perf budget is 100 ms for 1 000 nodes; this approach blows it by
  10×–100×.
- **Why rejected**: perf budget violation.

### Option D — Two separate commands, `graph_local` and `graph_global`

- **Pros**: smaller per-command surface; type per scope.
- **Cons**: duplicates the wire types and the renderer dispatch logic.
  The `GraphScope` enum captures the difference with no payload
  duplication.
- **Why rejected**: two ways to do the same thing across IPC is a
  smell.

## References

- [Cytoscape.js performance guide](https://js.cytoscape.org/#notation/performance) — layout cost vs. node count.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — graph snapshot budget.
- [ADR-0002](0002-rust-core-sqlx-sqlite.md) — SQLite metadata source
  for nodes / edges.
- v0.3 issue [#46](../../.github/issues/v0.3-tasks.yml) — graph view
  acceptance criteria this ADR locks.
