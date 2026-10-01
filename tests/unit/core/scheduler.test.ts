import { describe, expect, it } from 'vitest';
import { Scheduler, type TimerHandle } from '@/core/scheduler';

describe('Scheduler', () => {
  it('fires after the requested number of ticks, never earlier', () => {
    const s = new Scheduler();
    let fired = 0;
    s.after(3, () => fired++);
    s.tick();
    s.tick();
    expect(fired).toBe(0);
    s.tick();
    expect(fired).toBe(1);
    s.tick();
    expect(fired).toBe(1);
    expect(s.pending).toBe(0);
  });

  it('after(0) fires on the next tick and can never fire inside the tick that created it', () => {
    const s = new Scheduler();
    const order: string[] = [];
    s.after(1, () => {
      order.push('a');
      s.after(0, () => order.push('nested'));
    });
    s.tick();
    expect(order).toEqual(['a']);
    s.tick();
    expect(order).toEqual(['a', 'nested']);
  });

  it('runs timers due on the same tick in creation order', () => {
    const s = new Scheduler();
    const order: number[] = [];
    s.after(2, () => order.push(1));
    s.after(2, () => order.push(2));
    s.after(1, () => order.push(0));
    s.tick();
    s.tick();
    expect(order).toEqual([0, 1, 2]);
  });

  it('every repeats until cancelled or until the callback calls stop()', () => {
    const s = new Scheduler();
    let n = 0;
    s.every(2, (stop) => {
      n++;
      if (n === 3) stop();
    });
    for (let i = 0; i < 20; i++) s.tick();
    expect(n).toBe(3);
    expect(s.pending).toBe(0);

    let m = 0;
    const h = s.every(1, () => void m++);
    s.tick();
    s.tick();
    s.cancel(h);
    s.tick();
    expect(m).toBe(2);
    expect(s.pending).toBe(0);
  });

  it('cancel is idempotent and safe on fired timers', () => {
    const s = new Scheduler();
    const h = s.after(1, () => {});
    s.tick();
    s.cancel(h);
    s.cancel(h);
    s.cancel(null);
    expect(s.pending).toBe(0);
  });

  it('cancelOwner removes everything an owner scheduled and nothing else', () => {
    const s = new Scheduler();
    const room = {};
    const other = {};
    let fired = 0;
    s.after(5, () => fired++, room);
    s.every(2, () => void fired++, room);
    s.after(5, () => fired++, other);
    expect(s.pending).toBe(3);
    expect(s.cancelOwner(room)).toBe(2);
    expect(s.pending).toBe(1);
    for (let i = 0; i < 10; i++) s.tick();
    expect(fired).toBe(1);
  });

  it('a callback can cancel another timer that is due in the same tick', () => {
    const s = new Scheduler();
    let fired = 0;
    let victim: TimerHandle | undefined;
    s.after(1, () => s.cancel(victim)); // runs first (created first)
    victim = s.after(1, () => fired++);
    s.tick();
    expect(fired).toBe(0);
    expect(s.pending).toBe(0);
  });

  it('clear drops all timers', () => {
    const s = new Scheduler();
    s.after(1, () => {});
    s.every(1, () => {});
    s.clear();
    expect(s.pending).toBe(0);
    s.tick();
  });
});
