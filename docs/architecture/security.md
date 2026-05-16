# Security

> The threat model in detail. Lattice's security stance is summarised
> in [`../../SECURITY.md`](../../SECURITY.md); this page is the
> deeper architectural picture and the work-in-progress posture for
> v0.1 → v1.0.

## Stance

Lattice is a **local-first desktop / mobile** app. The threat model
focuses on:

1. **Local data integrity** — corruption, partial writes, races
   against the file watcher.
2. **Plugin sandboxing** — plugins must not be able to escape the
   WASM sandbox or read files outside their granted capabilities.
3. **Sync confidentiality** — the optional sync server must never
   see plaintext.
4. **AI provider isolation** — note content is only sent to a
   configured AI provider when the user explicitly triggers an
   action; keys are stored in the OS keychain.
5. **Web-clipper isolation** — the browser extension talks to the
   local app over a localhost channel authenticated with a per-vault
   token.

Out of scope:

- **Physical access** to an unlocked device. We don't encrypt the
  vault on disk; the OS does (use full-disk encryption).
- **Compromised AI providers.** We don't proxy through our infra; if
  OpenAI logs your prompt, that's between you and OpenAI.
- **Self-hosted sync servers run by the user themselves.** We
  guarantee the server can't read content, but we can't audit
  someone else's deployment.

The full reporting flow for vulnerabilities is in
[`../../SECURITY.md`](../../SECURITY.md). Use GitHub's private
vulnerability reporting; **don't** open public issues for security
bugs.

## Per-component posture

### Tauri shell (per [ADR-0001](../decisions/0001-tauri-2-cross-platform-shell.md))

- **CSP locked** in the WebView. The current value is in
  [`apps/desktop/src-tauri/tauri.conf.json`](../../apps/desktop/src-tauri/tauri.conf.json):

  ```text
  default-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self' ipc: http://ipc.localhost
  ```

  No `script-src 'unsafe-inline'`. The renderer can't `eval`
  arbitrary strings. `'unsafe-inline'` for styles is required by
  Radix and the cmdk library; we accept it for v0.1 and revisit
  with `style-src-attr` in v0.4.

- **Capability files** at
  [`apps/desktop/src-tauri/capabilities/`](../../apps/desktop/src-tauri/capabilities/)
  enumerate which IPC commands and Tauri-plugin verbs the renderer
  may call. Anything not listed is rejected at the bridge.

- **Updater is signed.** Tauri's updater plugin verifies signed
  manifests; updates that don't validate are rejected. Key
  rotation is documented in `docs/operations/updater-keys.md` (TBD,
  v0.1).

- **No remote code execution.** The renderer ships with the bundle;
  there's no remote module loader.

### Filesystem

- **Vault root is the only writable scope** by design. The
  capability file's `fs:` scope is restricted to the vault path
  set at runtime via `Vault::open`. Attempts to write outside the
  vault from the renderer are rejected.
- **Atomic writes** via `tempfile` + `rename` on save, so a crash
  mid-save can't half-write a file. The `notes::write` path uses
  `tokio::fs::rename` after `tokio::fs::write` to a sibling
  temp file.
- **No follow on symlinks** outside the vault root. We resolve
  vault-relative paths and reject anything that escapes.
- **Watcher events are validated.** The watcher rejects events
  whose `path` resolves outside the vault root (Linux can produce
  these via inotify on a moved subdirectory).

### Database

- **`sqlx` with compile-time queries.** No string concatenation,
  no SQL injection vector for an attacker who plants a crafted
  filename. Path strings are parameterised.
- **Index DB is rebuildable.** If a malicious or corrupted DB
  causes panics, the user can delete `<vault>/.lattice/index.db`
  and re-open; nothing is lost.
- **No multi-user model** — there's no auth on the local DB. The
  filesystem owns access control.

### AI providers (v0.4+)

- **Keys live in the OS keychain** via the `keyring` crate. We
  never write API keys to `<vault>/` or to user-config JSON.
- **Per-action consent.** No background calls. A "Chat with vault"
  query sends only the prompt + the selected RAG-context chunks,
  not the entire vault.
- **Local-by-default.** Ollama is a first-class path; users who
  pick it never see any cloud network calls from the AI panel.
- **No vendor middlemen.** Lattice does not proxy AI traffic
  through our infra; calls go device → provider directly.
- **Audit trail.** Every AI call emits a `tracing::info!` with the
  provider name + token count. No prompt or response body is
  logged.

### Sync (v0.5+) — per [ADR-0005](../decisions/0005-yrs-crdt-sync.md)

