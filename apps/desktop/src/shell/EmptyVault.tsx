/**
 * Pre-vault landing surface. Shown when no vault is open — i.e. before the
 * 3-column shell mounts. Visual cousin of the reference designs' centered
 * card; same `Wordmark` primitive + `Card` shell so the aesthetic survives.
 *
 * # Visual polish pass (v0.2 PR #6 — `feat/shell-visual-polish`)
 *
 *  - **Backdrop.** Paints `--app-window-bg` so the landing card sits over
 *    the same hairline-contrast backdrop the 3-column shell uses once a
 *    vault opens. Removes the previous bare-`<main>` look.
 *  - **Card.** Bumped to `--radius-lg` + `--shadow-window` so the card
 *    feels like the same family of elevated surface as the workspace
 *    shell. Generous internal padding so the wordmark + CTA breathe.
 *  - **Footer.** Cold-start ms + core version moved inside the card so
 *    the page doesn't fragment into "card + floating footnote".
 */

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Wordmark,
} from "@lattice/ui";

export interface EmptyVaultProps {
  /** Click handler for the primary "Open vault…" button. */
  onOpen: () => void;
  /** Optional renderer-side error message to surface under the CTA. */
  error?: string | null;
  /** Theme toggle slot (rendered top-right). */
  themeToggle?: React.ReactNode;
  /** Core version + cold-start hint shown under the card. */
  footer?: React.ReactNode;
}

export function EmptyVault({ onOpen, error, themeToggle, footer }: EmptyVaultProps) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-window-bg p-8">
      {themeToggle && <div className="absolute right-4 top-4">{themeToggle}</div>}
      <Card className="w-full max-w-md rounded-lg shadow-window">
        <CardHeader className="gap-3 pb-2">
          <CardTitle>
            <Wordmark className="text-5xl tracking-tight text-text-primary" />
          </CardTitle>
          <CardDescription>
            Open a vault to start writing. The 3-column workspace mounts as soon as a vault is
            loaded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex gap-3">
            <Button onClick={onOpen}>Open vault…</Button>
            <Button variant="outline" disabled>
              Settings
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-accent-secondary">
              {error}
            </p>
          )}
          {footer && <div className="text-xs text-text-secondary">{footer}</div>}
        </CardContent>
      </Card>
    </main>
  );
}
