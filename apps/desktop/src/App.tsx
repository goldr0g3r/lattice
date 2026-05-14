import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import type { LatticeError, VaultInfo } from "@lattice/core-bindings";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Wordmark,
} from "@lattice/ui";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("lattice:theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function formatLatticeError(err: unknown): string {
  if (err && typeof err === "object" && "kind" in err) {
    const e = err as LatticeError;
    if (e.kind === "invalid_path") {
      return `${e.details.reason}: ${e.details.path}`;
    }
    return `${e.kind}: ${"message" in e.details ? e.details.message : "(no message)"}`;
  }
  return String(err);
}

/**
 * v0.1 PR #6 — Vault open / create / switch wired end-to-end.
 *
 * - On mount, attempts to reopen the last vault (persisted by the core via
 *   `lattice_core::config::set_last_vault`).
 * - "Open vault…" runs the folder picker, then `vault_open` against the core,
 *   then displays the resulting `VaultInfo`.
 * - Theme toggle flips `data-theme` on `<html>`, persisted to localStorage.
 * - Emits `renderer://ready` so the shell can record cold-start latency.
 */
export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [vault, setVault] = useState<VaultInfo | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [coldStartMs, setColdStartMs] = useState<number | null>(null);
  const [coreVersion, setCoreVersion] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("lattice:theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!isTauri()) return;
    void emit("renderer://ready");
    const unlistenPromise = listen<number>("cold-start", (e) => {
      setColdStartMs(e.payload);
    });
    void invoke<{ crate_name: string; version: string }>("core_version").then((info) => {
      setCoreVersion(info.version);
    });
    void (async () => {
      try {
        const lastPath = await invoke<string | null>("vault_last_opened");
        if (lastPath) {
          const info = await invoke<VaultInfo>("vault_open", { path: lastPath });
          setVault(info);
        }
      } catch (err) {
        setPendingError(formatLatticeError(err));
      }
    })();
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleOpenVault() {
    setPendingError(null);
    if (!isTauri()) {
      setPendingError("Open-vault flow requires the Tauri shell");
      return;
    }
    try {
      const picked = await invoke<string | null>("open_vault_dialog");
      if (!picked) return;
      const info = await invoke<VaultInfo>("vault_open", { path: picked });
      setVault(info);
    } catch (err) {
      setPendingError(formatLatticeError(err));
    }
  }

  async function handleCloseVault() {
    setPendingError(null);
    if (!isTauri()) return;
    try {
      await invoke("vault_close");
      setVault(null);
    } catch (err) {
      setPendingError(formatLatticeError(err));
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="absolute right-4 top-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
        >
          {theme === "light" ? "Dark" : "Light"}
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <Wordmark className="text-5xl text-text-primary" />
          </CardTitle>
          <CardDescription>
            Pre-alpha scaffolding. Editor lands in v0.2; file watcher + reactive index in PR #7.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {vault ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary">Vault</p>
              <p className="font-mono text-sm text-text-primary">{vault.root}</p>
              <p className="text-xs text-text-secondary">
                {vault.note_count} {vault.note_count === 1 ? "note" : "notes"} indexed
              </p>
              <Separator className="my-2" />
              <div className="flex gap-3">
                <Button onClick={handleOpenVault}>Switch vault…</Button>
                <Button variant="outline" onClick={handleCloseVault}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={handleOpenVault}>Open vault…</Button>
              <Button variant="outline" disabled>
                Settings
              </Button>
            </div>
          )}
          {pendingError && (
            <p role="alert" className="text-sm text-accent-secondary">
              {pendingError}
            </p>
          )}
          {coreVersion && (
            <p className="text-xs text-text-secondary">
              lattice-core {coreVersion}
              {coldStartMs !== null && <> · cold start {coldStartMs} ms</>}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
