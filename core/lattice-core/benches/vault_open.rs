//! Bench: how long does it take to open a vault?
//!
//! Captures the cost of running migrations + initialising the SQLite pool.
//! Sweeps vault size in [100, 1_000] notes (10k tier is opt-in via
//! `LATTICE_BENCH_LARGE=1` because it adds ~2 minutes per CI run).
//!
//! Run locally:
//!     cargo bench --bench vault_open
//! Run with the 10k tier:
//!     $env:LATTICE_BENCH_LARGE = "1"; cargo bench --bench vault_open
//!
//! Baselines (CI):
//!     cargo bench --bench vault_open -- --save-baseline main
//!     cargo bench --bench vault_open -- --baseline main

use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use lattice_core::Vault;

fn note_corpus(dir: &std::path::Path, count: usize) {
    for i in 0..count {
        let p = dir.join(format!("note-{i:05}.md"));
        std::fs::write(p, format!("# Note {i}\n\nbody body body\n")).unwrap();
    }
}

fn bench_vault_open(c: &mut Criterion) {
    let mut group = c.benchmark_group("vault_open");
    group.measurement_time(Duration::from_secs(8));
    group.sample_size(10);

    let mut sizes: Vec<usize> = vec![100, 1_000];
    if std::env::var_os("LATTICE_BENCH_LARGE").is_some() {
        sizes.push(10_000);
    }

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");

    for n in sizes {
        group.bench_with_input(BenchmarkId::from_parameter(n), &n, |b, &n| {
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    let tmp = tempfile::tempdir().unwrap();
                    note_corpus(tmp.path(), n);
                    let start = Instant::now();
                    let vault = runtime.block_on(Vault::open(tmp.path())).unwrap();
                    let elapsed = start.elapsed();
                    runtime.block_on(vault.close()).unwrap();
                    total += elapsed;
                }
                total
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_vault_open);
criterion_main!(benches);
