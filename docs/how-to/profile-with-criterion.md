# How to profile with criterion

> Running a bench, saving a baseline, comparing against `main`, and
> interpreting the report. The conceptual story is in
> [`../development/performance.md`](../development/performance.md);
> this is the literal flow.

## When to do it

You want to:

- Confirm a perf regression before / after a change.
- Save a new `main` baseline after a deliberate optimisation.
- Investigate a CI bench failure on a PR.

## The bench landscape

Three benches in [`core/lattice-core/benches/`](../../core/lattice-core/benches/),
each gating one v0.1 budget:

| Bench             | Budget       | What it measures                                                    |
| ----------------- | ------------ | ------------------------------------------------------------------- |
| `vault_open`      | < 1.5 s      | `Vault::open` over a 100 / 1 000 / (opt-in 10 000) note vault.      |
| `save_index`      | < 50 ms p99  | One `INSERT INTO notes` round-trip against in-memory SQLite.        |
| `watcher_latency` | < 100 ms p99 | File write → first `IndexEvent` delivered (50 ms-debounce harness). |

The 10 k-note tier of `vault_open` is opt-in via `LATTICE_BENCH_LARGE=1`.

## Run a bench locally

```bash
cargo bench --bench vault_open
cargo bench --bench save_index
cargo bench --bench watcher_latency
```

Each bench runs for ~6–10 seconds (`Criterion::measurement_time`),
prints a summary, and writes a full HTML report to
`target/criterion/<bench>/report/index.html`. Open that in a browser
for the violin plot.

The 10 k-note tier:

```bash
# bash
LATTICE_BENCH_LARGE=1 cargo bench --bench vault_open
```

```powershell
# PowerShell
$env:LATTICE_BENCH_LARGE = "1"
cargo bench --bench vault_open
Remove-Item Env:LATTICE_BENCH_LARGE
```

## Save a baseline

When you've landed a change you expect to be a perf improvement (or
when you're rebasing after a long quiet period and want to refresh
the regression-gating snapshot):

```bash
# Save the current numbers under the name `main`:
cargo bench --bench vault_open -- --save-baseline main
cargo bench --bench save_index -- --save-baseline main
cargo bench --bench watcher_latency -- --save-baseline main
```

Criterion writes baseline JSON files to
`target/criterion/<bench>/<group>/<param>/main/`. Copy the relevant
files into the committed tree:

```bash
# E.g. for vault_open's 1000-note tier:
mkdir -p core/lattice-core/benches/baselines/vault_open/1000/main
cp target/criterion/vault_open/1000/main/{benchmark,estimates,sample,tukey}.json \
   core/lattice-core/benches/baselines/vault_open/1000/main/
```

The committed structure mirrors what's already in
[`core/lattice-core/benches/baselines/`](../../core/lattice-core/benches/baselines/).

Commit with a clear message:

```bash
git add core/lattice-core/benches/baselines/
git commit -m "perf(core): refresh main baselines after <reason>"
```

## Compare against the baseline

```bash
cargo bench --bench vault_open -- --baseline main
```

Output looks like:

```text
vault_open/1000         time:   [12.345 ms 12.456 ms 12.578 ms]
                        change: [-2.1234% -1.5432% -0.8765%] (p = 0.00 < 0.05)
                        Performance has improved.
```

A regression > 10% in any direction is the gate threshold. Criterion
flags it explicitly:

```text
                        change: [+11.234% +12.345% +13.456%] (p = 0.00 < 0.05)
                        Performance has regressed.
```

## Profile to find a regression

Once you've confirmed a regression:

### 1. Bisect

```bash
git bisect start
git bisect bad
git bisect good <last-known-good-sha>
git bisect run cargo bench --bench vault_open -- --baseline main \
    --measurement-time 4
```

Bisect halves the search space per iteration; on a 30-commit range,
that's ~5 bench runs to find the offending commit.

### 2. Flamegraph

```bash
cargo install flamegraph

# Bench under the flamegraph profiler (Linux: needs perf; macOS: needs dtrace):
cargo flamegraph --bench vault_open --root --output flamegraph.svg
```

Open `flamegraph.svg` in a browser. The widest stack frame is the
hottest function. Common culprits:

- **`pulldown-cmark` allocation** under heavy paragraph parsing.
- **`serde_yaml_ng::from_str`** on every read instead of caching.
- **`sqlx::query!` per-row** instead of batched `INSERT`.

### 3. Allocation profile (dhat)

```toml
# dev-dependencies in core/lattice-core/Cargo.toml
dhat = "0.3"
```

Wrap the bench body:

```rust
let _profiler = dhat::Profiler::new_heap();
// run the workload
```

Output: `dhat-heap.json`. Visualise with the dhat viewer per the
[upstream README](https://valgrind.org/docs/manual/dh-manual.html).

## Common issues

### "Performance has regressed" on a green PR

Criterion's noise threshold is configurable; the default is **+/-
1%**. A small regression (3–5%) on a quiet bench may be system
noise. Re-run; if it doesn't reproduce, it isn't real. If it
reproduces, treat it as real.

### The benchmark itself is slow / unstable

Reduce the measurement time only if you've confirmed the bench is
deterministic:

```bash
cargo bench --bench vault_open -- --warm-up-time 1 --measurement-time 4
```

The default (3 s warm-up, 5 s measurement) is the sweet spot for
the v0.1 benches. Don't crank it down to make CI green — you're
trading signal for speed.

### "No baseline 'main' found"

You haven't committed baselines yet. Run `--save-baseline main`
locally, copy the output into the committed
`core/lattice-core/benches/baselines/<bench>/<group>/<param>/main/`,
and commit. Without committed baselines the gate is **informational**
per
[`core/lattice-core/benches/README.md`](../../core/lattice-core/benches/README.md).

### CI bench job times out

The default `cargo bench` runs every bench. The CI workflow
`.github/workflows/bench.yml` runs only the three v0.1 benches at
PR-time and the full sweep nightly. If a PR's job is slow, check
that you haven't accidentally registered a slow bench in
`Cargo.toml`'s `[[bench]]` table.

### Bench fails to compile after a refactor

A criterion bench links against the public API of the crate.
Refactors that change the public surface need parallel updates in
`benches/*.rs`. The compile error tells you exactly what; the fix
is the same as in any other consumer.

### Numbers look great locally, regress on CI

CI runners are slower and more variable than dev laptops. The
relative comparison (your branch vs `main`) is the meaningful
signal; the absolute numbers may not match what you saw locally.
Run the same bench locally with `--baseline main` for a fair
comparison.

## References

- [`../development/performance.md`](../development/performance.md)
  — perf budgets and the regression gate at the conceptual level.
- [`core/lattice-core/benches/README.md`](../../core/lattice-core/benches/README.md)
  — the bench harness's own README.
- [`.github/workflows/bench.yml`](../../.github/workflows/bench.yml)
  — CI bench scheduling.
- [Criterion.rs guide](https://bheisler.github.io/criterion.rs/book/) —
  upstream docs.
- [Inferno (cargo-flamegraph)](https://github.com/flamegraph-rs/flamegraph) —
  flamegraph tool.
- [DHAT for Rust](https://docs.rs/dhat) — allocation profiling.
