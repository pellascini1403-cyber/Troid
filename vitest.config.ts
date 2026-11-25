import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // the tests never read the art the build found: what they load, they are given
  define: { __TROID_ART_INDEX__: JSON.stringify(''), __TROID_AUDIO_INDEX__: JSON.stringify('') },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // The simulation layer is DOM-free, so the default environment is plain
    // node. Files that need a DOM opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    // Vitest's own default is five seconds, which is a limit for small unit tests; this suite also decodes images, builds worlds and walks every room. Measured (docs/PROMPT25-LOG.md, §4.2): of the tests that
    // rely on the default, the slowest takes 3.1 s on a quiet machine, and `worldAudio` took ≈ 5 s against its 5 s and failed three of the seven CIs it ran in. Fifteen seconds is ≥ 4.8 times the slowest of them; a hang still ends.
    // The heavy tests (a whole adventure, the art pipeline over the repository) have limits of their own, which this does not touch.
    testTimeout: 15_000,
  },
});
