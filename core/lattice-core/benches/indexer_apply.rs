//! Bench: end-to-end `Indexer::apply_event` for one note.
//!
//! Gates the v0.3 budget: a save → search-visible round-trip must stay
//! under the v0.1 50 ms p99 save+index budget. Run:
//!
//!     cargo bench --bench indexer_apply
//!
//! Each iteration sets up a fresh vault + Tantivy index in a tempdir so
//! the bench measures the steady-state cost, not the cold-cache cost.

use std::time::{Duration, Instant};

use chrono::Utc;
use criterion::{criterion_group, criterion_main, Criterion};
use lattice_core::indexer::Indexer;
use lattice_core::vault::Vault;
use lattice_core::watcher::{IndexEvent, IndexEventKind};
use lattice_search::Index as SearchIndex;
use tempfile::tempdir;

fn synth(i: usize) -> String {
    format!(
        "---\ntitle: Bench {i}\ntags: [bench, group-{g}]\n---\n\n# Bench {i}\n\n\
         Topics include search ranking BM25, tokenizers, mmap, segment compaction, \
         write-ahead logs, replication, and the {i}th iteration of the bench. \
         See [[Bench {prev}]] for the prior entry.\n",
        g = i % 8,
        prev = i.saturating_sub(1)
    )
}

fn bench_apply_one(c: &mut Criterion) {
    let mut group = c.benchmark_group("indexer_apply");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(40);

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");

    group.bench_function("write_to_search_visible", |b| {
        b.iter_custom(|iters| {
            let tmp = tempdir().expect("tempdir");
            let vault = runtime
                .block_on(Vault::open(tmp.path()))
                .expect("vault open");
            let pool = vault.pool().clone();
            std::mem::forget(vault);
            let search =
                SearchIndex::create(tmp.path().join(".lattice/tantivy")).expect("search create");
            let indexer = Indexer::new(tmp.path().to_path_buf(), pool, search);

            let mut total = Duration::ZERO;
            for i in 0..(iters as usize) {
                let path = tmp.path().join(format!("note-{i:06}.md"));
                std::fs::write(&path, synth(i)).expect("fs write");
                let event = IndexEvent {
                    kind: IndexEventKind::Created,
                    path: path.to_string_lossy().to_string(),
                    timestamp: Utc::now(),
                };
                let start = Instant::now();
                runtime
                    .block_on(indexer.apply_event(&event))
                    .expect("apply_event");
                total += start.elapsed();
            }
            total
        });
    });

    group.finish();
}

criterion_group!(benches, bench_apply_one);
criterion_main!(benches);
