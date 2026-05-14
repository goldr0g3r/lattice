//! Bench: how long does it take to insert + commit one note row?
//!
//! Exercises the SQLite write path — the lower bound on "user hits Save and
//! the index reflects it" latency. The end-to-end editor-save bench lands in
//! v0.2 alongside the Markdown round-trip path.
//!
//! Run:
//!     cargo bench --bench save_index

use std::time::{Duration, Instant};

use chrono::Utc;
use criterion::{criterion_group, criterion_main, Criterion};
use lattice_core::db;
use uuid::Uuid;

fn bench_save_index(c: &mut Criterion) {
    let mut group = c.benchmark_group("save_index");
    group.measurement_time(Duration::from_secs(6));
    group.sample_size(50);

    let runtime = tokio::runtime::Runtime::new().expect("tokio runtime");
    let pool = runtime.block_on(db::init_in_memory()).expect("init pool");

    group.bench_function("single_note_insert", |b| {
        b.iter_custom(|iters| {
            let mut total = Duration::ZERO;
            for _ in 0..iters {
                let id = Uuid::new_v4().to_string();
                let now = Utc::now().to_rfc3339();
                let path = format!("notes/{id}.md");
                let start = Instant::now();
                runtime
                    .block_on(
                        sqlx::query("INSERT INTO notes (id, path, title, created, updated) VALUES (?1, ?2, ?3, ?4, ?5)")
                            .bind(&id)
                            .bind(&path)
                            .bind("Hello")
                            .bind(&now)
                            .bind(&now)
                            .execute(&pool),
                    )
                    .expect("insert");
                total += start.elapsed();
            }
            total
        });
    });

    group.finish();
}

criterion_group!(benches, bench_save_index);
criterion_main!(benches);
