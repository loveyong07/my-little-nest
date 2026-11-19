import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { isLanguageLoaded, preloadLanguage, readStoredLanguage } from "./hooks/useI18n.js";
import "./styles.css";

const initialLanguage = readStoredLanguage();
if (!isLanguageLoaded(initialLanguage)) {
  await preloadLanguage(initialLanguage).catch(() => {});
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
