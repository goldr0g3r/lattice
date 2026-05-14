# Lattice core benches

> The bench harness backing the v0.1 perf budgets ([ARCHITECTURE.md](../../../ARCHITECTURE.md)).
> Issue: `perf(core): criterion bench harness for v0.1 perf budgets`.

## Benches

| Bench                                       | Budget (v0.1)               | What it measures                                              |
| ------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| [`vault_open`](vault_open.rs)               | < 1.5 s on a CI runner      | `Vault::open` over a 100 / 1 000 / (opt-in) 10 000-note dir   |
| [`save_index`](save_index.rs)               | < 50 ms p99                 | One `INSERT INTO notes` round-trip against an in-mem SQLite   |
| [`watcher_latency`](watcher_latency.rs)     | < 100 ms p99 (50 ms debounce) | File write → first `IndexEvent` delivered                     |

The 10 000-note tier of `vault_open` is **opt-in** via the
`LATTICE_BENCH_LARGE` env var because it adds ~2 minutes to a CI run. PR-time
CI uses the 100 / 1 000-note tiers; nightly CI runs the full sweep.

## Run locally

```powershell
cargo bench --bench vault_open
cargo bench --bench save_index
cargo bench --bench watcher_latency

# 10k-note vault open
$env:LATTICE_BENCH_LARGE = "1"
cargo bench --bench vault_open
Remove-Item Env:LATTICE_BENCH_LARGE
```

## Baselines + regression gate

We use criterion's built-in baseline workflow. The convention is:

```sh
# After landing a change you expect to improve perf:
cargo bench --bench vault_open -- --save-baseline main

# Subsequent runs compare against `main` and fail on >10% regression:
cargo bench --bench vault_open -- --baseline main
```

CI (`.github/workflows/bench.yml`) runs the gated form. The first run after
PR #10 merges has no `main` baseline, so the comparison is `informational`
only. Once a maintainer runs `--save-baseline main` against the post-merge
trunk and commits the resulting `target/criterion/.../baselines/main.json`
into `core/lattice-core/benches/baselines/`, the gate becomes load-bearing.

> The `target/criterion/` directory is not committed — `criterion`
> regenerates the full HTML report on every run. The `baselines/`
> subdirectory below is the only committed artefact.

## Methodology notes

- All benches use `Criterion::measurement_time` between 6 and 10 seconds
  so each run is statistically meaningful without dominating CI.
- The `save_index` bench works against an in-memory SQLite pool so we
  measure write latency, not filesystem overhead.
- The `watcher_latency` bench uses a 50 ms debounce window (smaller than
  the per-OS defaults locked by
  [ADR-0014](../../../docs/decisions/0014-file-watcher-debounce.md)) so
  the harness can complete inside criterion's time budget. Production
  uses the per-OS values.
