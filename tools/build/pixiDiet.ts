import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Plugin } from 'vite';

/**
 * WHAT THE FIRST FRAME DOES NOT CARRY OF PIXI (docs/PROMPT25-LOG.md, P1-1). `pixi.js` registers its parts through modules that are imported for their effect — `rendering/init` adds every kind of texture source, `spritesheet/init` adds
 * the spritesheet loader — and a bundler cannot drop a module whose effect is the point. The game uses none of what they bring that it did not ask for: it never plays a video (`VideoSource`, ≈ 2.5 KB gz and the
 * detection of the video's alpha) and it never loads a spritesheet or goes through `Assets` (the spritesheet parser drags in `Assets`, the resolver, the path utilities and the cache: ≈ 5 KB gz). All of that was part of the cold start the
 * budget is measured on (204 800 B gz).
 *
 * This plugin answers two imports of Pixi's own entry module with smaller ones — exactly the two, from exactly that importer, and only in a production build — and leaves everything else as it is:
 *  - `./spritesheet/init.mjs` → nothing (the loader of spritesheets is not registered; `Assets` and `Spritesheet` are not part of the game);
 *  - `./rendering/init.mjs`   → the same registrations minus `VideoSource` (the masks and the image, canvas and buffer sources stay).
 * The game's textures come from `ImageSource`, `CanvasSource` and `BufferImageSource` (art, procedural canvases, ramps), which stay. `tests/unit/app/pixiDiet.test.ts` fails if the part of Pixi that the stub replaces changes under it
 * (a new Pixi version that registers something else in `rendering/init`).
 */
const REAL_RENDERING_INIT = ['AlphaMask', 'ColorMask', 'StencilMask', 'VideoSource', 'ImageSource', 'CanvasSource', 'BufferImageSource'] as const;

export const KEPT = REAL_RENDERING_INIT.filter((n) => n !== 'VideoSource');

const EMPTY = '\0troid-pixi-diet:empty';
const RENDERING_INIT = '\0troid-pixi-diet:rendering-init';

export function pixiDiet(): Plugin {
  const lib = dirname(createRequire(import.meta.url).resolve('pixi.js')).replaceAll('\\', '/');
  const entry = `${lib}/index.mjs`;
  return {
    name: 'troid:pixi-diet',
    apply: 'build',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || importer.replaceAll('\\', '/') !== entry) return null;
      if (source === './spritesheet/init.mjs') return EMPTY;
      if (source === './rendering/init.mjs') return RENDERING_INIT;
      return null;
    },
    load(id) {
      if (id === EMPTY) return 'export {};';
      if (id !== RENDERING_INIT) return null;
      const at = (path: string): string => JSON.stringify(`${lib}/${path}`);
      return [
        `import { extensions } from ${at('extensions/Extensions.mjs')};`,
        `import { AlphaMask } from ${at('rendering/mask/alpha/AlphaMask.mjs')};`,
        `import { ColorMask } from ${at('rendering/mask/color/ColorMask.mjs')};`,
        `import { StencilMask } from ${at('rendering/mask/stencil/StencilMask.mjs')};`,
        `import { BufferImageSource } from ${at('rendering/renderers/shared/texture/sources/BufferImageSource.mjs')};`,
        `import { CanvasSource } from ${at('rendering/renderers/shared/texture/sources/CanvasSource.mjs')};`,
        `import { ImageSource } from ${at('rendering/renderers/shared/texture/sources/ImageSource.mjs')};`,
        `import ${at('rendering/renderers/shared/texture/utils/textureFrom.mjs')};`,
        `import ${at('rendering/mask/MaskEffectManager.mjs')};`,
        `extensions.add(${KEPT.join(', ')});`,
      ].join('\n');
    },
  };
}
