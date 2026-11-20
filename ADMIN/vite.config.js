import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The salary formulas live once, in the server's utils folder; the Add
// Employee preview imports them from there as "@salary".
const salaryFormulas = fileURLToPath(new URL("../server/utils/salaryFormulas.js", import.meta.url));
// salaryFormulas.js imports the Pay Formulas engine next to it.
const payFormula = fileURLToPath(new URL("../server/utils/payFormula.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@salary": salaryFormulas }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3030"
    },
    // Let the dev server serve those two files from outside ADMIN.
    fs: { allow: [".", salaryFormulas, payFormula] }
  }
});
