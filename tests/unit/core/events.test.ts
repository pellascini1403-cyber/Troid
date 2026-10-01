import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '@/core/events';

interface Ev {
  hit: { amount: number };
  ping: void;
}

describe('EventBus', () => {
  it('delivers typed payloads and void events', () => {
    const bus = new EventBus<Ev>();
    const hit = vi.fn();
    const ping = vi.fn();
    bus.on('hit', hit);
    bus.on('ping', ping);
    bus.emit('hit', { amount: 3 });
    bus.emit('ping');
    expect(hit).toHaveBeenCalledWith({ amount: 3 });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe is idempotent and removes only that handler', () => {
    const bus = new EventBus<Ev>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('ping', a);
    bus.on('ping', b);
    offA();
    offA();
    bus.emit('ping');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount('ping')).toBe(1);
  });

  it('registering the same function twice is two subscriptions, each removable independently', () => {
    const bus = new EventBus<Ev>();
    const fn = vi.fn();
    const off1 = bus.on('ping', fn);
    bus.on('ping', fn);
    expect(bus.listenerCount()).toBe(2);
    off1();
    // Removing one subscription must not wipe the other registration of the same function.
    bus.emit('ping');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('is safe to unsubscribe / subscribe while dispatching (snapshot semantics)', () => {
    const bus = new EventBus<Ev>();
    const calls: string[] = [];
    let offSecond: () => void = () => {};
    bus.on('ping', () => {
      calls.push('first');
      offSecond(); // removed mid-dispatch: still runs in THIS dispatch, never again
      bus.on('ping', () => calls.push('late')); // added mid-dispatch: not run in this dispatch
    });
    offSecond = bus.on('ping', () => calls.push('second'));
    bus.emit('ping');
    expect(calls).toEqual(['first', 'second']);
    calls.length = 0;
    bus.emit('ping');
    expect(calls).toEqual(['first', 'late']);
  });

  it('once fires a single time', () => {
    const bus = new EventBus<Ev>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping');
    bus.emit('ping');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount()).toBe(0);
  });

  it('a throwing handler does not stop the others and is reported', () => {
    const bus = new EventBus<Ev>();
    const errors: unknown[] = [];
    bus.onError = (e) => errors.push(e);
    const after = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', after);
    bus.emit('ping');
    expect(after).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
  });

  it('listenerCount returns to zero after clear (leak check helper)', () => {
    const bus = new EventBus<Ev>();
    bus.on('ping', () => {});
    bus.on('hit', () => {});
    expect(bus.listenerCount()).toBe(2);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });
});
