/**
 * Lattice command-palette registry (v0.2 PR #6 — `feat/command-palette`).
 *
 * Single source of truth for the typed `AppCommand` shape, the `CommandContext`
 * the shell hands to every `run()` handler, the v0.2 built-in command set, and
 * the `registerCommand` / `getCommands` helpers the v0.9 plugin SDK will call.
 *
 * # Locked design decisions (reviewers — read me first)
 *
 *  - **D1 — primitive.** Use the shadcn `CommandDialog` re-exported from
 *    `@lattice/ui` (which wraps [`cmdk`](https://cmdk.paco.me/)). We don't
 *    re-implement key handling or fuzzy matching; cmdk's `Command.Item`
 *    `value` attribute composes the label + keyword string we hand it, and
 *    cmdk's `shouldFilter` machinery does the rest. Esc-to-close is handled
 *    by the underlying Radix dialog. (See
 *    [`packages/ui/src/components/command.tsx`](../../../../packages/ui/src/components/command.tsx)
 *    for the primitive.)
 *  - **D2 — keybind.** A single global `keydown` listener mounted in
 *    [`WorkspaceShell`](../shell/WorkspaceShell.tsx) toggles the palette on
 *    `Mod+K` (Cmd on macOS, Ctrl elsewhere — detected via
 *    `navigator.platform` because the proposed `navigator.userAgentData`
 *    isn't shipped in our Tauri WebView yet). The listener uses
 *    `preventDefault()` so the browser's default "open location bar"
 *    binding never fires. Esc closes the dialog (cmdk + Radix handle that).
 *  - **D3 — registry shape.** `AppCommand { id, label, keywords?, group?,
 *    shortcut?, icon?, run }`. `CommandContext` exposes the small handful
 *    of operations a command can perform without coupling to Tauri or to
 *    React state: open / switch / close vault, open a note by path, create
 *    a new note, set theme, focus the search box, toast a message. Anything
 *    a future command needs gets added to the context, not to a global.
 *  - **D4 — built-in commands (v0.2 lock-set).** Open vault…, Switch
 *    vault…, Close vault, Create new note, Toggle theme, Open settings
 *    (stub toast — settings surface ships v0.3), Search notes (stub toast
 *    — search ships in v0.3 #43), Toggle command palette itself, plus
 *    dynamic "Open note: <title>" entries generated from the host's
 *    `NoteSummary[]` (top 20 by `modified_ms`, built in `note-commands.ts`).
 *    The issue-#38 "Insert wiki-link" command needs an active editor
 *    reference (TipTap's `Editor` instance) — `CommandContext` does not
 *    expose that, so we defer the command to v0.3 along with the rest of
 *    the wiki-link palette work. The deferral is called out in the
 *    `[Unreleased]` CHANGELOG entry.
 *  - **D5 — plugin extensibility.** `registerCommand(cmd)` pushes into a
 *    module-local array; `getCommands()` returns a fresh shallow copy.
 *    The v0.9 plugin SDK ([`#48 plugin SDK seed`](https://github.com/goldr0g3r/lattice/issues/48))
 *    will call `registerCommand` from sandboxed plugin code with the same
 *    `AppCommand` contract. We deliberately keep this surface tiny so the
 *    future SDK author has the smallest possible interface to learn.
 *  - **D6 — fuzzy match.** cmdk's built-in matcher reads each
 *    `Command.Item value="<label> <keywords joined by space>"` string and
 *    scores it against the input. No custom scoring layer — keeping our
 *    behaviour identical to every other shadcn `command` consumer.
 *  - **D7 — no command queue.** `run` is fire-and-forget. The handler is
 *    responsible for its own error UX via `ctx.toast(...)`. We don't try
 *    to await it or surface a global "command pending" indicator.
 *  - **D8 — keyboard escape from the editor.** The editor's slash menu
 *    uses `/`; the palette's `Mod+K` doesn't conflict with any TipTap or
 *    CodeMirror default. A vitest case in
 *    [`CommandPalette.test.tsx`](../components/__tests__/CommandPalette.test.tsx)
 *    asserts the listener fires regardless of focus context.
 */

import type { LucideIcon } from "lucide-react";

import type { NoteSummary, VaultInfo } from "@lattice/core-bindings";

export type CommandGroup = "Vault" | "Notes" | "Editor" | "View" | "Help";

/**
 * Theme handle exposed on `CommandContext`. The shell owns the real state in
 * `App.tsx`; the palette only needs to read the current value and flip it.
 */
export type CommandTheme = "light" | "dark";

export interface CommandContext {
  /** Current open vault or `null` (no vault is open). */
  readonly vault: VaultInfo | null;
  /** Notes currently in the rail; "Open note" commands close over this. */
  readonly notes: readonly NoteSummary[];
  /** Current theme, so the toggle command can flip it without re-reading. */
  readonly theme: CommandTheme;
  /** Open the vault picker (calls `open_vault_dialog` + `vault_open`). */
  openVault: () => void | Promise<void>;
  /** Synonym kept so plugin authors don't have to remember which we chose. */
  switchVault: () => void | Promise<void>;
  /** Close the current vault (no-op when none is open). */
  closeVault: () => void | Promise<void>;
  /** Open an existing note by vault-relative path. */
  openNote: (path: string) => void | Promise<void>;
  /** Create a new note (prompts for a title; same path as the rail's "+"). */
  createNote: () => void | Promise<void>;
  /** Flip light/dark theme. */
  toggleTheme: () => void;
  /** Set the theme explicitly. */
  setTheme: (theme: CommandTheme) => void;
  /** Open / focus the search surface (stub until v0.3 #43 ships). */
  openSearch: () => void;
  /** Open / focus the settings surface (stub until the v0.3 settings PR). */
  openSettings: () => void;
  /** Toggle the palette open state — used by the "Toggle command palette" command. */
  togglePalette: () => void;
  /** Show a user-visible toast. The shell wires this to `@lattice/ui`'s sonner re-export. */
  toast: (
    message: string,
    opts?: { description?: string; kind?: "info" | "success" | "error" },
  ) => void;
}

