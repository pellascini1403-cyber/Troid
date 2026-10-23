import { defineConfig } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The art the game ships is whatever the packer wrote to `public/art` (docs/ART-PIPELINE-2D.md, part C): no index, no art — and no art code is ever asked for. */
const artIndex = existsSync(fileURLToPath(new URL('./public/art/index.json', import.meta.url))) ? 'art/index.json' : '';

/** The sound the game ships is whatever `npm run audio:build` wrote to `public/audio` (docs/PROMPT18-LOG.md): no index, no sound files — and the game plays with none. */
const audioIndex = existsSync(fileURLToPath(new URL('./public/audio/index.json', import.meta.url))) ? 'audio/index.json' : '';

/** The game's own sources, as a module id writes the path. */
const SRC = fileURLToPath(new URL('./src/', import.meta.url)).replaceAll('\\', '/');

export default defineConfig({
  // Relative base: the same build runs from a web server, file:// and inside
  // a Capacitor (iOS / Android) WebView.
  base: './',
  define: { __TROID_ART_INDEX__: JSON.stringify(artIndex), __TROID_AUDIO_INDEX__: JSON.stringify(audioIndex) },
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
    rolldownOptions: {
      output: {
        // Everything the first frame needs lives in ONE file (docs/PROMPT20-LOG.md): the game's own modules that the page imports statically. Left to itself the bundler cuts out of them a chunk for each module that
        // a lazy chunk (the menu, the overlays, the art…) also uses — three dozen files a cold start fetches, each with its own header and none compressed together: 9 KB gz more than the same code in one.
        codeSplitting: {
          groups: [{ name: 'app', tags: ['$initial'], test: (id: string) => id.replaceAll('\\', '/').startsWith(SRC), includeDependenciesRecursively: false }],
        },
      },
    },
  },
});
