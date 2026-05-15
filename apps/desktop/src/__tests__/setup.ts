/**
 * Global vitest setup for the desktop renderer tests.
 *
 *  - Imports `@testing-library/jest-dom/vitest` so `toBeInTheDocument()` /
 *    `toHaveAttribute()` and friends become available without per-test
 *    plumbing.
 *  - Calls `cleanup()` after every test — our vitest config uses
 *    `globals: false` so the automatic teardown that fires when `globals`
 *    is on doesn't run; without it, every test sees the DOM left over
 *    from the previous one and queries like `getByRole` blow up with
 *    "Found multiple elements …".
 *  - Pins `window.matchMedia` so the theme bootstrapper in `App.tsx`
 *    doesn't crash under jsdom.
 *  - Stubs `ResizeObserver` because the v0.2 command-palette dialog
 *    pulls in `cmdk`, which calls `new ResizeObserver()` on mount and
 *    jsdom ships no implementation. A no-op shim is enough — cmdk only
 *    uses observation to keep `--cmdk-list-height` in sync with content,
 *    which we don't assert on.
 *  - Stubs the unprefixed pointer-event APIs Radix Dialog reaches for
 *    (`hasPointerCapture`, `releasePointerCapture`, `scrollIntoView`)
 *    so the dialog mount path stays jsdom-safe.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (() =>
    ({
      matches: false,
      media: "",
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverShim as unknown as typeof ResizeObserver;
}

if (typeof window !== "undefined") {
  const proto = window.HTMLElement.prototype as unknown as {
    hasPointerCapture?: (id: number) => boolean;
    releasePointerCapture?: (id: number) => void;
    scrollIntoView?: () => void;
  };
  if (!proto.hasPointerCapture) proto.hasPointerCapture = () => false;
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {};
  if (!proto.scrollIntoView) proto.scrollIntoView = () => {};
}
