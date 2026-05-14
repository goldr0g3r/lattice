import { Toaster as SonnerToaster, toast } from "sonner";

import { cn } from "../lib/utils";

export type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

/**
 * Toast surface backed by `sonner`. Themed via the Lattice tokens so it sits
 * nicely on both light "Tealda" and dark "Daydreaming" themes.
 */
export function Toaster({ className, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      className={cn("toaster", className)}
      toastOptions={{
        classNames: {
          toast: "group toast bg-bg-surface text-text-primary border-border shadow-lg",
          description: "text-text-secondary",
          actionButton: "bg-accent-primary text-bg-canvas",
          cancelButton: "bg-bg-elevated text-text-primary",
        },
      }}
      {...props}
    />
  );
}

export { toast };
