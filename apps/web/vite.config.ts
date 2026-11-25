import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ["buffer", "process", "stream", "events", "util"], globals: { Buffer: true, process: true } })],
  resolve: {
    alias: {
      "@predictulator/sdk": `${here}../../packages/sdk/src/index.ts`,
    },
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  server: { port: 5173 },
});
