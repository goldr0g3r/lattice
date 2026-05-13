# ADR-0001: Tauri 2 as the cross-platform shell

- **Status**: Accepted
- **Date**: 2026-05-13
- **Deciders**: @goldr0g3r
- **Tags**: shell, cross-platform, desktop, mobile, performance

## Context

Lattice needs to ship on **Windows, Linux, and Android** from a single
codebase, with **fast cold start** (<400 ms desktop budget), small bundles,
and low memory overhead. The shell must let a Rust core talk to a
modern web-tech UI (React + TipTap + CodeMirror) over a typed IPC bridge,
and it must let us reach native APIs (filesystem, OS keychain, system tray,
share sheet, deep links, auto-update).

The decision matters now because every other architectural choice — repo
layout, build system, CI matrix, plugin sandbox — hangs off the shell.

## Decision

**We will use Tauri 2** as the cross-platform shell for both desktop
(Windows 10/11, Linux x86_64) and mobile (Android 10+).

Each app uses the OS's native WebView (WebView2 on Windows, WebKitGTK on
Linux, Android WebView on Android) paired with a shared Rust core, with
typed IPC commands codegen'd to TypeScript via `ts-rs`.

## Consequences

### Positive

- **Tiny bundles.** 10–30 MB on desktop vs. 150–300 MB for Electron. Critical
  for engineers used to native-app sizes.
- **Low memory.** 40–90 MB idle vs. 150–400 MB for Electron — frees headroom
  for the actual workload (search index, embeddings, AI providers).
- **Single codebase, three platforms.** Tauri 2.x officially supports Android
  (and iOS later), so we keep desktop and mobile aligned without a separate
  Flutter or native track.
- **Rust-first IPC** matches our core language. No JS-bridge overhead per call.
- **Strong security defaults** — CSP-locked WebView, capability-scoped
  filesystem access, signed updates, OS-keychain integration.

### Negative

- **Steeper learning curve** than Electron (Rust on the back, no Node APIs
  in the WebView).
- **Smaller ecosystem** than Electron — some plugins (e.g., advanced printing,
  niche file pickers) we may need to write ourselves.
- **WebView fragmentation** — three rendering engines means we'll see rare
  Linux-only / Android-only bugs and have to test the matrix.
- **iOS path is younger** (post-v1.0 anyway) and may need Apple-developer
  workflow work later.

### Neutral

- Auto-update flow uses the Tauri updater plugin with signed manifests; we
  must rotate signing keys carefully.
- The "build my app from JS-only" Electron mental model does not transfer;
  contributors need basic Rust to ship features that touch the core.

## Alternatives considered

### Option A — Electron

- **Pros**: massive ecosystem, single Chromium so renders are pixel-identical
  across OSes, every contributor knows it.
- **Cons**: 10× bundle, 4× idle RAM, no native mobile story, requires
  app-managed updates of Chromium for CVE response.
- **Why rejected**: bundle + memory are non-starters for a "fast first" app;
  no mobile path; the security/maintenance burden of bundled Chromium is
  not what a 1-person founding team should own.

### Option B — Flutter

- **Pros**: single codebase desktop + mobile, fast, strong tooling.
- **Cons**: no system WebView (custom rendering ≠ great for a rich text
  editor like TipTap); the Dart ecosystem doesn't intersect with our
  ML/Rust ecosystem; embedding ProseMirror/CodeMirror is hostile.
- **Why rejected**: the editor is the product; we will not give up
  ProseMirror.

### Option C — Capacitor / Ionic

- **Pros**: web-first, easy mobile.
- **Cons**: desktop story is weak; perf and memory profile closer to Electron;
  no Rust-core IPC story.
- **Why rejected**: desktop is our **primary** platform, not mobile.

### Option D — Pure native (SwiftUI + Kotlin + WinUI + GTK)

- **Pros**: best fit & feel per platform.
- **Cons**: ~3× the code, three editor implementations, no shared business
  logic without an FFI layer anyway.
- **Why rejected**: we would never ship.

## References

- [Tauri 2 official docs](https://v2.tauri.app/)
- "Tauri vs Electron [2026]: 96% Smaller Apps, 1 Winner" — tech-insider.org, 2026.
- "Tauri v2 vs Electron: Complete Comparison" — oflight.co.jp, 2026.
- `pulldown-cmark`, `ts-rs`, Tauri `keyring` plugin, Tauri updater plugin.
