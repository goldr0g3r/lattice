//! JSON-shape snapshot for `LatticeError`.
//!
//! This locks the public IPC contract of the error type. If a variant's
//! representation changes, the snapshot must be updated explicitly (with
//! `cargo insta review`) so a reviewer sees the diff.

use lattice_core::error::LatticeError;

#[test]
fn invalid_path_variant_shape() {
    let err = LatticeError::InvalidPath {
        path: "/nonexistent".into(),
        reason: "directory does not exist".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn not_found_variant_shape() {
    let err = LatticeError::NotFound {
        id: "note-123".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn io_variant_shape() {
    let err = LatticeError::Io {
        message: "permission denied".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn database_variant_shape() {
    let err = LatticeError::Database {
        message: "no such table: notes".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn migration_variant_shape() {
    let err = LatticeError::Migration {
        message: "version skipped".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn telemetry_variant_shape() {
    let err = LatticeError::Telemetry {
        message: "endpoint unreachable".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn search_variant_shape() {
    let err = LatticeError::Search {
        message: "tantivy: opening directory: meta.json missing".into(),
    };
    insta::assert_json_snapshot!(err);
}

#[test]
fn invalid_query_variant_shape() {
    let err = LatticeError::InvalidQuery {
        query: "tag:>foo".into(),
        reason: "field `tag` does not accept a date comparison (use `created` or `updated`)".into(),
        span_start: 0,
        span_end: 3,
    };
    insta::assert_json_snapshot!(err);
}
