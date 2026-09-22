// Ensure window.fetch has both getter and setter in iframe sandboxes
if (typeof window !== "undefined") {
  try {
    const origFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : window.fetch;
    let currentFetch = origFetch;
    Object.defineProperty(window, "fetch", {
      get() {
        return currentFetch;
      },
      set(fn) {
        currentFetch = fn;
      },
      configurable: true,
      enumerable: true,
    });
  } catch (_) {}
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
