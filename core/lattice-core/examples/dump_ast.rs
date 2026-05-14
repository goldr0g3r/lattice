//! Dump the [`NoteDoc`] AST of a Markdown file as pretty JSON.
//!
//! Used by the CI parity gate (Workstream D2) to regenerate the
//! `<fixture>.expected.json` files that pair with each round-trip corpus
//! fixture in `tests/markdown-roundtrip/`.
//!
//! Usage:
//!
//!     cargo run --example dump_ast -- tests/markdown-roundtrip/simple.md \
//!         > tests/markdown-roundtrip/simple.expected.json

use std::path::PathBuf;
use std::process::ExitCode;

use lattice_core::markdown;

fn main() -> ExitCode {
    let path = match std::env::args_os().nth(1) {
        Some(p) => PathBuf::from(p),
        None => {
            eprintln!("usage: dump_ast <markdown-file>");
            return ExitCode::from(2);
        }
    };
    let input = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(err) => {
            eprintln!("dump_ast: failed to read {}: {err}", path.display());
            return ExitCode::from(1);
        }
    };
    let doc = match markdown::parse(&input) {
        Ok(d) => d,
        Err(err) => {
            eprintln!("dump_ast: parse {}: {err}", path.display());
            return ExitCode::from(1);
        }
    };
    match serde_json::to_string_pretty(&doc) {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("dump_ast: serialize: {err}");
            ExitCode::from(1)
        }
    }
}
