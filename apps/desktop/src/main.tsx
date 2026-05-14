import React from "react";
import ReactDOM from "react-dom/client";

import "@lattice/ui/fonts";
import "@lattice/editor/Editor.css";
import "./styles.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Lattice failed to mount: missing #root element");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Hide the splash element baked into index.html as soon as React mounts.
// Per ADR-0011 the swap is brief; per the v0.1 epic DoD the splash must
// be gone by 800 ms after window paint.
requestAnimationFrame(() => {
  const splash = document.getElementById("lattice-splash");
  if (splash) splash.remove();
});
