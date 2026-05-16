# How to debug a flaky test

> A test that passes sometimes and fails sometimes. We treat flakes
> as bugs; this is how to find and kill them. Pairs with
> [`../development/debugging.md`](../development/debugging.md).

## When to do it

You see one of:

- The CI summary's "re-run all jobs" lottery: same commit, two
  different outcomes.
- A test that fails on Windows but passes on Linux (or vice
  versa).
- A test that fails after another test passed, but passes alone.
- A test that fails in CI but passes locally on your laptop, ten
  times in a row.

## The five usual suspects

In rough order of frequency:

| Suspect                                       | Smell                                                      |
| --------------------------------------------- | ---------------------------------------------------------- |
| **Time-based logic** (sleep, deadline)        | "Sometimes 50 ms isn't enough." Race against a real clock. |
| **Filesystem races** (watcher, atomic writes) | Test reads a file the watcher hasn't finished writing.     |
| **Test order dependency**                     | Shared module-level state leaks between tests.             |
| **Async ordering** (futures, promises)        | One task wins on a fast machine, the other on a slow one.  |
| **Network or external service**               | Anything not in our process.                               |

If your flake is none of these, you've found a sixth suspect — write
it down.

## The triage flow

### 1. Get a reliable reproducer

A test that fails 1-in-5 isn't worth bisecting. Get to 1-in-2 (or
ideally 9-in-10) before investing.

**Rust** — loop the test:

```bash
for i in {1..50}; do
  cargo test -p lattice-core --test markdown_roundtrip <test_name> -- --exact 2>&1 | tail -3
done
```

PowerShell:

```powershell
1..50 | ForEach-Object {
  cargo test -p lattice-core --test markdown_roundtrip <test_name> -- --exact 2>&1 | Select-Object -Last 3
}
```

**TypeScript** — vitest's repeat flag:

```bash
pnpm --filter @lattice/desktop test -- --repeats=50 -t "<test name>"
```

If it fails 0 / 50 locally but fails on CI, see
[Local-vs-CI](#local-vs-ci) below.

### 2. Run with `--test-threads=1` (Rust) or `--no-isolate` (TS)

Test-order issues hide in parallel runs.

**Rust:**

```bash
cargo test -p lattice-core -- --test-threads=1
```

**TypeScript:**

```bash
pnpm --filter <pkg> test -- --pool=threads --no-isolate
```

If the test passes single-threaded but fails in parallel, you have
shared state — global statics, env vars, shared temp dirs, a
module-level test database.

### 3. Add timing logs

```rust
use std::time::Instant;
let t0 = Instant::now();
let result = vault.list_notes().await?;
eprintln!("list_notes took {:?}", t0.elapsed());
```

```ts
const t0 = performance.now();
await act(() => userEvent.keyboard("{Enter}"));
console.error(`keyboard event took ${performance.now() - t0} ms`);
```

If the slow path is dramatically slower in the failure case, the
test is racing a deadline.

### 4. Check the GitHub Actions runner specs

CI runs on `ubuntu-latest` (currently Ubuntu 22.04, 4-core 16 GB)
and `windows-latest` (Windows 2022, 4-core 16 GB). They're slower
than typical dev laptops in absolute throughput; they're also
shared with other workloads, so wall-clock times are unstable.

If your test asserts "X happens within 100 ms", that's a 100 ms
deadline on a machine that's sometimes 4× slower than you think.

### 5. Check for `tokio::time::sleep`

The single biggest source of Rust flakes. Search:

```bash
rg 'time::sleep|thread::sleep|setTimeout|wait_for' tests/ apps/ packages/ core/
```

Every match is a candidate. Replace with explicit synchronisation:

```rust
// Before:
tokio::time::sleep(Duration::from_millis(100)).await;
assert_eq!(handler.events.len(), 1);

// After:
let mut events = handler.events_rx.clone();
let event = tokio::time::timeout(Duration::from_secs(5), events.recv()).await
    .expect("watcher event arrived in time")
    .expect("watcher channel closed");
assert_eq!(event.kind, IndexEventKind::Modified);
```

The new version waits _up to_ 5 seconds for the right event,
returning instantly when it arrives. Same correctness, no flake.

### 6. Look for shared paths

```rust
let path = "/tmp/lattice-test/cache";   // ← shared between tests
```

vs

```rust
let tmp = tempfile::tempdir()?;
let path = tmp.path().join("cache");    // ← unique per test
```

Always use `tempfile::TempDir` (or vitest's per-test isolation).
Tests must own their state.

### 7. Inspect env vars

```rust
std::env::set_var("FOO", "1");          // ← affects every other test
```

Setting global env in one test breaks every other test that reads
it. Use a guard pattern:

```rust
let _guard = scopeguard::defer(|| std::env::remove_var("FOO"));
std::env::set_var("FOO", "1");
```

…or move the env consumption to a function-arg.

## Local-vs-CI

Test fails on CI, passes on your machine. The classics:

### Path separators

`format!("{}/foo", base)` works on Linux + macOS, breaks on Windows
(`/foo` becomes `\foo` in actual paths). Use `Path::join`:

```rust
let p = base.join("foo");   // platform-correct
```

### Line endings

`git config core.autocrlf` may convert your text fixtures to CRLF
on Windows. Tests that count `\n` count zero. Fix at the
`.gitattributes` level — Lattice's
[`.gitattributes`](../../.gitattributes) already pins `*.md eol=lf`
for the round-trip corpus.

### Locale-dependent string ordering

`"a".cmp("A")` differs across locales. Don't rely on locale-aware
ordering in tests; use byte-wise comparisons.

### Temp directories

CI's `/tmp` is sometimes a tmpfs with restricted size. If your test
fills it, you'll see weird `ENOSPC` errors. Watch for tests that
create thousands of files without cleaning up.

### Build cache poisoning

A previous test left state in `target/` that the next run finds.
Run `cargo clean -p <crate>` to confirm; if the test passes then,
add the explicit cleanup to the test.

## TS-specific patterns

### `act()` warnings

React 18 expects state updates to be wrapped in `act()`. If you see:

```text
Warning: An update to <Foo> inside a test was not wrapped in act(...)
```

…the test is racing the React reconciler. Wrap user-event calls in
`act()` or use `await user.click(...)` (the `userEvent` API is
already `act`-aware).

### Pending promises

Vitest exits when the main test function returns; pending promises
can leak into the next test. Always `await` the work. If you can't,
add `vi.useFakeTimers()` and advance them deterministically.

### `vi.mock` ordering

`vi.mock(...)` is **hoisted** to the top of the file by vitest's
transform. Don't put logic inside the factory that depends on
imported state — it runs before the imports.

## Rust-specific patterns

### `tokio::test` flavors

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 1)]
async fn singletime_test() { … }
```

Pinning to `worker_threads = 1` removes a class of races at the
cost of slower tests. Useful as a diagnostic; not a long-term fix.

### `tracing-subscriber` global state

`tracing::subscriber::set_global_default(...)` is a process-wide
side-effect; setting it in one test breaks every later test's
expectations. Use `tracing::subscriber::with_default(...)` for
test-scoped subscribers.

### Capturing `tracing` output

To assert that a log line is emitted:

```rust
use tracing_subscriber::fmt::TestWriter;

