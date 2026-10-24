import { CanvasParticleContainerPipe, GlParticleContainerPipe, RendererType } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { particlePipeFor } from '@/app/effects';

/**
 * The pipe that draws the particles is added to a live renderer once the effects have arrived (docs/PROMPT20-LOG.md §6). It was always the WebGL one — and on a page with no WebGL, where Pixi falls back to the canvas, the first
 * blow of a game threw on every frame until the page said the game had failed (Firefox in the CI found it: its headless build has no WebGL). Each kind of renderer has to get its own.
 */
describe('the particle pipe of each kind of renderer', () => {
  it('a WebGL renderer draws particles with the WebGL pipe', () => {
    expect(particlePipeFor(RendererType.WEBGL)).toBe(GlParticleContainerPipe);
  });

  it('a canvas renderer draws them with the canvas pipe: the WebGL one asks it for a shader system it does not have', () => {
    expect(particlePipeFor(RendererType.CANVAS)).toBe(CanvasParticleContainerPipe);
    expect(particlePipeFor(RendererType.CANVAS)).not.toBe(GlParticleContainerPipe);
  });

  it('a renderer the game does not create is refused, not given a pipe that would fail on the first particle', () => {
    expect(() => particlePipeFor(RendererType.WEBGPU)).toThrow(/type 2/);
    expect(() => particlePipeFor(0)).toThrow(/no particle pipe/);
  });
});
