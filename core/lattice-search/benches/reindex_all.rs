//! Bench: cold `reindex_all` over a synthetic 10 000-note corpus.
//!
//! Gates the v0.3 budget: full rebuild from disk < 3 s on the target
//! laptop tier. Run:
//!
//!     cargo bench --bench reindex_all
//!
//! Sample size is deliberately tiny (10) — building a 10 k-doc index is
//! seconds-long per iteration, and criterion's stddev with 10 samples is
//! plenty to detect the 10 % regression the ARCHITECTURE perf budget
//! cares about.

use std::time::Duration;

use criterion::{criterion_group, criterion_main, Criterion};
use lattice_search::{Index, IndexDoc};
use tempfile::tempdir;

const CORPUS_SIZE: usize = 10_000;

fn synthetic_corpus(n: usize) -> Vec<IndexDoc> {
    (0..n)
        .map(|i| IndexDoc {
            id: format!("note-{i:06}"),
            path: format!(
                "Engineering/{a}/{b}/note-{i:06}.md",
                a = i / 100,
                b = i / 10
            ),
            title: format!("Note {i}: distributed systems, raft, paxos"),
            body: format!(
                "Body for note {i}. The fox jumps over a sleeping dog. \
                 Topics include search ranking BM25, tokenizers, mmap, \
                 segment compaction, write-ahead logs, replication, \
                 and the {i}th iteration of the corpus generator.",
            ),
            tags: vec!["bench".into(), format!("bucket-{}", i % 16)],
        })
        .collect()
}

fn bench_reindex_all(c: &mut Criterion) {
    let mut group = c.benchmark_group("reindex_all");
    group.sample_size(10);
    group.measurement_time(Duration::from_secs(60));

    let corpus = synthetic_corpus(CORPUS_SIZE);

    group.bench_function("ten_thousand_notes", |b| {
        b.iter_custom(|iters| {
            let mut total = Duration::ZERO;
            for _ in 0..iters {
                let tmp = tempdir().expect("tempdir");
                let mut idx = Index::create(tmp.path()).expect("create");
                let start = std::time::Instant::now();
                idx.reindex_all(corpus.clone()).expect("reindex_all");
                total += start.elapsed();
            }
            total
        });
    });

    group.finish();
}

criterion_group!(benches, bench_reindex_all);
criterion_main!(benches);
