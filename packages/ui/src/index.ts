/**
 * @lattice/ui — design-system primitives.
 *
 * Token CSS: `import "@lattice/ui/tokens.css"` once at the app root.
 * Tailwind preset: `presets: [require("@lattice/tailwind-preset")]`.
 *
 * Primitives below are shadcn-derived and themed via ADR-0010 tokens.
 * Storybook lands as a v0.2 follow-up (issue tracked alongside PR #4).
 */

export * from "./components/button";
export * from "./components/card";
export * from "./components/dialog";
export * from "./components/dropdown-menu";
export * from "./components/input";
export * from "./components/separator";
export * from "./components/sheet";
export * from "./components/tabs";
export * from "./components/tooltip";
export * from "./components/toast";
export * from "./components/command";
export { cn } from "./lib/utils";

export const UI_PACKAGE_VERSION = "0.1.0";
