import { describe, expect, it } from 'vitest';
import { datan2, dcos, dhypot, dsin } from '@/core/dmath';

/**
 * DETERMINISTIC MATH (src/core/dmath.ts): the sine, cosine, arctangent and hypotenuse of the simulation. They have to be as good as the engine's (the game plays as it did) and made only of operations whose result is the same on every engine
 * (so that the same game is the same game everywhere).
 */
const TOLERANCE = 4e-16;
/** The arctangent is built from an angle and a π that has been rounded: a couple of units of the last place near π. */
const ATAN_TOLERANCE = 1e-15;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('dsin and dcos', () => {
  it('agree with the engine\'s to 4e-16 over a dense grid of angles, a few turns either way', () => {
    let worstSin = 0;
    let worstCos = 0;
    for (let i = -400000; i <= 400000; i++) {
      const x = i * 0.00005 * Math.PI; // ±20π in steps of 0.00005π
      worstSin = Math.max(worstSin, Math.abs(dsin(x) - Math.sin(x)));
      worstCos = Math.max(worstCos, Math.abs(dcos(x) - Math.cos(x)));
    }
    expect(worstSin).toBeLessThan(TOLERANCE);
    expect(worstCos).toBeLessThan(TOLERANCE);
  });

  it('agree over the arguments the game really gives them: headings (±π, a little more), the slow drift of a lantern (t / 50 for hours of play) and random reals', () => {
    const rnd = lcg(7);
    let worst = 0;
    for (let i = 0; i < 200000; i++) {
      const x = i < 100000 ? (rnd() - 0.5) * 8 : (rnd() * 2e5) / 31; // ticks of a lantern: up to some 6 000 radians
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(TOLERANCE);
  });

  it('has the values and the symmetries of the functions: exact where the engine is, odd and even, sin² + cos² = 1, the sine of a quarter turn', () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
    expect(Object.is(dsin(-0), -0)).toBe(true);
    expect(dsin(Math.PI / 2)).toBeCloseTo(1, 15);
    expect(dcos(Math.PI / 2)).toBeCloseTo(0, 15);
    expect(dcos(Math.PI)).toBeCloseTo(-1, 15);
    expect(dsin(Math.PI)).toBeCloseTo(0, 15);
    const rnd = lcg(3);
    for (let i = 0; i < 2000; i++) {
      const x = (rnd() - 0.5) * 60;
      expect(dsin(-x)).toBe(-dsin(x));
      expect(dcos(-x)).toBe(dcos(x));
      expect(Math.abs(dsin(x) ** 2 + dcos(x) ** 2 - 1)).toBeLessThan(5e-16);
      expect(dsin(x + Math.PI / 2)).toBeCloseTo(dcos(x), 14);
    }
  });

  it('is NaN for what is not a finite number, and keeps its head for the absurd (an argument of 1e15 radians is still between −1 and 1)', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(dsin(bad)).toBeNaN();
      expect(dcos(bad)).toBeNaN();
    }
    for (const huge of [1e7, -3e9, 1e15, 7e18]) {
      expect(Math.abs(dsin(huge))).toBeLessThanOrEqual(1);
      expect(Math.abs(dcos(huge))).toBeLessThanOrEqual(1);
    }
  });
});

