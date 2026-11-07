import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ConfirmProvider } from "./components/ConfirmDialog.jsx";
import "./index.css";
// Loaded after index.css: restates the design tokens and redraws the shell,
// dashboard and shared controls. See the note at the top of theme.css.
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </AuthProvider>
  </React.StrictMode>
);
