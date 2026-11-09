import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("No element with id='root' found in index.html");
} else {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
