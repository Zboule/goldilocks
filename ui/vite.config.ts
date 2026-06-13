import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import type { Plugin } from "vite";

// Served from the apex custom domain goldi.zone (root path), so base is "/" everywhere.
// (Was "/goldilocks/" under GITHUB_ACTIONS when the site lived at zboule.github.io/goldilocks/.)
const base = "/";

function copyFavicon(): Plugin {
  return {
    name: "copy-favicon",
    writeBundle({ dir }) {
      const out = dir ?? resolve(__dirname, "dist");
      mkdirSync(out, { recursive: true });
      copyFileSync(resolve(__dirname, "public/goldilocks.svg"), resolve(out, "goldilocks.svg"));
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), copyFavicon()],
  build: { copyPublicDir: false },
});
