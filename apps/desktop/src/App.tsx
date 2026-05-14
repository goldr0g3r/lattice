import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import type { LatticeError, NoteDoc, VaultInfo } from "@lattice/core-bindings";
import { Editor } from "@lattice/editor";
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
  const [draftDoc, setDraftDoc] = useState<NoteDoc | null>(null);

  // v0.2 PR #2: in-memory demo doc so the TipTap editor has a surface to mount
  // against while vault-file load/save is still pending. The follow-up PR
  // (issue #34/#36/#37 and on) replaces this with real note IO.
  const initialDoc = useMemo<NoteDoc>(
    () => ({
      frontmatter: { entries: [] },
      body: [
        {
          type: "heading",
          data: { level: 1, content: [{ type: "text", data: { value: "Welcome to Lattice" } }] },
        },
        {
          type: "paragraph",
          data: {
            content: [
              { type: "text", data: { value: "Type " } },
              { type: "code", data: { value: "/" } },
              {
                type: "text",
                data: {
                  value:
                    " for the slash menu. The editor round-trips through Markdown via the v0.2 PR #1 corpus.",
                },
              },
            ],
          },
        },
        {
          type: "callout",
          data: {
            kind: "info",
            body: [
              {
                type: "paragraph",
                data: {
                  content: [
                    {
                      type: "text",
                      data: {
                        value:
                          "Vault file IO lands in a follow-up PR. Edits here are in-memory only.",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    }),
    [],
  );

  const handleEditorChange = useCallback((doc: NoteDoc) => {
    setDraftDoc(doc);
  }, []);

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

  if (vault) {
    return (
      <main className="flex min-h-screen flex-col gap-4 p-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wordmark className="text-2xl text-text-primary" />
            <span className="font-mono text-xs text-text-secondary">{vault.root}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenVault}>
              Switch vault…
            </Button>
            <Button variant="outline" size="sm" onClick={handleCloseVault}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            >
              {theme === "light" ? "Dark" : "Light"}
            </Button>
          </div>
        </header>
        <Separator />
        <section className="mx-auto w-full max-w-3xl">
          <Editor initialDoc={initialDoc} onChange={handleEditorChange} />
        </section>
        {pendingError && (
          <p role="alert" className="text-sm text-accent-secondary">
            {pendingError}
          </p>
        )}
        {coreVersion && (
          <footer className="text-xs text-text-secondary">
            lattice-core {coreVersion}
            {coldStartMs !== null && <> · cold start {coldStartMs} ms</>}
            {draftDoc && <> · {draftDoc.body.length} blocks in draft</>}
          </footer>
        )}
      </main>
    );
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
            Open a vault to start writing. The TipTap editor + slash menu mounts as soon as a vault
            is loaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Button onClick={handleOpenVault}>Open vault…</Button>
            <Button variant="outline" disabled>
              Settings
            </Button>
          </div>
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
