//! Bench: how long after a file write does the watcher deliver the event?
//!
//! Measures the per-OS debounce-floor end-to-end. Uses a 50 ms debounce
//! (rather than the per-OS production default in
//! [ADR-0014](../../../docs/decisions/0014-file-watcher-debounce.md)) so the
//! bench finishes within the criterion default time budget.
//!
//! Run:
//!     cargo bench --bench watcher_latency

use std::sync::{
    mpsc::{self},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use criterion::{criterion_group, criterion_main, Criterion};
use lattice_core::Watcher;

const BENCH_DEBOUNCE_MS: u64 = 50;

fn bench_watcher_latency(c: &mut Criterion) {
    let mut group = c.benchmark_group("watcher_latency");
    group.measurement_time(Duration::from_secs(10));
    group.sample_size(20);

    group.bench_function("create_to_event_ms", |b| {
        b.iter_custom(|iters| {
            let mut total = Duration::ZERO;
            for _ in 0..iters {
                let tmp = tempfile::tempdir().unwrap();
                let (tx, rx) = mpsc::channel::<()>();
                let tx = Arc::new(Mutex::new(Some(tx)));

                let tx_for_watcher = Arc::clone(&tx);
                let _watcher =
                    Watcher::start_with_debounce(tmp.path(), BENCH_DEBOUNCE_MS, move |_event| {
                        // Only fire the first time; subsequent events are
                        // coalesced into the per-iter measurement.
                        if let Some(sender) = tx_for_watcher.lock().unwrap().take() {
                            let _ = sender.send(());
                        }
                    })
                    .expect("watcher started");

                // Let the watcher settle so the bench measures notify latency,
                // not registration latency.
                std::thread::sleep(Duration::from_millis(20));

                let start = Instant::now();
                std::fs::write(tmp.path().join("bench.md"), b"# bench\n").unwrap();
                let _ = rx.recv_timeout(Duration::from_secs(5));
                total += start.elapsed();
            }
            total
        });
    });

    group.finish();
}

criterion_group!(benches, bench_watcher_latency);
criterion_main!(benches);
