import { cn } from "../lib/utils";

export interface WordmarkProps {
  className?: string;
  /** Override the rendered text — defaults to "Lattice". */
  label?: string;
}

/**
 * The Lattice wordmark, rendered as text in Newsreader. Inherits `color`
 * from `currentColor`, so put it inside an element with `text-text-primary`
 * (or `text-accent-primary` for branded surfaces).
 *
 * We render text instead of an inline SVG `<text>` so screen readers
 * announce the word and the font weight tracks the design tokens. The
 * `wordmark.svg` asset in `packages/ui/src/assets/` exists for places
 * where a raster fallback is required (e.g. README badges).
 */
export function Wordmark({ className, label = "Lattice" }: WordmarkProps) {
  return (
    <span
      aria-label={label}
      className={cn("inline-block font-serif font-medium tracking-tight", className)}
    >
      {label}
    </span>
  );
}
