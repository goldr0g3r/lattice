//! Integration tests for the file watcher (PR #7).
//!
//! Uses a very small debounce (50 ms) so the test finishes fast; the
//! per-OS production defaults are exercised by the `default_debounce_ms`
//! unit test in the crate.

use std::sync::mpsc;
use std::time::Duration;

use lattice_core::{IndexEvent, IndexEventKind, Watcher};

const TEST_DEBOUNCE_MS: u64 = 50;
const WAIT_LIMIT_MS: u64 = 5_000;

fn collect_events_for(receiver: &mpsc::Receiver<IndexEvent>, duration_ms: u64) -> Vec<IndexEvent> {
    let mut out = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_millis(duration_ms);
    while let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) {
        if let Ok(ev) = receiver.recv_timeout(remaining) {
            out.push(ev);
        } else {
            break;
        }
    }
    out
}

#[test]
fn watcher_emits_event_on_file_create() {
    let tmp = tempfile::tempdir().unwrap();
    let (tx, rx) = mpsc::channel();
    let _watcher = Watcher::start_with_debounce(tmp.path(), TEST_DEBOUNCE_MS, move |ev| {
        let _ = tx.send(ev);
    })
    .expect("watcher started");

    // Give the watcher a beat to register before we write.
    std::thread::sleep(Duration::from_millis(50));
    let new_note = tmp.path().join("hello.md");
    std::fs::write(&new_note, b"# Hello\n").unwrap();

    let events = collect_events_for(&rx, WAIT_LIMIT_MS);
    assert!(!events.is_empty(), "expected at least one event");
    let touched_target = events.iter().any(|e| {
        std::path::Path::new(&e.path) == new_note
            && matches!(
                e.kind,
                IndexEventKind::Created | IndexEventKind::Modified | IndexEventKind::Other
            )
    });
    assert!(
        touched_target,
        "expected an event for {new_note:?}; saw {events:?}"
    );
}

#[test]
fn watcher_emits_event_on_file_modify() {
    let tmp = tempfile::tempdir().unwrap();
    let note = tmp.path().join("existing.md");
    std::fs::write(&note, b"# v1\n").unwrap();

    let (tx, rx) = mpsc::channel();
    let _watcher = Watcher::start_with_debounce(tmp.path(), TEST_DEBOUNCE_MS, move |ev| {
        let _ = tx.send(ev);
    })
    .unwrap();

    std::thread::sleep(Duration::from_millis(50));
    std::fs::write(&note, b"# v2\n").unwrap();

    let events = collect_events_for(&rx, WAIT_LIMIT_MS);
    assert!(!events.is_empty(), "expected at least one event");
    let modify_seen = events.iter().any(|e| {
        std::path::Path::new(&e.path) == note && !matches!(e.kind, IndexEventKind::Removed)
    });
    assert!(
        modify_seen,
        "expected a non-remove event for {note:?}; saw {events:?}"
    );
}

#[test]
fn watcher_emits_event_on_file_remove() {
    let tmp = tempfile::tempdir().unwrap();
    let note = tmp.path().join("ephemeral.md");
    std::fs::write(&note, b"bye\n").unwrap();

    let (tx, rx) = mpsc::channel();
    let _watcher = Watcher::start_with_debounce(tmp.path(), TEST_DEBOUNCE_MS, move |ev| {
        let _ = tx.send(ev);
    })
    .unwrap();

    std::thread::sleep(Duration::from_millis(50));
    std::fs::remove_file(&note).unwrap();

    let events = collect_events_for(&rx, WAIT_LIMIT_MS);
    assert!(
        events.iter().any(|e| std::path::Path::new(&e.path) == note),
        "expected an event for {note:?}; saw {events:?}"
    );
}
