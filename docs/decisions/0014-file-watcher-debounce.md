# ADR-0014: File-watcher debounce window

- **Status**: Accepted
- **Date**: 2026-05-14
- **Deciders**: @goldr0g3r
- **Tags**: core, watcher, notify, performance, cross-platform

## Context

The Lattice vault is the user's filesystem
([ADR-0006](0006-local-first-plain-markdown.md)). Whenever a `.md` file
changes on disk — whether from the in-app editor or from an external tool
(`vim`, Git, an Obsidian sync, a Dropbox conflict resolver) — the core must
re-index that note in SQLite + Tantivy and notify the frontend within the
v0.1 perf budget (save+index <50 ms p99).

We picked [`notify`](https://docs.rs/notify) as the cross-platform abstraction.
The naive "one fs event → one re-index" loop has known failure modes:

- **Linux (inotify)** floods with hundreds of events per second on `git
  checkout` of a large vault; without debouncing we re-index the same note
  10–20× and saturate the SQLite writer.
- **Windows (`ReadDirectoryChangesW`)** already coalesces but emits a
  separate event per filename per modification — saving a 5 MB Markdown
  file from Word can produce a `Modified` event every ~50 ms for several
  hundred ms while the writer commits.
- **macOS (FSEvents)** has its own coalesce window (~100 ms) plus latency
  modes that can stall up to a second.

PR #7 (`feat(core): file watcher + reactive index`) needs a single,
documented debounce policy before we ship — otherwise we re-discover the
same problem on each platform during user testing.

## Decision

**We will ship per-OS debounce defaults — Linux 250 ms, Windows 100 ms,
macOS 200 ms — exposed as a single user-overridable setting
(`watcher.debounce_ms`) in `~/MyVault/.lattice/config.json`.** The defaults
match the platform's native coalesce behaviour: short on Windows where the
OS already deduplicates, longer on Linux where raw inotify is noisiest.

Implementation uses `notify-debouncer-full`'s `RecommendedWatcher` wrapper
with a per-platform `Duration` selected at runtime via
`#[cfg(target_os = "...")]`. The setting is read once on vault open;
hot-reload of the debounce window is out of scope for v0.1 (closing and
reopening the vault picks up the new value).

## Consequences

### Positive

- **Predictable index latency** across the matrix. The 250 ms Linux ceiling
  keeps the worst-case save→search-result loop under the v0.1 perf budget
  even on a `git checkout` storm.
- **One knob.** Power users who want zero-debounce ("react instantly") or
  high-debounce ("only re-index after I stop typing") have one place to
  change it; we don't ship platform-specific config files.
- **Documented defaults.** The numbers live in the ADR and in
  `docs/telemetry.md` (so the telemetry-opt-in dashboards can attribute
  latency outliers to the debounce floor).

### Negative

- **Linux 250 ms is "feels delayed" for the rare user with an SSD-fast
  vault.** Mitigation: the user can lower the setting; we document that.
- **No adaptive backoff.** Under sustained event storms (e.g., a Dropbox
  sync of 10k notes) we still index every batch. Mitigation: PR #10's
  criterion bench measures sustained-load latency; we revisit if the
  benchmark regresses.

### Neutral

- We ship `notify-debouncer-full` as a transitive dep alongside `notify` —
  one extra crate, no licence concerns (MIT/Apache-2.0).
- Hot-reload of the debounce window is deferred to whenever Settings →
  Advanced lands a "live settings" subsystem (post-v0.4 AI panel).

## Alternatives considered

### Option A — Fixed 200 ms across all platforms

- **Pros**: simplest possible policy; one number to document.
- **Cons**: 200 ms is too short for Linux (still floods under `git
  checkout`); 200 ms is too long for Windows where the OS already
  coalesces aggressively.
- **Why rejected**: cross-platform users would see noticeably different
  behaviours despite the same number; better to be honest and tune per OS.

### Option C — Adaptive backoff (exponential ramp under load)

- **Pros**: theoretically optimal — short latency under steady-state,
  longer windows under bursts.
- **Cons**: significant added complexity (state machine, hysteresis
  tuning, observability hooks); the "right" coefficients are vault- and
  workload-dependent; impossible to explain in one settings tooltip.
- **Why rejected**: complexity bait for v0.1. Revisit if real-world
  reports show the static per-OS defaults aren't enough — pair with the
  v0.4 perf instrumentation work.

### Option D — No debounce; coalesce in the SQLite writer

- **Pros**: simpler watcher.
- **Cons**: pushes the burst-handling problem one layer deeper. The
  writer would need its own queue + dedup logic; debouncing at the
  source is cheaper and easier to reason about.
- **Why rejected**: wrong layer.

## References

- [`notify` crate docs](https://docs.rs/notify)
- [`notify-debouncer-full` docs](https://docs.rs/notify-debouncer-full)
- Linux: [`inotify(7)`](https://man7.org/linux/man-pages/man7/inotify.7.html) — `max_user_watches` and event-coalescing notes.
- Windows: [`ReadDirectoryChangesW`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw) — buffer-overflow semantics.
- macOS: [FSEvents Programming Guide](https://developer.apple.com/library/archive/documentation/Darwin/Conceptual/FSEvents_ProgGuide/) — latency tuning.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — perf budgets table.
- [Epic v0.1 — Foundation](../../.github/issues/epics.yml) — "save+index <50 ms p99" gating bench.
