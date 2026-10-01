import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Relative base: the same build runs from a web server, file:// and inside
  // a Capacitor (iOS / Android) WebView.
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: false, // use `npm run dev:lan` to test on a phone in the same network
    port: 5173,
  },
  optimizeDeps: {
    // Pre-bundle everything we import from three so the dev server never re-optimises (and reloads) mid-session.
    include: [
      'three',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/utils/SkeletonUtils.js',
      'three/addons/utils/BufferGeometryUtils.js',
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
