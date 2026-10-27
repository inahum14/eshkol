import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/secular-one/hebrew-400.css";
import "@fontsource/secular-one/latin-400.css";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import App from "./App";
import { registerSW } from "./lib/push";
import { ToastProvider } from "./ui";

registerSW().catch(() => {});
createRoot(document.getElementById("root")).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);
