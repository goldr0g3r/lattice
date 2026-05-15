import { defineConfig } from "vitest/config";

/**
 * `*.test.tsx` files run in `jsdom` so they can mount React + TipTap. The plain
 * `*.test.ts` files (Markdown round-trip + NoteDoc <-> ProseMirror corpus)
 * stay in the default node environment for speed.
 */
export default defineConfig({
  test: {
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    globals: false,
    passWithNoTests: true,
  },
});
