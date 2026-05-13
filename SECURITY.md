# Security Policy

## Supported versions

Lattice is pre-1.0; only the latest `main` branch and the most recent tagged
release receive security fixes.

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| latest `vX.Y.Z` tag | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

Please **do not open public issues** for security problems.

Use GitHub's private vulnerability reporting:

1. Go to the [Security tab](../../security) of this repository.
2. Click **"Report a vulnerability"**.
3. Provide:
   - A clear description of the issue and the impact.
   - Steps to reproduce, ideally with a minimal example.
   - Affected version(s) / commit SHA.
   - Suggested fix, if you have one.

You should hear back within **72 hours**. We aim to ship a fix within **14 days**
for high-severity issues.

## Threat model (brief)

Lattice is a **local-first** app. The threat model focuses on:

- **Local data integrity** — corruption, partial writes, races against the file watcher.
- **Plugin sandboxing** — plugins must not be able to escape the WASM sandbox or
  read files outside their granted capabilities.
- **Sync confidentiality** — the optional sync server must never see plaintext;
  E2EE is enforced via libsodium with user-held keys.
- **AI provider isolation** — note content is only sent to a configured AI
  provider when the user explicitly triggers an action. Keys are stored in
  the OS keychain.
- **Web clipper isolation** — the browser extension talks to the local app
  over a localhost channel authenticated with a per-vault token.

## What is not in scope

- Physical access to an unlocked device (Lattice does not encrypt disk).
- Compromised AI providers (we don't proxy through our infra).
- Self-hosted sync servers run by the user themselves.

## Disclosure

We follow **coordinated disclosure**. After a fix ships, we'll publish a
GitHub Security Advisory crediting the reporter (unless they prefer anonymity).
