import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KEPT, pixiDiet } from '../../../tools/build/pixiDiet';

const lib = dirname(createRequire(import.meta.url).resolve('pixi.js'));
const text = (path: string): string => readFileSync(join(lib, path), 'utf8');

/** What `extensions.add(...)` registers in a Pixi init module, by name. */
const registered = (source: string): string[] => {
  const m = /extensions\.add\(([^)]*)\)/s.exec(source);
  return m ? m[1]!.split(',').map((s) => s.trim()).filter(Boolean) : [];
};

describe('the diet of Pixi in the first frame (docs/PROMPT25-LOG.md, P1-1)', () => {
  it('replaces exactly what Pixi registers today: if a new Pixi registers something else, the stub must be looked at again', () => {
    expect(registered(text('rendering/init.mjs')).sort()).toEqual(['AlphaMask', 'BufferImageSource', 'CanvasSource', 'ColorMask', 'ImageSource', 'StencilMask', 'VideoSource']);
    expect(registered(text('spritesheet/init.mjs'))).toEqual(['spritesheetAsset']);
    // …and the two modules are what Pixi's own entry imports, from that very path
    const entry = text('index.mjs');
    expect(entry).toContain("import './rendering/init.mjs';");
    expect(entry).toContain("import './spritesheet/init.mjs';");
  });

  it('keeps every texture source the game makes textures from, and drops only the video', () => {
    expect([...KEPT].sort()).toEqual(['AlphaMask', 'BufferImageSource', 'CanvasSource', 'ColorMask', 'ImageSource', 'StencilMask']);
    expect(KEPT).not.toContain('VideoSource' as never);
  });

  it('answers only those two imports, from Pixi\'s entry, in a production build', () => {
    const plugin = pixiDiet() as unknown as { apply: string; resolveId: (s: string, i?: string) => string | null; load: (id: string) => string | null };
    expect(plugin.apply).toBe('build');
    const entry = join(lib, 'index.mjs');
    expect(plugin.resolveId('./spritesheet/init.mjs', entry)).not.toBeNull();
    expect(plugin.resolveId('./rendering/init.mjs', entry)).not.toBeNull();
    // anyone else asking for the same path, or the entry asking for anything else, gets what it always got
    expect(plugin.resolveId('./rendering/init.mjs', join(lib, 'other.mjs'))).toBeNull();
    expect(plugin.resolveId('./accessibility/index.mjs', entry)).toBeNull();
    expect(plugin.resolveId('./rendering/init.mjs', undefined)).toBeNull();
  });

  it('the stub for the rendering init registers the sources and the masks, with no video', () => {
    const plugin = pixiDiet() as unknown as { resolveId: (s: string, i?: string) => string; load: (id: string) => string };
    const id = plugin.resolveId('./rendering/init.mjs', join(lib, 'index.mjs'));
    const code = plugin.load(id);
    expect(registered(code).sort()).toEqual([...KEPT].sort());
    expect(code).not.toContain('VideoSource');
    expect(plugin.load(plugin.resolveId('./spritesheet/init.mjs', join(lib, 'index.mjs')))).toBe('export {};');
  });
});
