import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

// Builds a single self-contained HTML preview of her app with demo data (no server).
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: "demo-supabase",
      enforce: "pre",
      resolveId(src, importer) {
        if (importer && /lib[\\/]supabase(\.js)?$/.test(src)) return path.resolve("src/demo/supabase.js");
        if (importer && /\.\/supabase$/.test(src) && importer.includes(`${path.sep}lib${path.sep}`)) return path.resolve("src/demo/supabase.js");
        return null;
      },
    },
  ],
  build: { outDir: "demo-dist", assetsInlineLimit: 100_000_000 },
});
