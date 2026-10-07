import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The art the game ships is whatever the packer wrote to `public/art` (docs/ART-PIPELINE-2D.md, part C): no index, no art — and no art code is ever asked for. */
const artIndex = existsSync(fileURLToPath(new URL('./public/art/index.json', import.meta.url))) ? 'art/index.json' : '';

export default defineConfig({
  // Relative base: the same build runs from a web server, file:// and inside
  // a Capacitor (iOS / Android) WebView.
  base: './',
  define: { __TROID_ART_INDEX__: JSON.stringify(artIndex) },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: false, // use `npm run dev:lan` to test on a phone in the same network
    port: 5173,
  },
  optimizeDeps: {
    // Pre-bundle PixiJS so the dev server never re-optimises (and reloads) mid-session.
    include: ['pixi.js'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
