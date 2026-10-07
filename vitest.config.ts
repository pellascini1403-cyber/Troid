import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // the tests never read the art the build found: what they load, they are given
  define: { __TROID_ART_INDEX__: JSON.stringify('') },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The simulation layer is DOM-free, so the default environment is plain
    // node. Files that need a DOM opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