export interface AppCommand {
  /** Stable id — used as the React key and for deterministic test selection. */
  id: string;
  /** Human label rendered in the palette row. */
  label: string;
  /** Extra fuzzy-match terms (aliases, synonyms). cmdk filters on label + keywords. */
  keywords?: readonly string[];
  /** Visual grouping in the dialog. */
  group?: CommandGroup;
  /** Optional shortcut hint rendered with `CommandShortcut` (display-only). */
  shortcut?: string;
  /** Lucide icon component — rendered before the label when set. */
  icon?: LucideIcon;
  /** Fire-and-forget handler. Errors should be surfaced via `ctx.toast`. */
  run: (ctx: CommandContext) => void | Promise<void>;
}

const registered: AppCommand[] = [];

/**
 * Register a command. Intended for the v0.9 plugin SDK (per D5). Idempotent
 * by `id` — re-registering replaces the previous entry so a plugin reload
 * doesn't double-list commands. Returns an `unregister` thunk so plugin
 * teardown is symmetrical.
 */
export function registerCommand(cmd: AppCommand): () => void {
  const idx = registered.findIndex((c) => c.id === cmd.id);
  if (idx >= 0) {
    registered.splice(idx, 1, cmd);
  } else {
    registered.push(cmd);
  }
  return () => {
    const i = registered.findIndex((c) => c.id === cmd.id);
    if (i >= 0) registered.splice(i, 1);
  };
}

/**
 * Snapshot of every `registerCommand`-installed command, in insertion order.
 * Returns a fresh array so the palette can sort / filter without mutating
 * registry state.
 */
export function getCommands(): AppCommand[] {
  return registered.slice();
}

/** Test-only: drop every registered command. Not exported from the barrel. */
export function clearRegistryForTests(): void {
  registered.length = 0;
}

import {
  FilePlus,
  FolderOpen,
  LogOut,
  Moon,
  Replace,
  Search,
  Settings as SettingsIcon,
  SunMedium,
  TerminalSquare,
} from "lucide-react";

/**
 * The v0.2 lock-set, built each render so the icon / label / shortcut text
 * can swap with the current theme. Dynamic "Open note: <title>" entries
 * are appended in [`note-commands.ts`](./note-commands.ts).
 */
export function builtInCommands(ctx: CommandContext): AppCommand[] {
  const themeLabel = ctx.theme === "light" ? "Toggle theme (→ dark)" : "Toggle theme (→ light)";
  const themeIcon: LucideIcon = ctx.theme === "light" ? Moon : SunMedium;

  return [
    {
      id: "vault.open",
      label: "Open vault…",
      keywords: ["folder", "directory", "load"],
      group: "Vault",
      icon: FolderOpen,
      run: (c) => c.openVault(),
    },
    {
      id: "vault.switch",
      label: "Switch vault…",
      keywords: ["change", "swap"],
      group: "Vault",
      icon: Replace,
      run: (c) => c.switchVault(),
    },
    {
      id: "vault.close",
      label: "Close vault",
      keywords: ["dismiss", "unload"],
      group: "Vault",
      icon: LogOut,
      run: (c) => c.closeVault(),
    },
    {
      id: "note.create",
      label: "Create new note",
      keywords: ["new", "add", "draft"],
      group: "Notes",
      shortcut: "⌘N",
      icon: FilePlus,
      run: (c) => c.createNote(),
    },
    {
      id: "view.search",
      label: "Search notes",
      keywords: ["find", "lookup", "grep"],
      group: "View",
      shortcut: "⌘P",
      icon: Search,
      // v0.3 PR E (#43) shipped the search modal; `openSearch` now
      // opens it (the rail still has its substring filter for
      // browse-style workflows). Earlier versions of this command
      // toasted "Search ships in v0.3" as a stub — see PR #59
      // commit message for the history.
      run: (c) => c.openSearch(),
    },
    {
      id: "view.theme",
      label: themeLabel,
      keywords: ["dark", "light", "mode", "appearance"],
      group: "View",
      icon: themeIcon,
      run: (c) => c.toggleTheme(),
    },
    {
      id: "view.settings",
      label: "Open settings",
      keywords: ["preferences", "config"],
      group: "View",
      icon: SettingsIcon,
      // Stub until the v0.3 settings surface lands.
      run: (c) => {
        c.openSettings();
        c.toast("Settings UI lands in v0.3", { kind: "info" });
      },
    },
    {
      id: "view.palette",
      label: "Toggle command palette",
      keywords: ["palette", "commands", "k"],
      group: "View",
      shortcut: "⌘K",
      icon: TerminalSquare,
      run: (c) => c.togglePalette(),
    },
  ];
}
