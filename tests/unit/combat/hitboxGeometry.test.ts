import { describe, expect, it } from 'vitest';
import { attackRect } from '@/combat/hitboxGeometry';
import type { Rect } from '@/core/math';

const attack = { hitbox: { x: 0.2, y: 0.3, w: 1.4, h: 1.1 } };
const out = (): Rect => ({ x0: 0, y0: 0, x1: 0, y1: 0 });

describe('attackRect', () => {
  it('is authored facing right: near edge `x` in front of the body centre, bottom edge `y` above the feet', () => {
    const r = attackRect(attack, 10, 2, 1, out());
    expect(r.x0).toBeCloseTo(10.2);
    expect(r.x1).toBeCloseTo(11.6);
    expect(r.y0).toBeCloseTo(2.3);
    expect(r.y1).toBeCloseTo(3.4);
  });

  it('mirrors around the body centre when facing left (same size, same height)', () => {
    const r = attackRect(attack, 10, 2, -1, out());
    expect(r.x0).toBeCloseTo(8.4);
    expect(r.x1).toBeCloseTo(9.8);
    expect(r.y0).toBeCloseTo(2.3);
    expect(r.y1).toBeCloseTo(3.4);
    expect(r.x1 - r.x0).toBeCloseTo(1.4);
  });

  it('writes into the rect it is given (no allocation) and returns it', () => {
    const o = out();
    expect(attackRect(attack, 0, 0, 1, o)).toBe(o);
  });
});