let _guard = tracing::subscriber::set_default(
    tracing_subscriber::fmt().with_writer(TestWriter::new()).finish(),
);
my_function_that_logs();
// stdout will be captured and shown only on failure
```

## When you can't reproduce

Sometimes a flake never reproduces locally — happens 1-in-100 in
CI, never 1-in-1000 on your machine. Two recipes:

1. **Run on a CI runner manually.** GitHub-Actions allows
   `workflow_dispatch` triggers — add one to the relevant
   workflow, push, and run from the Actions tab. If the flake
   reproduces, you can SSH in via [`tmate` action](https://github.com/marketplace/actions/debugging-with-tmate)
   for live debugging (don't merge the tmate step).
2. **Mark `#[ignore]` with a tracking issue** as a last resort:

   ```rust
   #[ignore = "flaky on Windows; tracked at #142"]
   #[tokio::test]
   async fn flaky_test() { … }
   ```

   Don't leave them ignored forever. Every release should review
   the ignored tests and either fix or delete.

## Common issues

### The fix made it worse

You added a sleep "to give it time". That's the wrong direction —
sleeps are the pathology, not the cure. Replace with explicit
synchronisation.

### A retry annotation hid the flake

Vitest's `retry: N` and similar masks rather than fix flakes. We
don't use them; if you see one in a PR, ask the author to fix the
test.

### The flake "fixed itself"

Be suspicious. A test that flips from "fails sometimes" to "passes"
without code change is more likely to flip back. Add a stress run
(50 iterations) to your CI for that test for a release cycle.

## References

- [`../development/testing.md`](../development/testing.md) — the
  test pyramid and conventions.
- [`../development/debugging.md`](../development/debugging.md) —
  general debugging recipes.
- ["Test isolation in vitest"](https://vitest.dev/guide/common-errors.html#globalsetup-and-globalteardown)
  — official docs on the `--isolate` and `--pool` flags.
- ["Async testing in tokio"](https://docs.rs/tokio/latest/tokio/attr.test.html)
  — the `#[tokio::test]` attribute reference.
