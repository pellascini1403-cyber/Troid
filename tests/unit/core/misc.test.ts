import { describe, expect, it, vi } from 'vitest';
import { DisposableStore, toDisposable } from '@/core/lifecycle';
import { Pool } from '@/core/pool';
import { Rng } from '@/core/rng';
import { Observable } from '@/core/observable';
import { FixedStepper, TICK_SECONDS, secondsToTicks } from '@/core/time';
import { IdGenerator } from '@/core/ids';
import {
  approach, clamp, damp, easeInOutCubic, invLerp, overlaps, rect, rectFromFeet, remap, sign, smoothDamp,
  containsPoint,
} from '@/core/math';

describe('DisposableStore', () => {
  it('disposes in reverse order, once', () => {
    const order: number[] = [];
    const store = new DisposableStore();
    store.add(() => order.push(1));
    store.add(toDisposable(() => order.push(2)));
    store.add({ dispose: () => order.push(3) });
    store.dispose();
    store.dispose();
    expect(order).toEqual([3, 2, 1]);
    expect(store.disposed).toBe(true);
  });

  it('keeps disposing when one disposer throws, then rethrows the first error', () => {
    const store = new DisposableStore();
    const ran = vi.fn();
    store.add(ran);
    store.add(() => {
      throw new Error('first');
    });
    store.add(ran);
    expect(() => store.dispose()).toThrow('first');
    expect(ran).toHaveBeenCalledTimes(2);
  });

  it('disposes late registrations immediately (nothing can leak after disposal)', () => {
    const store = new DisposableStore();
    store.dispose();
    const fn = vi.fn();
    store.add(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(0);
  });

  it('reset empties the store but keeps it usable', () => {
    const store = new DisposableStore();
    const fn = vi.fn();
    store.add(fn);
    store.reset();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(store.disposed).toBe(false);
    store.add(fn);
    store.dispose();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('toDisposable is idempotent', () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    d.dispose();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Pool', () => {
  it('reuses released objects and resets them', () => {
    const pool = new Pool(() => ({ v: 0 }), (o) => (o.v = 0));
    const a = pool.acquire()!;
    a.v = 5;
    expect(pool.release(a)).toBe(true);
    const b = pool.acquire()!;
    expect(b).toBe(a);
    expect(b.v).toBe(0);
    expect(pool.created).toBe(1);
  });

  it('refuses double release and foreign objects (no duplicates in the free list)', () => {
    const pool = new Pool(() => ({}));
    const a = pool.acquire()!;
    expect(pool.release(a)).toBe(true);
    expect(pool.release(a)).toBe(false);
    expect(pool.release({})).toBe(false);
    const x = pool.acquire()!;
    const y = pool.acquire()!;
    expect(x).not.toBe(y);
  });

  it('returns null at capacity and recovers after a release', () => {
    const pool = new Pool(() => ({}), () => {}, 2);
    const a = pool.acquire()!;
    pool.acquire();
    expect(pool.acquire()).toBeNull();
    pool.release(a);
    expect(pool.acquire()).toBe(a);
  });

  it('releaseAll and dispose', () => {
    const pool = new Pool(() => ({}));
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.active).toBe(0);
    expect(pool.available).toBe(2);
    const disposed = vi.fn();
    pool.dispose(disposed);
    expect(disposed).toHaveBeenCalledTimes(2);
    expect(pool.created).toBe(0);
  });
});

describe('Rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 8 }, () => a.next());
    const sb = Array.from({ length: 8 }, () => b.next());
    const sc = Array.from({ length: 8 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('stays in range and is roughly uniform', () => {
    const r = new Rng(1);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeGreaterThan(0.47);
    expect(sum / 10000).toBeLessThan(0.53);
  });

  it('int() respects bounds, state can be saved and restored', () => {
    const r = new Rng(7);
    for (let i = 0; i < 500; i++) {
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(6);
    }
    const saved = r.state;
    const next = r.next();
    r.state = saved;
    expect(r.next()).toBe(next);
  });

  it('fork yields an independent sequence', () => {
    const r = new Rng(9);
    const f = r.fork();
    expect(f.next()).not.toBe(new Rng(9).next());
  });
});

describe('Observable', () => {
  it('notifies only on real changes and supports immediate subscribe', () => {
    const o = new Observable(1);
    const fn = vi.fn();
    o.subscribe(fn, true);
    expect(fn).toHaveBeenCalledWith(1, 1);
    expect(o.set(1)).toBe(false);
    expect(o.set(2)).toBe(true);
    expect(fn).toHaveBeenLastCalledWith(2, 1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('unsubscribes cleanly (listenerCount back to 0)', () => {
    const o = new Observable('a');
    const off = o.subscribe(() => {});
    expect(o.listenerCount).toBe(1);
    off();
    off();
    expect(o.listenerCount).toBe(0);
  });

  it('supports custom equality (structural view-models)', () => {
    const o = new Observable({ hp: 3 }, (a, b) => a.hp === b.hp);
    const fn = vi.fn();
    o.subscribe(fn);
    o.set({ hp: 3 });
    expect(fn).not.toHaveBeenCalled();
    o.set({ hp: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('FixedStepper', () => {
  it('runs one step per step-sized frame and exposes the leftover as alpha', () => {
    const s = new FixedStepper();
    let steps = 0;
    expect(s.advance(TICK_SECONDS, () => steps++)).toBeCloseTo(0, 5);
    expect(steps).toBe(1);
    const alpha = s.advance(TICK_SECONDS * 1.5, () => steps++);
    expect(steps).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('runs several steps for a long frame but never more than the cap (no spiral of death)', () => {
    const s = new FixedStepper();
    let steps = 0;
    s.advance(0.1, () => steps++);
    expect(steps).toBe(5); // 0.1 s = 6 ticks, capped to 5, backlog dropped
    steps = 0;
    s.advance(TICK_SECONDS, () => steps++);
    expect(steps).toBe(1);
  });

  it('clamps huge frames (tab was in the background)', () => {
    const s = new FixedStepper();
    let steps = 0;
    s.advance(60, () => steps++);
    expect(steps).toBeLessThanOrEqual(5);
  });

  it('120 Hz displays: steps every other frame, alpha interpolates in between', () => {
    const s = new FixedStepper();
    let steps = 0;
    for (let i = 0; i < 120; i++) s.advance(1 / 120, () => steps++);
    expect(steps).toBe(60);
  });

  it('secondsToTicks rounds', () => {
    expect(secondsToTicks(0.1)).toBe(6);
  });
});

describe('IdGenerator', () => {
  it('is per instance, never shared', () => {
    const a = new IdGenerator();
    const b = new IdGenerator();
    expect(a.next('x')).toBe('x1');
    expect(a.next('x')).toBe('x2');
    expect(b.next('x')).toBe('x1');
  });
});

describe('math', () => {
  it('clamp / sign / invLerp / remap', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(sign(-0.2)).toBe(-1);
    expect(sign(0)).toBe(0);
    expect(invLerp(0, 10, 5)).toBe(0.5);
    expect(remap(15, 0, 10, 0, 100)).toBe(100);
    expect(remap(15, 0, 10, 0, 100, false)).toBe(150);
  });

  it('approach never overshoots', () => {
    expect(approach(0, 1, 0.4)).toBeCloseTo(0.4);
    expect(approach(0.9, 1, 0.4)).toBe(1);
    expect(approach(1, 0, 0.4)).toBeCloseTo(0.6);
    expect(approach(0.2, 0, 5)).toBe(0);
  });

  it('damp converges and is frame-rate independent', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = damp(a, 1, 10, 1 / 60);
    let b = 0;
    for (let i = 0; i < 120; i++) b = damp(b, 1, 10, 1 / 120);
    expect(a).toBeCloseTo(b, 3);
    expect(a).toBeGreaterThan(0.99);
  });

  it('smoothDamp reaches the target without overshooting', () => {
    const st = { value: 0, velocity: 0 };
    let max = 0;
    for (let i = 0; i < 240; i++) {
      smoothDamp(st, 10, 0.3, 1 / 60);
      max = Math.max(max, st.value);
    }
    expect(max).toBeLessThanOrEqual(10 + 1e-9);
    expect(st.value).toBeCloseTo(10, 2);
  });

  it('smoothDamp keeps momentum when the target flips (value is continuous, it does not teleport)', () => {
    const st = { value: 0, velocity: 0 };
    for (let i = 0; i < 30; i++) smoothDamp(st, 5, 0.25, 1 / 60);
    const before = st.value;
    smoothDamp(st, -5, 0.25, 1 / 60);
    expect(Math.abs(st.value - before)).toBeLessThan(0.2); // one frame moves a few cm, not metres
  });

  it('smoothDamp respects maxSpeed', () => {
    const st = { value: 0, velocity: 0 };
    for (let i = 0; i < 60; i++) smoothDamp(st, 100, 0.3, 1 / 60, 2);
    expect(st.value).toBeGreaterThan(1.0);
    expect(st.value).toBeLessThan(2.2); // ≈ 2 m/s for 1 s
  });

  it('rect overlap is strict (touching edges do not overlap)', () => {
    const a = rect(0, 0, 1, 1);
    expect(overlaps(a, rect(0.5, 0.5, 2, 2))).toBe(true);
    expect(overlaps(a, rect(1, 0, 2, 1))).toBe(false);
    expect(overlaps(a, rect(0, 1, 1, 2))).toBe(false);
    expect(containsPoint(a, 1, 1)).toBe(true);
  });

  it('rectFromFeet anchors at the soles', () => {
    const r = rectFromFeet(rect(), 10, 2, 0.35, 1.7);
    expect(r).toEqual({ x0: 9.65, x1: 10.35, y0: 2, y1: 3.7 });
  });

  it('easeInOutCubic is monotonic and hits its endpoints', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.75));
  });
});
