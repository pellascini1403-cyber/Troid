import { describe, expect, it } from 'vitest';
import { floorAhead, segmentHitsRect, sightBlocked } from '@/enemies/senses';
import { createBody, CollisionWorld } from '@/world/collision';

function world(): CollisionWorld {
  const w = new CollisionWorld();
  const add = (id: string, x0: number, y0: number, x1: number, y1: number, kind: 'solid' | 'oneway' = 'solid'): void => {
    w.add({ id, rect: { x0, y0, x1, y1 }, kind, enabled: true });
  };
  add('floor_a', -10, -5, 10, 0); // ground to x = 10
  add('floor_b', 14, -5, 30, 0); // …a 4 m pit… ground again
  add('step', 18, 0, 19, 0.3); // a wall-ish bump on the far ground
  add('low_step', 31, -0.4, 40, 0); // ground a little LOWER, 0.4 m
  add('wall', 20, 0, 21, 5);
  add('shelf', 4, 2, 8, 2.3, 'oneway');
  return w;
}

describe('segmentHitsRect (Liang–Barsky)', () => {
  const r = { x0: 2, y0: 2, x1: 4, y1: 4 };
  it('crosses, misses, and works in every direction', () => {
    expect(segmentHitsRect(0, 3, 6, 3, r)).toBe(true);
    expect(segmentHitsRect(6, 3, 0, 3, r)).toBe(true);
    expect(segmentHitsRect(3, 0, 3, 6, r)).toBe(true);
    expect(segmentHitsRect(0, 0, 6, 6, r)).toBe(true);
    expect(segmentHitsRect(0, 0, 6, 1, r)).toBe(false);
    expect(segmentHitsRect(0, 5, 6, 5, r)).toBe(false);
  });
  it('a segment that ends before the rectangle does not reach it', () => {
    expect(segmentHitsRect(0, 3, 1.9, 3, r)).toBe(false);
    expect(segmentHitsRect(0, 3, 2, 3, r)).toBe(true); // touching counts
  });
  it('a segment inside the rectangle hits it; a parallel segment outside does not', () => {
    expect(segmentHitsRect(2.5, 2.5, 3.5, 3.5, r)).toBe(true);
    expect(segmentHitsRect(0, 1, 6, 1, r)).toBe(false);
    expect(segmentHitsRect(1, 0, 1, 6, r)).toBe(false);
  });
  it('degenerate: a point', () => {
    expect(segmentHitsRect(3, 3, 3, 3, r)).toBe(true);
    expect(segmentHitsRect(0, 0, 0, 0, r)).toBe(false);
  });
});

describe('floorAhead', () => {
  const body = (x: number, y = 0): ReturnType<typeof createBody> => {
    const b = createBody(0.55, 0.9);
    b.x = x;
    b.y = y;
    return b;
  };
  it('is true over solid ground', () => {
    expect(floorAhead(world(), body(2), 1)).toBe(true);
    expect(floorAhead(world(), body(2), -1)).toBe(true);
  });
  it('is false at the edge of a pit, looking into it (and true looking back)', () => {
    const w = world();
    expect(floorAhead(w, body(9.4), 1)).toBe(false); // leading edge 9.95 + 0.25 reach is over the pit
    expect(floorAhead(w, body(9.4), -1)).toBe(true);
    expect(floorAhead(w, body(14.6), -1)).toBe(false);
  });
  it('a small step down (≤ 0.6 m) still counts as floor; a deeper drop does not', () => {
    const w = world();
    expect(floorAhead(w, body(30.2), 1)).toBe(true); // the lower ground at −0.4
    expect(floorAhead(w, body(9.4), 1, 0.25, 0.3)).toBe(false);
  });
  it('a one-way platform counts as floor', () => {
    expect(floorAhead(world(), body(5, 2.3), 1)).toBe(true);
    expect(floorAhead(world(), body(8.0, 2.3), 1)).toBe(false); // past the platform's end
  });
  it('the side of a wall is not floor: only a top surface within reach counts', () => {
    expect(floorAhead(world(), body(19.6, 3), 1)).toBe(false); // beside the wall, in the air: its top (5 m) is far above
    expect(floorAhead(world(), body(19.6), 1)).toBe(true); // on the ground at its foot, the ground continues under it
  });
});

describe('sightBlocked', () => {
  it('a solid between two bodies hides them', () => {
    expect(sightBlocked(world(), 16, 0.5, 25, 0.5)).toBe(true);
  });
  it('a clear line is not blocked', () => {
    expect(sightBlocked(world(), 22, 0.5, 29, 0.5)).toBe(false);
    expect(sightBlocked(world(), 0, 0.5, 9, 0.5)).toBe(false);
  });
  it('a one-way platform hides nothing', () => {
    expect(sightBlocked(world(), 5, 1, 6, 3.5)).toBe(false);
  });
  it('a line that passes over the wall is not blocked; through it, is', () => {
    expect(sightBlocked(world(), 16, 6, 25, 6)).toBe(false);
    expect(sightBlocked(world(), 16, 0.5, 25, 4.5)).toBe(true);
  });
});
