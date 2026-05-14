import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

/**
 * v0.1 PR #3 — Tauri shell smoke surface.
 *
 * - "Open vault…" button invokes the `open_vault_dialog` Rust command (folder
 *   picker only; the parsing pipeline lands in PR #6).
 * - Theme toggle flips `data-theme` on `<html>`, persisted to localStorage.
 * - On mount, the renderer emits `renderer://ready` so the shell can record
 *   cold-start latency (gated to the v0.1 perf budget).
 * - PR #9 swaps the placeholder text for the Lattice wordmark SVG.
 */
export function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
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
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleOpenVault() {
    if (!isTauri()) {
      setSelectedPath("(folder picker requires the Tauri shell)");
      return;
    }
    try {
      const path = await invoke<string | null>("open_vault_dialog");
      setSelectedPath(path ?? "(cancelled)");
    } catch (err) {
      setSelectedPath(`error: ${String(err)}`);
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
          <CardTitle className="font-serif text-4xl">Lattice</CardTitle>
          <CardDescription>
            Pre-alpha scaffolding. Editor lands in v0.2; vault parsing in v0.1 PR #6.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Button onClick={handleOpenVault}>Open vault…</Button>
            <Button variant="outline" disabled>
              Settings
            </Button>
          </div>
          {selectedPath && (
            <p className="text-sm text-text-secondary">
              Selected: <span className="font-mono text-text-primary">{selectedPath}</span>
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
