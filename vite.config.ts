/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  server: {
    // Allow the sandboxed preview host used for live previews.
    host: "0.0.0.0",
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    // Increase chunk size warning limit to 1.2 MB to avoid noisy warnings
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
  base: "./",
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/support/setup.ts"],
  },
});
