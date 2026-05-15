//! Bench: how long does a single `add_document + commit` take?
//!
//! Gates the v0.3 budget: per-doc index latency < 5 ms p99. Run:
//!
//!     cargo bench --bench single_doc_add
//!
//! The single-commit-per-doc shape matches the watcher's "one debounce tick
//! per modified file" loop (ADR-0014). Batched commits get their own
//! measurement in `bench reindex_all`.

use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, Criterion};
use lattice_search::{Index, IndexDoc};
use tempfile::tempdir;

fn doc_n(n: usize) -> IndexDoc {
    IndexDoc {
        id: format!("n{n}"),
        path: format!("notes/n{n}.md"),
        title: format!("Note {n}"),
        // ~300 chars of body keeps the bench representative of real notes
        // without dominating runtime.
        body: format!(
            "The quick brown fox jumps over the lazy dog. \
             This is note number {n}, with some words to index — \
             algorithms, distributed systems, search, retrieval, \
             tokenizers, stemmers, BM25, and other terms a vault \
             might plausibly carry. {n} {n} {n}.",
            n = n
        ),
        tags: vec!["bench".into(), format!("group-{}", n % 8)],
    }
}

fn bench_single_doc_add(c: &mut Criterion) {
    let mut group = c.benchmark_group("single_doc_add");
    group.measurement_time(Duration::from_secs(8));
    group.sample_size(60);

    group.bench_function("add_then_commit", |b| {
        b.iter_custom(|iters| {
            let tmp = tempdir().expect("tempdir");
            let mut idx = Index::create(tmp.path()).expect("create");
            let mut total = Duration::ZERO;
            for i in 0..(iters as usize) {
                let d = doc_n(i);
                let start = Instant::now();
                idx.add_document(&d).expect("add");
                idx.commit().expect("commit");
                total += start.elapsed();
            }
            total
        });
    });

    group.finish();
}

criterion_group!(benches, bench_single_doc_add);
criterion_main!(benches);
