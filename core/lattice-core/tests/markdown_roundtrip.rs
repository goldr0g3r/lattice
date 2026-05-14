//! Round-trip the golden corpus through the Rust parser + serializer.
//!
//! For every `.md` file in [`tests/markdown-roundtrip/`](../../../tests/markdown-roundtrip/),
//! asserts `serialize(parse(input)) == input` byte-identical.
//!
//! Also verifies the committed `<name>.expected.json` matches what the parser
//! currently emits — that's the AST drift guard (Workstream D2) executed
//! in-process so a single `cargo test` call covers both checks.

use std::path::{Path, PathBuf};

use lattice_core::markdown;
use pretty_assertions::assert_eq;

fn corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("tests")
        .join("markdown-roundtrip")
}

fn corpus_fixtures() -> Vec<PathBuf> {
    let dir = corpus_dir();
    let mut fixtures = Vec::new();
    let read = std::fs::read_dir(&dir).unwrap_or_else(|err| {
        panic!("read corpus dir {}: {err}", dir.display());
    });
    for entry in read {
        let path = entry.expect("dir entry").path();
        if path.extension().and_then(|s| s.to_str()) == Some("md")
            && path.file_name().and_then(|s| s.to_str()) != Some("README.md")
        {
            fixtures.push(path);
        }
    }
    fixtures.sort();
    fixtures
}

#[test]
fn round_trip_every_fixture() {
    let fixtures = corpus_fixtures();
    assert!(
        !fixtures.is_empty(),
        "no fixtures found in {}",
        corpus_dir().display()
    );
    for path in fixtures {
        let input = std::fs::read_to_string(&path)
            .unwrap_or_else(|err| panic!("read {}: {err}", path.display()));
        let normalised = normalise_line_endings(&input);
        let doc = markdown::parse(&normalised)
            .unwrap_or_else(|err| panic!("parse {}: {err}", path.display()));
        let output = markdown::serialize(&doc);
        assert_eq!(
            normalised,
            output,
            "round-trip mismatch in {}",
            path.display()
        );
    }
}

#[test]
fn expected_ast_matches_parser_output() {
    let fixtures = corpus_fixtures();
    for path in fixtures {
        let expected_path = path.with_extension("expected.json");
        assert!(
            expected_path.exists(),
            "missing AST snapshot for {} — regenerate with: cargo run --example dump_ast -- {} > {}",
            path.display(),
            path.display(),
            expected_path.display(),
        );
        let input = std::fs::read_to_string(&path)
            .unwrap_or_else(|err| panic!("read {}: {err}", path.display()));
        let normalised = normalise_line_endings(&input);
        let doc = markdown::parse(&normalised)
            .unwrap_or_else(|err| panic!("parse {}: {err}", path.display()));
        let actual = serde_json::to_string_pretty(&doc).expect("serialize ast");
        let expected = std::fs::read_to_string(&expected_path)
            .unwrap_or_else(|err| panic!("read {}: {err}", expected_path.display()));
        let expected = normalise_line_endings(expected.trim_end());
        let actual = normalise_line_endings(actual.trim_end());
        assert_eq!(
            expected,
            actual,
            "expected.json drift in {} — regenerate with: cargo run --example dump_ast -- {}",
            expected_path.display(),
            path.display(),
        );
    }
}

/// Normalises CRLF line endings to LF so the corpus stays portable across the
/// Windows + Linux CI matrix.
fn normalise_line_endings(input: impl Into<String>) -> String {
    input.into().replace("\r\n", "\n")
}
