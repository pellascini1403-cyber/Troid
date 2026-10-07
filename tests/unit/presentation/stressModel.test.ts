import { describe, expect, it } from 'vitest';
import { assignSet, DRAW_CALL_BUDGET, MEMORY_BUDGET_MIB, MIB, medianOf, pageBytes, summarizeFrames } from '@/presentation/stressModel';

/**
 * THE ARITHMETIC OF THE ART STRESS SCENE (docs/ART-PIPELINE-2D.md, part J): how a crowd is dealt among the sprite sets and how the frame times are summarised.
 */
describe('assignSet: which sprite set a sprite is drawn from', () => {
  const deal = (n: number, sets: number, order: 'sorted' | 'interleaved'): number[] => Array.from({ length: n }, (_, i) => assignSet(i, n, sets, order));

  it('sorted: in blocks — every sprite of a set is next to the others of it, in the order of the sets', () => {
    expect(deal(8, 4, 'sorted')).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    expect(deal(9, 3, 'sorted')).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
  });

  it('interleaved: round robin — neighbours are never from the same set', () => {
    expect(deal(8, 4, 'interleaved')).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(deal(5, 2, 'interleaved')).toEqual([0, 1, 0, 1, 0]);
  });

  it('either way every set gets its share (to within one sprite) and no sprite is dealt to a set that does not exist', () => {
    for (const order of ['sorted', 'interleaved'] as const) {
      for (const [n, sets] of [[100, 8], [1000, 8], [1000, 24], [500, 7], [3, 8]] as const) {
        const counts = new Array<number>(sets).fill(0);
        for (const s of deal(n, sets, order)) {
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThan(sets);
          counts[s]!++;
        }
        const used = counts.filter((c) => c > 0);
        if (n >= sets) expect(Math.max(...counts) - Math.min(...counts), `${order} ${n}/${sets}`).toBeLessThanOrEqual(1);
        expect(used.length).toBeGreaterThan(0);
      }
    }
  });

  it('one set, or nothing to deal, is set 0', () => {
    expect(deal(5, 1, 'interleaved')).toEqual([0, 0, 0, 0, 0]);
    expect(assignSet(0, 0, 4, 'sorted')).toBe(0);
    expect(assignSet(3, 10, 0, 'sorted')).toBe(0);
  });
});

describe('summarizeFrames', () => {
  it('a steady 60 Hz is 16.7 ms with nothing uneven about it', () => {
    const s = summarizeFrames(new Array<number>(60).fill(16.7));
    expect(s).toMatchObject({ frames: 60, p50Ms: 16.7, p95Ms: 16.7, maxMs: 16.7, hitches: 0 });
    expect(s.meanMs).toBeCloseTo(16.7, 9);
    expect(s.stdevMs).toBeCloseTo(0, 9);
  });

  it('a hitch is a frame that took more than twice the median: it moves the maximum and the deviation, and is counted', () => {
    const ms = [...new Array<number>(18).fill(16), 100, 17];
    const s = summarizeFrames(ms);
    expect(s.frames).toBe(20);
    expect(s.p50Ms).toBe(16);
    expect(s.maxMs).toBe(100);
    expect(s.hitches).toBe(1);
    expect(s.meanMs).toBeCloseTo((18 * 16 + 100 + 17) / 20, 9);
    expect(s.stdevMs).toBeGreaterThan(15);
  });

  it('the 95th percentile is the frame under which 95 % of them fall', () => {
    const ms = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarizeFrames(ms).p95Ms).toBe(95);
    expect(summarizeFrames(ms).p50Ms).toBe(50);
  });

  it('does not depend on the order the frames came in, and never changes what it is given', () => {
    const ms = [30, 10, 20, 50, 40];
    const copy = [...ms];
    expect(summarizeFrames(ms)).toEqual(summarizeFrames([...ms].reverse()));
    expect(ms).toEqual(copy);
  });

  it('nothing measured is all zeros, not NaN', () => {
    expect(summarizeFrames([])).toEqual({ frames: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, stdevMs: 0, hitches: 0 });
  });
});

describe('medianOf and the budgets', () => {
  it('the middle of a list of draw calls, whatever its order; an empty list is 0', () => {
    expect(medianOf([5, 1, 3])).toBe(3);
    expect(medianOf([2, 2, 9, 2, 2])).toBe(2);
    expect(medianOf([])).toBe(0);
  });

  it('a page is width × height × 4 bytes: a 2048 × 2048 page is 16 MiB', () => {
    expect(pageBytes(2048, 2048)).toBe(16 * MIB);
    expect(pageBytes(1, 1)).toBe(4);
  });

  it('the budgets are the ones the documents state: 60 draw calls a frame; 24 MiB booting, 32 MiB a zone, 96 MiB resident', () => {
    expect(DRAW_CALL_BUDGET).toBe(60);
    expect(MEMORY_BUDGET_MIB).toEqual({ boot: 24, zone: 32, resident: 96 });
  });
});
