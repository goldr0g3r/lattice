/**
 * Pre-vault landing surface. Shown when no vault is open — i.e. before the
 * 3-column shell mounts. Visual cousin of the reference design's centered
 * card; same `Wordmark` primitive + `Card` shell so the aesthetic survives.
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
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-canvas p-8">
      {themeToggle && <div className="absolute right-4 top-4">{themeToggle}</div>}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <Wordmark className="text-5xl text-text-primary" />
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
