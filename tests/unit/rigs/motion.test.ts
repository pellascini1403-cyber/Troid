import { describe, expect, it } from 'vitest';
import { bump, Chain, easeInOut, easeOut, easeOutBack, footCycle, ik2, mote, seedOf, smoothstep, Spring, tentacle, wobble } from '@/rigs/kit/motion';

describe('motion of the rigs', () => {
  it('a seed is the same for the same id, differs between ids and lies in [0, 1)', () => {
    expect(seedOf('enemy_17')).toBe(seedOf('enemy_17'));
    const seeds = new Set(Array.from({ length: 200 }, (_, i) => seedOf(`enemy_${i}`)));
    expect(seeds.size).toBeGreaterThan(190);
    for (const s of seeds) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it('the easings start at 0 and end at 1, and the bump rises and falls', () => {
    for (const f of [easeOut, easeInOut, (t: number) => smoothstep(0, 1, t), (t: number) => easeOutBack(t)]) {
      expect(f(0)).toBeCloseTo(0, 6);
      expect(f(1)).toBeCloseTo(1, 6);
    }
    expect(bump(0, 0, 1)).toBeCloseTo(0, 6);
    expect(bump(0.5, 0, 1)).toBeCloseTo(1, 6);
    expect(bump(1, 0, 1)).toBeCloseTo(0, 6);
    expect(Math.abs(wobble(1.234, 2, 0.3))).toBeLessThanOrEqual(1);
  });

  it('a spring settles on its target without blowing up, even on a slow frame', () => {
    const s = new Spring(0, 90, 11);
    for (let i = 0; i < 240; i++) s.step(5, 1 / 60);
    expect(s.x).toBeCloseTo(5, 2);
    const slow = new Spring(0, 400, 20);
    for (let i = 0; i < 40; i++) slow.step(3, 0.1);
    expect(Number.isFinite(slow.x)).toBe(true);
    expect(slow.x).toBeCloseTo(3, 1);
    expect(s.step(5, 0)).toBe(s.x); // no time, no motion
  });

  it('a limb of two bones reaches its target, stretches to full reach when it is too far, and bends to the side asked', () => {
    const near = ik2(10, 10, 12, 8, 1);
    const elbow = (a1: number): [number, number] => [Math.cos(a1) * 10, Math.sin(a1) * 10];
    const e = elbow(near.a1);
    const tip: [number, number] = [e[0] + Math.cos(near.a2) * 10, e[1] + Math.sin(near.a2) * 10];
    expect(tip[0]).toBeCloseTo(12, 4);
    expect(tip[1]).toBeCloseTo(8, 4);
    const far = ik2(10, 10, 100, 0, 1);
    expect(far.reach).toBeLessThan(20);
    expect(far.reach).toBeGreaterThan(19.9);
    // the two bends put the knee on opposite sides of the line to the target
    const up = elbow(ik2(10, 10, 15, 0, 1).a1);
    const down = elbow(ik2(10, 10, 15, 0, -1).a1);
    expect(up[1]).toBeGreaterThan(0);
    expect(down[1]).toBeLessThan(0);
  });

  it('a foot is planted while the body passes over it and swings forward, lifted, the rest of the step', () => {
    const planted = footCycle(0.2, 10, 4, 0.6);
    expect(planted.y).toBe(0);
    const swing = footCycle(0.8, 10, 4, 0.6);
    expect(swing.y).toBeGreaterThan(3.9);
    // it is periodic and continuous at the seam
    const a = footCycle(0.9999, 10, 4);
    const b = footCycle(1.0001, 10, 4);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.01);
    expect(footCycle(-0.25, 10, 4).x).toBeCloseTo(footCycle(0.75, 10, 4).x, 6);
  });

  it('a chain follows its root at a fixed segment length and trails when the root moves', () => {
    const c = new Chain(6, 10, 0.7);
    for (let i = 0; i < 120; i++) c.follow(i * 2, 0, 1 / 60);
    const gaps = c.pts.slice(1).map((p, i) => Math.hypot(p[0] - c.pts[i]![0], p[1] - c.pts[i]![1]));
    // every segment keeps its length exactly, however fast the root goes
    for (const g of gaps) expect(g).toBeCloseTo(10, 6);
    // and the end of it trails behind the root
    expect(c.pts[5]![0]).toBeLessThan(c.pts[0]![0]);
  });

  it('a tentacle has the points asked and is as long as asked (straight when it neither curls nor sways)', () => {
    const t = tentacle([0, 0], 0, 30, 7, 0, 0, 0);
    expect(t).toHaveLength(7);
    expect(t[6]![0]).toBeCloseTo(30, 6);
    expect(t[6]![1]).toBeCloseTo(0, 6);
  });

  it('a mote is always inside its life: alpha 0 → 1 → 0 as it rises', () => {
    for (let i = 0; i < 8; i++) {
      const m = mote(i, 8, 3.7, 0.5, 0.2);
      expect(m.a).toBeGreaterThanOrEqual(0);
      expect(m.a).toBeLessThanOrEqual(1);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(1);
    }
  });
});