describe('datan2', () => {
  it('agrees with the engine\'s to 1e-15 over the whole circle, at every scale', () => {
    const rnd = lcg(11);
    let worst = 0;
    for (let i = 0; i < 300000; i++) {
      const a = rnd() * 2 * Math.PI;
      const r = 10 ** (rnd() * 8 - 4); // from a ten-thousandth of a metre to ten thousand
      const y = Math.sin(a) * r;
      const x = Math.cos(a) * r;
      worst = Math.max(worst, Math.abs(datan2(y, x) - Math.atan2(y, x)));
    }
    expect(worst).toBeLessThan(ATAN_TOLERANCE);
    // and along the axes and the diagonals, where the branches of the function meet
    for (const [y, x] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0.5, 1], [1, 0.5], [3, 4], [-3, 4], [1e-9, 1], [1, 1e-9], [1e9, 1e-9]] as const) {
      expect(Math.abs(datan2(y, x) - Math.atan2(y, x)), `${y}, ${x}`).toBeLessThan(ATAN_TOLERANCE);
    }
  });

  it('has the special values the language defines: the zeros keep their signs, the infinities have their angles, the axes are quarter turns', () => {
    const cases: Array<[number, number]> = [
      [0, 1], [-0, 1], [0, -1], [-0, -1], [0, 0], [-0, 0], [0, -0], [-0, -0],
      [1, 0], [-1, 0], [1, -0], [-1, -0],
      [Infinity, Infinity], [Infinity, -Infinity], [-Infinity, Infinity], [-Infinity, -Infinity],
      [1, Infinity], [-1, Infinity], [1, -Infinity], [-1, -Infinity], [Infinity, 1], [-Infinity, 1], [Infinity, -1], [-Infinity, -1],
    ];
    for (const [y, x] of cases) expect(Object.is(datan2(y, x), Math.atan2(y, x)) || Math.abs(datan2(y, x) - Math.atan2(y, x)) < ATAN_TOLERANCE, `atan2(${y}, ${x}) = ${datan2(y, x)} (the engine: ${Math.atan2(y, x)})`).toBe(true);
    for (const [y, x] of cases.filter(([y, x]) => y === 0 && x === 0 || y === 0)) expect(Object.is(datan2(y, x), Math.atan2(y, x)), `atan2(${y}, ${x}) keeps the sign of its zero`).toBe(true);
    expect(datan2(NaN, 1)).toBeNaN();
    expect(datan2(1, NaN)).toBeNaN();
  });

  it('is odd in y and turns the right way: the angle of a vector grows counter-clockwise', () => {
    const rnd = lcg(5);
    for (let i = 0; i < 2000; i++) {
      const y = (rnd() - 0.5) * 100;
      const x = (rnd() - 0.5) * 100;
      expect(datan2(-y, x)).toBe(-datan2(y, x));
      expect(datan2(y, x)).toBeGreaterThan(-Math.PI - 1e-15);
      expect(datan2(y, x)).toBeLessThan(Math.PI + 1e-15);
    }
    expect(datan2(1, 0.001)).toBeLessThan(datan2(1, -0.001));
  });
});

describe('dhypot', () => {
  it('is the length of the vector, to the last digit of the engine\'s over the scale of a world', () => {
    const rnd = lcg(9);
    for (let i = 0; i < 100000; i++) {
      const x = (rnd() - 0.5) * 400;
      const y = (rnd() - 0.5) * 400;
      expect(Math.abs(dhypot(x, y) - Math.hypot(x, y))).toBeLessThanOrEqual(Math.hypot(x, y) * 5e-16);
    }
    expect(dhypot(3, 4)).toBe(5);
    expect(dhypot(0, 0)).toBe(0);
    expect(dhypot(-5, 12)).toBe(13);
  });
});

describe('deterministic: the same bits for the same arguments, whatever the engine does with its own', () => {
  it('does not call the engine\'s Math.sin / cos / atan2 / hypot (their results are the engine\'s to choose): replaced by a function that answers differently, the answers do not change', () => {
    const real = { sin: Math.sin, cos: Math.cos, atan2: Math.atan2, hypot: Math.hypot };
    const args = Array.from({ length: 2000 }, (_, i) => [(i - 1000) * 0.0173, (1000 - i) * 0.0291 + 0.5] as const);
    const run = (): number[] => args.flatMap(([a, b]) => [dsin(a), dcos(a), datan2(b, a), dhypot(a, b)]);
    const before = run();
    try {
      Math.sin = (x) => real.sin(x) * (1 + 1e-9);
      Math.cos = (x) => real.cos(x) * (1 + 1e-9);
      Math.atan2 = (y, x) => real.atan2(y, x) * (1 + 1e-9);
      Math.hypot = (...v) => real.hypot(...v) * (1 + 1e-9);
      expect(run()).toEqual(before);
    } finally {
      Object.assign(Math, real);
    }
  });
});