The full crypto walkthrough is at
[`sync-internals.md#encryption`](sync-internals.md#encryption).
Summary:

- **Per-vault symmetric key**, XChaCha20-Poly1305.
- **Per-device identity**, Ed25519.
- **Server sees ciphertext only.** Even an active attacker on the
  server can't read content; they can drop or replay messages, but
  Yjs's CRDT semantics make replays harmless and missing updates
  re-sync on next handshake.

### Plugins (v0.9+)

- **WASM sandbox.** Plugins are WASM modules running with
  capability-scoped imports. The host (the Lattice runtime)
  decides what each plugin can call.
- **Capability grants are explicit.** A plugin requests
  `vault:read` / `vault:write` / `network` / `clipboard` etc.; the
  user approves on install.
- **No native code execution.** A plugin cannot dlopen, cannot fork,
  cannot ptrace.
- **Isolated state.** Each plugin has a per-vault key-value store
  scoped to its identity; one plugin can't read another's state.
- **AGPL implications.** Plugins are linked through a stable WASM
  ABI, not statically into the host process — this is the boundary
  used to argue plugin authors are not bound by AGPL on their own
  code. The legal reasoning lands in `docs/legal/plugins.md` when
  the SDK ships.

### Web clipper (v0.8+)

- **Localhost-only channel** between the extension and the desktop
  app, authenticated with a **per-vault token** the user
  copy-pastes once during install.
- **Browser permission scope** is the minimum needed: active tab +
  storage. No host-wide permissions.
- **Read-only on the page.** The clipper extracts via Readability,
  doesn't inject scripts into the host page beyond the toolbar
  button.

## Telemetry & privacy

- **Off by default.** No `app.start`, `vault.opened`, etc. emitted
  unless the user opts in.
- **Local-first.** Even when enabled, events stream to a local
  JSONL file under `<vault>/.lattice/logs/telemetry.jsonl`. The
  user is in control of what (if anything) gets uploaded
  elsewhere.
- **No content.** Events carry typed `props` only — counts,
  buckets, latencies. Never note bodies, full paths, or
  user-authored text. Reviewers reject PRs that add new fields
  without updating
  [ADR-0012](../decisions/0012-telemetry-event-schema-versioning.md)
  and [`../telemetry.md`](../telemetry.md).
- **No identifiers.** No user id, no device fingerprint, no
  geolocation. The `client` tag is `{ app, version, platform }`.

## Threats we explicitly defend against

| Threat                                        | Mitigation                                                  |
| --------------------------------------------- | ----------------------------------------------------------- |
| Malicious file in the vault triggers RCE      | CSP + capability file + no `script-src 'unsafe-inline'`.    |
| Crafted Markdown crashes parser               | `pulldown-cmark` is `unsafe-free` Rust + golden corpus tests. |
| Crafted YAML frontmatter exploits parser      | `serde_yaml_ng` (no `serde_yaml` deprecation) — fuzzed.     |
| Symlink escape from vault                     | Watcher + IPC reject paths that resolve outside vault.      |
| Race: external write during in-app save       | Atomic `temp + rename`; conflict UI per [ADR-0013](../decisions/0013-vault-conflict-resolution-ux.md). |
| Plugin reads another plugin's state           | WASM sandbox + per-plugin KV namespace.                     |
| AI provider leaks vault content               | User explicit consent + provider abstraction layer + audit log. |
| Sync server reads notes                       | E2EE: server sees ciphertext only.                          |
| Browser extension exfiltrates pages           | Localhost token + minimum-permission manifest.              |
| Updater installs untrusted binary             | Tauri updater verifies signed manifest.                     |

## Threats we accept

| Threat                                          | Why we accept                                             |
| ----------------------------------------------- | --------------------------------------------------------- |
| Physical access to unlocked device              | OS-level full-disk encryption is the right layer.         |
| User runs a malicious plugin                    | Capability grants are user-approved; we surface them clearly. |
| User shares vault key with attacker             | We can't help with key hygiene; we document it.           |
| Compromised AI provider logs prompts            | We don't proxy; the user picks their provider.            |
| Network eavesdropping on AI traffic             | TLS handles this; we don't add a second layer.            |
| User runs a hostile sync server                 | The user controls server choice; the threat is theirs.    |

## Hardening roadmap

| Milestone         | Hardening item                                                                |
| ----------------- | ----------------------------------------------------------------------------- |
| v0.1              | CSP locked, capability files, atomic saves, fuzz parsers in CI.               |
| v0.2              | Conflict UI prevents draft-overwrite by external writes.                      |
| v0.4              | AI provider audit log + per-action consent.                                   |
| v0.5              | E2EE sync, vault-key sharing flow.                                            |
| v0.8              | Browser-extension localhost token + manifest review.                          |
| v0.9              | Plugin SDK with capability grants + WASM sandbox.                             |
| v1.0              | Third-party security audit; signed installers + auto-update on every OS.      |

## Reporting

The flow is **GitHub Private Vulnerability Reporting** per
[`../../SECURITY.md`](../../SECURITY.md):

1. Go to the [Security tab](https://github.com/goldr0g3r/lattice/security).
2. Click **Report a vulnerability**.
3. Provide the report (description, repro, impact, suggested fix).

You should hear back within **72 hours**. We aim to ship a fix
within **14 days** for high-severity issues. After the fix lands,
we publish a GitHub Security Advisory crediting the reporter (unless
they prefer anonymity).
