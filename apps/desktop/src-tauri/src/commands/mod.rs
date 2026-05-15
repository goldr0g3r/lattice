//! Tauri IPC commands exposed from the desktop shell.
//!
//! Each module here groups commands by domain. Command signatures are codegen'd
//! into TypeScript types via `ts-rs` from `core/lattice-core`; the desktop shell
//! only handles the Tauri-specific glue (dialogs, windows, system info).

pub mod notes;
pub mod system;
pub mod vault;
