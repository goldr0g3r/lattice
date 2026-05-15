/**
 * `<CommandPalette>` — the v0.2 ⌘K surface.
 *
 * Pure-presentational React component built on the shadcn `command` primitive
 * (cmdk under the hood) re-exported from `@lattice/ui`. State + Tauri wiring
 * live in [`WorkspaceShell`](../shell/WorkspaceShell.tsx); this file only knows
 * about an `AppCommand[]` + a `CommandContext` + an open / closed boolean.
 *
 * Reviewers — the locked design decisions D1..D8 are in
 * [`../commands/registry.ts`](../commands/registry.ts).
 */

import { useMemo } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@lattice/ui";

import type {
  AppCommand,
  CommandContext,
  CommandGroup as CommandGroupId,
} from "../commands/registry";

export interface CommandPaletteProps {
  /** Whether the dialog is open. Controlled — the shell owns the state. */
  open: boolean;
  /** Open-state setter; cmdk + Radix call this on Esc / overlay click. */
  onOpenChange: (open: boolean) => void;
  /** Every command we want to surface, including the dynamic note rows. */
  commands: readonly AppCommand[];
  /** Context passed to each `cmd.run(ctx)`. Held stable by the caller. */
  ctx: CommandContext;
}

/** Display order for the section headings inside the dialog. */
const GROUP_ORDER: readonly CommandGroupId[] = ["Vault", "Notes", "Editor", "View", "Help"];
const UNGROUPED = "Other" as const;

type GroupKey = CommandGroupId | typeof UNGROUPED;

function groupCommands(commands: readonly AppCommand[]): Map<GroupKey, AppCommand[]> {
  const out = new Map<GroupKey, AppCommand[]>();
  for (const key of GROUP_ORDER) out.set(key, []);
  for (const cmd of commands) {
    const key: GroupKey = cmd.group ?? UNGROUPED;
    const bucket = out.get(key);
    if (bucket) bucket.push(cmd);
    else out.set(key, [cmd]);
  }
  return out;
}

export function CommandPalette({ open, onOpenChange, commands, ctx }: CommandPaletteProps) {
  const grouped = useMemo(() => groupCommands(commands), [commands]);

  const onRun = (cmd: AppCommand) => {
    onOpenChange(false);
    // cmdk closes synchronously on select; run after so a command that
    // re-opens the palette (e.g. `view.palette`) sees the dialog as closed
    // before flipping the state back on.
    queueMicrotask(() => {
      try {
        void cmd.run(ctx);
      } catch (err) {
        // Surface as a toast so the palette never silently swallows errors
        // (per D7 — fire-and-forget, but errors still flow to the user).
        ctx.toast("Command failed", {
          description: err instanceof Error ? err.message : String(err),
          kind: "error",
        });
      }
    });
  };

  const visibleGroups = Array.from(grouped.entries()).filter(([, items]) => items.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" aria-label="Search commands" />
      <CommandList>
        <CommandEmpty>No commands match.</CommandEmpty>
        {visibleGroups.map(([heading, items], idx) => (
          <div key={heading}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={heading}>
              {items.map((cmd) => {
                const Icon = cmd.icon;
                const value = [cmd.label, ...(cmd.keywords ?? [])].join(" ");
                return (
                  <CommandItem
                    key={cmd.id}
                    value={value}
                    onSelect={() => onRun(cmd)}
                    data-command-id={cmd.id}
                  >
                    {Icon && <Icon className="mr-2 h-4 w-4" aria-hidden="true" />}
                    <span>{cmd.label}</span>
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
