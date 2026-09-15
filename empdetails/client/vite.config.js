import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // Employee login + attendance data both come from the main HRMS
      // server (server/), this app has no backend of its own.
      "/api": "http://localhost:5000"
    }
  }
});
