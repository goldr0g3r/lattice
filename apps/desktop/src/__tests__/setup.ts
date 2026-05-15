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
