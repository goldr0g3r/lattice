# Sync internals

> The v0.5 sync story. CRDTs, the reference server, and end-to-end
> encryption. Decision context:
> [ADR-0005 — Yjs (yrs) for CRDT sync](../decisions/0005-yrs-crdt-sync.md),
> [ADR-0006 — Local-first plain Markdown as source of truth](../decisions/0006-local-first-plain-markdown.md).
>
> **Status (pre-v0.5):** [`core/lattice-sync/`](../../core/lattice-sync/)
> is a stub today. This page captures the **target** architecture that
> v0.5 implements, so a contributor picking up the milestone has the
> playbook.

## Goals

- **Multi-device editing** of the same vault, online or offline, with
  automatic conflict resolution.
- **Self-hostable** sync server. No mandatory Lattice Cloud.
- **End-to-end encrypted** — the server sees ciphertext only.
- **Optional, never default.** Sync is enabled per-vault via
  Settings; the on-disk vault works fine without it.

## Why CRDTs

Two reasonable models for sync:

- **Operational Transform (OT)** requires a central authority to
  enforce a total order on operations. It works (Google Docs is OT),
  but it contradicts local-first: you can't merge offline edits
  without the server.
- **Conflict-free Replicated Data Types (CRDTs)** merge concurrent
  edits via algebra, no central authority needed. Two devices that
  diverged offline converge to the same state when they meet again,
  full stop.

