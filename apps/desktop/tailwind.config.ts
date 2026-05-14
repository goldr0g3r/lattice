import type { Config } from "tailwindcss";
import latticePreset from "@lattice/tailwind-preset";

const config: Config = {
  presets: [latticePreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
};

export default config;
