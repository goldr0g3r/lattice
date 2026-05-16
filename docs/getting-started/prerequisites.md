# Prerequisites

> The exact toolchain Lattice needs on a development host. Pinned
> versions live in `.nvmrc`, `package.json` (`packageManager`),
> `rust-toolchain.toml` (when added), and the workspace `Cargo.toml`.

## At a glance

| Tool             | Minimum version  | Why                                          |
| ---------------- | ---------------- | -------------------------------------------- |
| **Node.js**      | 20.x             | Vite, Turborepo, ESLint, Prettier, vitest    |
| **pnpm**         | 10.x             | Workspace package manager                    |
| **Rust**         | stable (1.75+)   | `core/` workspace, Tauri 2, `ts-rs`, `sqlx`  |
| **Tauri CLI**    | ^2.0             | `pnpm tauri dev`, `pnpm tauri build`         |
| **Git**          | 2.30+            | `git mv`, branch protection-friendly history |
| **gh** (optional) | 2.40+           | GitHub-as-code workflows in `.github/scripts/` |

The CI matrix is **Ubuntu 22.04** and **Windows Server 2022**, so
those two OSes are the most-tested dev hosts. macOS works but isn't
a v1.0 target — see [`../faq.md`](../faq.md).

## Per-OS setup

### Windows 10 / 11

```powershell
winget install OpenJS.NodeJS.LTS
winget install Rustlang.Rustup
winget install GitHub.cli
winget install Git.Git
```

Then in a fresh PowerShell:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
rustup default stable
cargo install tauri-cli --version "^2.0"
```

Tauri's [Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows)
are satisfied by the **WebView2 Runtime** (already installed on
Windows 11) and the **Microsoft C++ Build Tools** (Visual Studio
Installer → "Desktop development with C++").

### Linux (Ubuntu 22.04 / 24.04, Debian 12)

```bash
# Node + pnpm via Volta (or nvm; both fine)
curl https://get.volta.sh | bash
volta install node@20 pnpm@10

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"
cargo install tauri-cli --version "^2.0"

# GitHub CLI (optional, for .github/scripts/)
sudo apt update
sudo apt install gh
```

The Tauri Linux deps mirror the CI workflow at
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml):

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

If your distro packages an older WebKitGTK (≤ 2.36) you may see minor
font-rendering glitches with our variable fonts; we accept the
cosmetic regression on stale distros, see
[ADR-0011](../decisions/0011-font-loading-strategy.md).

### macOS (community-supported, post-v1.0)

```bash
brew install node@20 pnpm rustup-init gh
rustup-init -y
cargo install tauri-cli --version "^2.0"
```

Xcode Command Line Tools provide the C/C++ toolchain Tauri needs:

```bash
xcode-select --install
```

## Mobile (v0.6+)

Android targets land in v0.6. To start poking at the Android shell
ahead of that:

- Install Android Studio + SDK + NDK.
- Set `ANDROID_HOME` and `NDK_HOME`.
- `pnpm tauri android init`, then `pnpm tauri android dev`.

The Cargo target list is configured by `cargo-ndk` (added in the v0.6
milestone). For now this is exploratory; the CI Android matrix isn't
green yet.

## Editor / IDE

We don't enforce an editor; the team mostly uses **Cursor** and **VS
Code**. Recommended extensions:

| Extension                        | Why                                  |
| -------------------------------- | ------------------------------------ |
| `rust-lang.rust-analyzer`        | Rust IntelliSense                    |
| `tauri-apps.tauri-vscode`        | `tauri.conf.json` schema + commands  |
| `dbaeumer.vscode-eslint`         | ESLint inline diagnostics            |
| `esbenp.prettier-vscode`         | Auto-format on save                  |
| `bradlc.vscode-tailwindcss`      | Tailwind class autocomplete          |
| `editorconfig.editorconfig`      | `.editorconfig` consistency          |
| `davidanson.vscode-markdownlint` | Match the CI lint we run on every PR |

## Disk & memory

A first build is honest about its appetite:

| Path             | Size after first build           |
| ---------------- | -------------------------------- |
| `node_modules/`  | ~700 MB (per workspace, hoisted) |
| `target/`        | ~3 GB (Cargo workspace)          |
| `.turbo/cache/`  | ~50 MB (grows with build runs)   |

Allocate ~5 GB free before the first `pnpm tauri:dev`. Cold Rust
builds peak at ~6 GB resident; subsequent incremental builds are
~500 MB.

## Network access

The first install is **not** offline-friendly:

- `pnpm install` pulls ~600 packages from npm.
- `cargo build` pulls ~400 crates from crates.io.
- Tauri CLI pulls Wix (Windows) / `linuxdeploy` (Linux) on first build.

Subsequent builds are fully offline.

## Verifying the toolchain

Once everything is installed, this command triplet should print clean
versions:

```bash
node --version    # v20.x.x
pnpm --version    # 10.x.x
rustc --version   # rustc 1.75.0 (or newer)
cargo tauri --version   # tauri-cli 2.x.x
```

If any of those is missing, head back up to the per-OS section. If
they're all present but `pnpm tauri:dev` still fails, the
[troubleshooting page](troubleshooting.md) covers the common
failures.
