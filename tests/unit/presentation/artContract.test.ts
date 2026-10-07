import { describe, expect, it } from 'vitest';
import { applyContract } from '@/presentation/artContract';
import type { ArtIssue } from '@/presentation/artManifest';
import type { AtlasMeta, SpriteSetDefinition } from '@/presentation/SpriteSetDefinition';

/**
 * WHAT THE GAME DOES WITH A SET THAT DOES NOT MEET THE CONTRACT (docs/ART-PIPELINE-2D.md, parts C and E): one pure function, used by the library when it loads
 * and by the checker before any browser is opened. A clip that breaks the contract is left out; the set is refused only when idle, or the set as a whole, is broken.
 */
const names = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
const def = (clips: SpriteSetDefinition['clips']): SpriteSetDefinition => ({ id: 'p/s', atlas: 'art:p/s@1', artPxPerMeter: 100, pivot: [0.5, 1], height: 1.7, clips });
const sword = (state: string, n: number, grip: [number, number] | null = null): AtlasMeta['frames'] =>
  Object.fromEntries(names(`${state}_`, n).map((f, i) => [f, { anchors: { hand_r: [0.3 + 0.1 * i, 1] as const, weapon_grip: grip ?? ([0.3 + 0.1 * i, 1] as const), weapon_tip: [1.2 + 0.1 * i, 1.2] as const } }]));
const avail = (...groups: string[][]): Set<string> => new Set(groups.flat());
const err = (path: string, message: string): ArtIssue => ({ level: 'error', path, message });

describe('applyContract', () => {
  const good = def({ idle: { frames: 'idle_', count: 2 }, attack1: { frames: 'attack1_', count: 3, phases: { startup: [0, 0], active: [1, 1], recovery: [2, 2] } } });
  const meta: AtlasMeta = { frames: sword('attack1', 3) };

  it('a set that meets the contract is used as it is', () => {
    const r = applyContract(good, meta, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(r).toEqual({ def: good, dropped: [], refused: [], warnings: [] });
  });

  it('a clip with a frame that is not in the pages is left out; the rest of the set is kept', () => {
    const cross = [err('sprites.s.clips.attack1', 'missing frame attack1_02 (the clip has 3)')];
    const r = applyContract(good, meta, avail(names('idle_', 2), names('attack1_', 2)), cross);
    expect(r.refused).toEqual([]);
    expect(r.dropped.map((d) => d.state)).toEqual(['attack1']);
    expect(Object.keys(r.def.clips)).toEqual(['idle']);
    expect(r.def.id).toBe(good.id);
  });

  it('a sword away from the hand, or with no anchors, is a reason to leave out THAT clip', () => {
    const away = applyContract(good, { frames: sword('attack1', 3, [0.9, 1]) }, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(away.dropped).toEqual([{ state: 'attack1', reason: expect.stringMatching(/the sword grip is not on the right hand/) }]);
    const none = applyContract(good, { frames: {} }, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(none.dropped).toEqual([{ state: 'attack1', reason: expect.stringMatching(/has no "weapon_tip" anchor/) }]);
    expect(none.refused).toEqual([]);
  });

  it('phases outside the clip are a reason to leave it out; overlapping phases are only a warning', () => {
    const outside = def({ idle: { frames: 'idle_', count: 2 }, attack1: { frames: 'attack1_', count: 3, phases: { startup: [0, 0], active: [1, 1], recovery: [2, 5] } } });
    const r = applyContract(outside, meta, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(r.dropped.map((d) => d.state)).toEqual(['attack1']);
    const overlap = def({ idle: { frames: 'idle_', count: 2 }, attack1: { frames: 'attack1_', count: 3, phases: { startup: [0, 1], active: [1, 1], recovery: [2, 2] } } });
    const w = applyContract(overlap, meta, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(w.dropped).toEqual([]);
    expect(w.warnings.join('\n')).toMatch(/phases overlap/);
  });

  it('a broken idle refuses the whole set: it is the last resort of every state', () => {
    const cross = [err('sprites.s.clips.idle', 'missing frame idle_01 (the clip has 2)')];
    const r = applyContract(good, meta, avail(names('idle_', 1), names('attack1_', 3)), cross);
    expect(r.refused).toContain('clip "idle": missing frame idle_01 (the clip has 2)');
    expect(r.dropped).toEqual([]); // nothing is dropped from a set that is refused: it is not used at all
    expect(applyContract(def({ attack1: good.clips.attack1! }), meta, avail(names('attack1_', 3)), []).refused.join('\n')).toMatch(/no "idle" clip/);
  });

  it('what is wrong with the set as a whole refuses it (frames of different sizes, a pivot outside the frame, a height that is not one)', () => {
    expect(applyContract(good, meta, avail(names('idle_', 2), names('attack1_', 3)), [err('sprites.s.frames', 'the frames do not share one original size')]).refused).toEqual(['the frames do not share one original size']);
    expect(applyContract({ ...good, pivot: [0.5, 3] }, meta, avail(names('idle_', 2), names('attack1_', 3)), []).refused.join('\n')).toMatch(/pivot/);
    expect(applyContract({ ...good, height: 0 }, meta, avail(names('idle_', 2), names('attack1_', 3)), []).refused.join('\n')).toMatch(/height must be positive/);
  });

  it('a scale that does not match the height is a warning, not a reason to refuse', () => {
    const tall: AtlasMeta = { frames: { ...meta.frames, idle_00: { heightPx: 400 }, idle_01: { heightPx: 400 } } };
    const r = applyContract(good, tall, avail(names('idle_', 2), names('attack1_', 3)), []);
    expect(r.refused).toEqual([]);
    expect(r.warnings.join('\n')).toMatch(/the character is 4\.00 m tall at 100 px\/m, the definition says 1\.7 m/);
  });

  it('does not change what it is given', () => {
    const before = structuredClone(good);
    applyContract(good, { frames: {} }, avail(names('idle_', 2)), [err('sprites.s.clips.attack1', 'missing frame attack1_00')]);
    expect(good).toEqual(before);
  });
});
