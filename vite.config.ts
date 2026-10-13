import { defineConfig } from "vite";

// Dev server and build for the browser client (index.html at the root).
// packs/local is git-ignored but served locally so fan packs show up in the menu.
export default defineConfig({
  server: { host: true, port: 5173 },
  build: { outDir: "dist", target: "es2022" },
});
