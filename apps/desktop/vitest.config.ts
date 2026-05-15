import { defineConfig } from "vitest/config";

/**
 * Shell-component tests mount React in `jsdom`. We also stub
 * `@tauri-apps/api/*` modules so the components can call `invoke`
 * without the real Tauri runtime. The stub paths resolve from
 * `src/__tests__/setup.ts` via the per-test `vi.mock(...)` calls.
 */
export default defineConfig({
  test: {
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    globals: false,
    passWithNoTests: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
