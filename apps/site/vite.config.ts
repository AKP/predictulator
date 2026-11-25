import {copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';
import {nodePolyfills} from 'vite-plugin-node-polyfills';

const here = fileURLToPath(new URL('.', import.meta.url));

// Static SPA routes. cleanUrls serves security.html at /security, etc.; each
// copy boots the same bundle and the App router picks the page from pathname.
function staticRoutes(paths: string[]): Plugin {
  return {
    name: 'static-routes',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist/index.html', import.meta.url));
      for (const p of paths) {
        copyFileSync(dist, fileURLToPath(new URL(`./dist/${p}.html`, import.meta.url)));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // @solana/web3.js expects Buffer; only the live-market panel needs it.
    nodePolyfills({include: ['buffer', 'process', 'events', 'util', 'stream'], globals: {Buffer: true, process: true}}),
    staticRoutes(['security', 'devlog']),
  ],
  resolve: {
    alias: {
      '@predictulator/sdk': `${here}../../packages/sdk/src/index.ts`,
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: {port: 5174},
});
