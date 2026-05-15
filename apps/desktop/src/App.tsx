import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";

import type { VaultInfo } from "@lattice/core-bindings";
import { Button } from "@lattice/ui";

import { EmptyVault, WorkspaceShell, formatLatticeError } from "./shell";

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
 * Root component for the Lattice desktop renderer.
 *
 * Two top-level surfaces:
 *
 *  - **No vault** → [`<EmptyVault>`](./shell/EmptyVault.tsx) — centered card
 *    with the wordmark + "Open vault…" CTA + theme toggle.
 *  - **Vault open** → [`<WorkspaceShell>`](./shell/WorkspaceShell.tsx) —
 *    the 3-column workspace (sidebar / note list / editor pane).
 *
 * `App.tsx` owns:
 *
 *  - the `vault` state (so the swap between the two surfaces is cheap)
 *  - the theme toggle (so both surfaces share one source of truth, and a
 *    theme flip survives the swap)
 *  - the Tauri lifecycle wiring (`renderer://ready`, `cold-start`,
 *    `vault_open` / `vault_close` / `open_vault_dialog`)
 *
 * The 3-column shell itself owns note list / read / write / create.
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
    const unlistenColdStart = listen<number>("cold-start", (e) => {
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
      void unlistenColdStart.then((un) => un());
    };
  }, []);

  const handleOpenVault = useCallback(async () => {
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
  }, []);

  const handleCloseVault = useCallback(async () => {
    setPendingError(null);
    if (!isTauri()) return;
    try {
      await invoke("vault_close");
      setVault(null);
    } catch (err) {
      setPendingError(formatLatticeError(err));
    }
  }, []);

  const themeToggle = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
    >
      {theme === "light" ? "Dark" : "Light"}
    </Button>
  );

  const versionInfo = (
    <>
      {coreVersion && <>lattice-core {coreVersion}</>}
      {coldStartMs !== null && <> · cold start {coldStartMs} ms</>}
    </>
  );

  if (vault) {
    return (
      <WorkspaceShell
        vault={vault}
        onSwitchVault={() => void handleOpenVault()}
        onCloseVault={() => void handleCloseVault()}
        themeToggle={themeToggle}
        versionInfo={versionInfo}
      />
    );
  }

  return (
    <EmptyVault
      onOpen={() => void handleOpenVault()}
      error={pendingError}
      themeToggle={themeToggle}
      footer={versionInfo}
    />
  );
}