Lattice picks **Yjs** ([`yrs`](https://github.com/y-crdt/y-crdt) Rust
port) for the editor data model, and the [`y-sync`](https://github.com/yjs/y-sync)
protocol over WebSocket for transport. See
[ADR-0005](../decisions/0005-yrs-crdt-sync.md) for the alternatives
considered (Automerge, Diamond Types, custom OT) and why Yjs won.

## On-disk shape

When sync is enabled per-vault:

```text
~/MyVault/
├─ Engineering/
│  ├─ Distributed Systems.md
│  ├─ Distributed Systems.note.crdt        ← sibling Yjs state
│  └─ …
└─ .lattice/
   ├─ sync/
   │  ├─ identity.bin                       ← libsodium long-term key (encrypted at rest)
   │  ├─ session.json                       ← server URL, vault id, last-sync clocks
   │  └─ pending/                           ← queued ops while offline
   └─ …
```

When sync is **disabled**, no `.note.crdt` files are created. The
Markdown remains authoritative full-stop.

When sync is **enabled**:

- The Yjs document is the editor's runtime source of truth.
- On every save, `crdt → markdown serialise → atomic write`.
- The `.note.crdt` carries the operation log; the `.md` is a
  derived artefact for tools that don't speak Yjs.

If a user opens a synced note in `vim` and saves — the file watcher
sees an external write, parses the new `.md`, and rebuilds the CRDT
from it (replacing the previous CRDT state). External tools work, at
the cost of the per-character history that lived in the CRDT.

## Editor wiring

The editor side uses
[`y-prosemirror`](https://github.com/yjs/y-prosemirror) — the
official ProseMirror binding for Yjs:

```ts
import { ySyncPlugin, yUndoPlugin, undo, redo } from "y-prosemirror";
import * as Y from "yjs";

const ydoc = new Y.Doc();
const yXmlFragment = ydoc.getXmlFragment("prosemirror");
const view = new EditorView(node, {
  state: EditorState.create({
    schema,
    plugins: [
      ySyncPlugin(yXmlFragment),
      yUndoPlugin(),
      // … the rest of the editor plugins
    ],
  }),
});
```

The TipTap schema doesn't change to support sync — `y-prosemirror`
adapts the existing schema to a Yjs `XmlFragment`. The same `NoteDoc`
round-trip applies; we just have an additional layer that turns
keystroke deltas into Yjs ops.

## Core wiring

`lattice-sync` exposes a `SyncClient`:

```rust
pub struct SyncClient { … }

impl SyncClient {
    /// Connect to a sync server with the user's identity key.
    pub async fn connect(server: &Url, identity: &SecretKey) -> Result<Self, SyncError>;

    /// Subscribe to remote updates for one note.
    pub async fn subscribe(&self, note_id: &str, on_update: impl Fn(yrs::Update)) -> Subscription;

    /// Push a local update.
    pub async fn push(&self, note_id: &str, update: &yrs::Update) -> Result<(), SyncError>;

    /// Disconnect cleanly.
    pub async fn close(self) -> Result<(), SyncError>;
}
```

The desktop shell wires the editor's `ydoc` to the `SyncClient`
through a thin adapter; the editor doesn't know about transport.

## Server protocol

`y-sync` over **WebSocket** with TLS. One WebSocket per `(client,
vault)` pair; messages are framed length-prefixed binary:

```text
[u8 type] [u32 len] [body…]

types:
  0x01 SyncStep1     — client tells server its state vector
  0x02 SyncStep2     — server replies with the diff
  0x03 Update        — incremental update (either direction)
  0x04 Awareness     — presence (post-v1.0; not implemented in v0.5)
```

Bodies are the **encrypted** Yjs binary updates — see the
[Encryption](#encryption) section below. The server can route /
relay them but cannot decrypt them.

## Encryption

End-to-end via `libsodium`:

- **Identity** — Ed25519 keypair per device, generated on first
  enable. Stored encrypted at rest under `<vault>/.lattice/sync/identity.bin`,
  unlocked with a passphrase the user sets.
- **Vault key** — symmetric XChaCha20-Poly1305 key per vault.
  Generated by the first device that enables sync; shared with
  additional devices via a one-time pairing code (a
  passphrase-encrypted bundle the user copy-pastes).
- **Wire format** — every Yjs update is encrypted with the vault
  key before being sent; the WebSocket transports ciphertext only.

The server signs neither device identities nor messages; the only
trust is in the encryption key. A malicious server can drop messages
or replay ciphertext, but it can't forge content or read it.

## Conflict resolution

Yjs handles the easy case automatically: two concurrent inserts at
different offsets merge fine; two concurrent inserts at the **same**
offset are ordered by client id (the device's persistent ID). Both
edits land; the user sees both.

The hard case is **a synced note edited on disk while a Yjs client
is also editing it**. This is rare (you're either using the editor
or you're using `vim`, not both at once on the same machine), but it
happens — typically when someone edits in a different OS-level tool
or pastes from a script. The watcher sees the on-disk write; the
v0.2 conflict UI from
[ADR-0013](../decisions/0013-vault-conflict-resolution-ux.md) prompts
"keep mine / take theirs / show diff".

For files **under sync**, a future ADR (post-v0.5) may swap that
prompt for an automatic three-way merge using Yjs's history. The
shape is on the roadmap; not the v0.5 scope.

## Reference server

Built into `server/` (a separate workspace member added in v0.5).
Stack:

- **Axum** — HTTP + WebSocket framework.
- **`y-sync`** — Yjs sync protocol.
- **SQLite or Postgres** — relay state per vault (`(vault_id,
client_id, last_seq)` rows). The server doesn't store the actual
  document content beyond a small in-memory or short-lived cache.
- **S3-compatible blob store** — for attachments. Same E2EE as
  documents; the server hands out signed put/get URLs but never
  sees plaintext.

A one-tap deploy guide for Fly.io / Railway / Docker lands in v0.5
under `docs/operations/sync-server.md` (TBD).

## Mobile (v0.6)

Sync ships before mobile because mobile **needs** sync to be useful.
The Android shell uses the same `lattice-sync` Rust crate, talks the
same protocol, with two adjustments:

- **Reduced fanout.** Mobile keeps fewer Yjs docs in memory at once
  — the open-and-drop policy from
  [ADR-0005](../decisions/0005-yrs-crdt-sync.md).
- **Background sync** uses Android's `WorkManager` to wake on Wi-Fi,
  catch up, and sleep again.

## Performance budget

| Operation                                      | Target         |
| ---------------------------------------------- | -------------- |
| Initial sync of a 10 k-note vault (LAN)        | < 30 s         |
| Steady-state per-keystroke replication latency | < 200 ms p99   |
| Memory overhead per open Yjs doc               | < 1 MB typical |

We measure these via an integration harness in
`core/lattice-sync/tests/` once v0.5 lands; until then the numbers
are targets, not gates.

## Failure modes

- **Server unreachable.** Client buffers updates in
  `<vault>/.lattice/sync/pending/`; flushes on reconnect. UI shows
  an "offline" indicator, doesn't block edits.
- **Vault key lost.** No way to recover the synced state; the user
  has to wipe the vault and re-pair from a device that still holds
  the key. Prominent warning during the "create new vault key"
  flow.
- **Out-of-order updates.** Yjs handles them by design.
- **Update over the WebSocket size limit.** The reference server
  caps at 16 MB per message; over that, we chunk client-side.
- **Two devices online with same id.** We re-issue a new client id
  to the second device; presence indicators ride on top.

## What's not in scope for v0.5

- **Real-time multiplayer with presence cursors.** The CRDT
  supports it (Yjs awareness), but the UX work is post-v1.0.
- **Public shareable pages.** Same machinery, different threat
  model; separate design.
- **CRDT-driven three-way merge** for the v0.2 conflict UI. We
  revisit when v0.5 sync is in production.

When the v0.5 milestone is in flight, this page becomes the
source-of-truth — code lands, citations get updated, performance
numbers move from "target" to "measured".
