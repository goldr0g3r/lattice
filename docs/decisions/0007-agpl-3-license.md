# ADR-0007: AGPL-3.0 license

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: license, governance, business-model

## Context

Lattice is open source, but **how** open determines two outcomes:

1. Whether a well-funded competitor can fork the project, slap a UI on
   it, host it as SaaS, and out-spend the original maintainers on
   marketing while contributing nothing back.
2. Whether corporate adopters will deploy Lattice inside their
   companies without a CLA fear-spiral.

We need a license that **protects the project from extractive forks**,
**keeps the code OSI-approved** (so it shows up on lists, mirrors, and
package managers without warnings), and **leaves the door open** to a
future dual-license offering if a clear commercial need emerges.

This decision needs to land before any code is contributed by anyone
else — every commit hereafter inherits whatever license is in the repo
root.

## Decision

**Lattice is licensed under the GNU Affero General Public License v3.0
or later (AGPL-3.0-or-later)**.

The `LICENSE` file at the repo root contains the AGPL-3.0 text. Every
source file may carry an SPDX header (`// SPDX-License-Identifier:
AGPL-3.0-or-later`) for tooling clarity, but the absence of a header
does not change the license — `LICENSE` governs.

Third-party dependencies must remain license-compatible with AGPL-3.0
(MIT, Apache-2.0, BSD, MPL-2.0, and AGPL-3.0 are all fine; GPL-2.0-only,
proprietary, and unknown licenses require explicit approval in an ADR).

## Consequences

### Positive

- **Network-use clause closes the SaaS-fork loophole** that plain
  GPL leaves open. If a vendor offers a Lattice fork as a hosted
  service, they must release their modifications — including the sync
  server modifications — under the AGPL too.
- **Still OSI-approved and DFSG-free.** Shows up cleanly on F-Droid,
  on Debian, on `cargo`, on `npm`. No "source-available" stigma.
- **Reciprocity for the sync server.** A hosted Lattice fork must open
  source the server too. This protects the v0.5 self-host story.
- **Reads as a strong signal** to the local-first community: we picked
  the most copyleft mainstream OSS license deliberately.
- **Future dual-license is still possible** — every contributor's
  copyright stays with them; if the project later wants a commercial
  license tier, a CLA can be introduced going forward (revisit at v1.0).

### Negative

- **Some corporates will not contribute** because their legal team
  prohibits AGPL contributions. We accept this; our beachhead is
  individual engineers and small teams, not Fortune 500 legal.
- **Plugin authors** must understand that plugins linked into Lattice's
  process inherit AGPL. We'll mitigate by sandboxing plugins as **WASM
  modules with a stable ABI** ([ARCHITECTURE.md](../../ARCHITECTURE.md)
  v0.9 plugin SDK) so the plugin runtime is the linkage boundary; we'll
  document the legal interpretation clearly in `docs/legal/plugins.md`
  when the SDK ships.
- **Some users perceive AGPL as scary** even for personal use. It
  shouldn't be — using Lattice as a desktop app is unaffected — but we
  need a clear README footer reassuring "use it freely; only
  redistribution and SaaS-hosting trigger reciprocity".

### Neutral

- **Optional CLA** is **not** required for v0.1; contributions are
  inbound=outbound (the GitHub default).
- **Trademark** "Lattice" is separate from the license. We may register
  the wordmark later to prevent fork-confusion (v1.0 conversation).

## Alternatives considered

### Option A — MIT or Apache-2.0

- **Pros**: maximum adoption, easiest for corporate to use, simplest to
  reason about.
- **Cons**: a well-funded SaaS fork can take the entire codebase and
  out-resource the original project with zero reciprocity. This has
  happened to Elasticsearch, Redis, MongoDB — we'd be next.
- **Why rejected**: the "extractive fork" risk is real for a project
  with an obvious hosted-SaaS path.

### Option B — Business Source License (BSL) 1.1

- **Pros**: time-delayed conversion to a permissive license; explicit
  "no competing service" clause; used by Cockroach, MariaDB,
  Couchbase.
- **Cons**: **not OSI-approved**. Packages-managers list it as
  "non-free"; F-Droid will not host BSL apps; Debian won't either. The
  reputational hit in the local-first / OSS world is significant.
- **Why rejected**: OSI status matters for a project pitching itself as
  "open and transparent".

### Option C — Elastic License v2

- **Pros**: simple, prevents hosting Lattice as a competing service.
- **Cons**: also non-OSI, also non-DFSG. Same problems as BSL.
- **Why rejected**: non-OSI is a hard line.

### Option D — Dual-license from day one (AGPL + commercial)

- **Pros**: revenue path baked in.
- **Cons**: requires a CLA, which immediately filters out a large slice
  of casual contributors. No revenue need yet justifies the friction.
- **Why rejected**: premature optimization. Revisit at v1.0.

### Option E — GPL-3.0 (no AGPL)

- **Pros**: also strong copyleft; broadly understood.
- **Cons**: doesn't close the SaaS loophole; a hosted Lattice fork
  wouldn't have to share modifications.
- **Why rejected**: AGPL is strictly more protective for the same
  community standing.

## References

- [AGPL-3.0 — full text](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [OSI license list](https://opensource.org/licenses)
- [Choose a License — comparison](https://choosealicense.com/licenses/agpl-3.0/)
- [GPL Compatible Free Software Licenses (FSF)](https://www.gnu.org/licenses/license-list.html)
- ["The Curse of the Hosted Open Source Database" — sourcehut blog](https://sourcehut.org/blog/2019-05-09-on-licensing/)
- [README.md](../../README.md) — license badge.
- [SECURITY.md](../../SECURITY.md), [CONTRIBUTING.md](../../CONTRIBUTING.md).
