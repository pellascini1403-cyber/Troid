import { describe, expect, it } from 'vitest';
import { MeshPipe, type Renderer } from 'pixi.js';
import { ensureMeshPipe } from '@/rigs/kit/assets';

/**
 * THE MESH PIPE (docs/PROMPT24-LOG.md, F7): a production renderer is made without Pixi's optional extensions, so it has no pipe for a `Mesh` — and the ribbons, membranes and cloths of the rigs are meshes. The rigs' chunk adds the pipe to the renderer by hand
 * when it arrives; this holds the three cases of that: it is already there (a dev server), it can be added (WebGL), and it cannot (a renderer with no adaptor for meshes: the rigs are then not used).
 */
const fake = (o: { pipes?: Record<string, unknown>; adaptors?: Array<{ name: string }> | null; add?: boolean }) => {
  const calls: Array<[unknown[], unknown[]]> = [];
  const renderer = {
    renderPipes: { ...(o.pipes ?? {}) },
    ...(o.adaptors === null ? {} : { config: { renderPipeAdaptors: o.adaptors ?? [{ name: 'mesh' }] } }),
    ...(o.add === false ? {} : { _addPipes: (pipes: unknown[], adaptors: unknown[]) => void calls.push([pipes, adaptors]) }),
  };
  return { renderer: renderer as unknown as Renderer, calls };
};

describe('ensureMeshPipe', () => {
  it('leaves a renderer that already draws meshes alone', () => {
    const { renderer, calls } = fake({ pipes: { mesh: {} } });
    expect(ensureMeshPipe(renderer)).toBe(true);
    expect(calls).toEqual([]);
  });

  it('builds the pipe into a renderer that has the adaptor for it, the way the renderer builds its own', () => {
    const { renderer, calls } = fake({});
    expect(ensureMeshPipe(renderer)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toEqual([{ name: 'mesh', value: MeshPipe }]);
  });

  it('says so when the renderer cannot draw meshes (no adaptor, or no way to add a pipe): the creatures keep their shapes', () => {
    expect(ensureMeshPipe(fake({ adaptors: [{ name: 'graphics' }] }).renderer)).toBe(false);
    expect(ensureMeshPipe(fake({ adaptors: null }).renderer)).toBe(false);
    expect(ensureMeshPipe(fake({ add: false }).renderer)).toBe(false);
  });
});
