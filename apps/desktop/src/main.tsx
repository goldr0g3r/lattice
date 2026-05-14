import React from "react";
import ReactDOM from "react-dom/client";

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
