import { afterEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from '../../../tools/e2e/deadline';

describe('a scene of the end-to-end suite has a time to finish (docs/PROMPT25-LOG.md)', () => {
  afterEach(() => vi.useRealTimers());

  it('gives back what a scene that finishes in time returns', async () => {
    await expect(withDeadline('scene "a"', 1000, Promise.resolve(7))).resolves.toBe(7);
  });

  it('passes on the failure of a scene that fails in time, as it was', async () => {
    await expect(withDeadline('scene "a"', 1000, Promise.reject(new Error('the hero fell through')))).rejects.toThrow('the hero fell through');
  });

  it('fails a scene that does not finish, and the message names it and says how long it was given', async () => {
    vi.useFakeTimers();
    const stuck = new Promise<void>(() => undefined);
    const result = withDeadline('scene "hangs"', 25 * 60_000, stuck);
    const seen = expect(result).rejects.toThrow('scene "hangs" did not finish in 1500 s');
    await vi.advanceTimersByTimeAsync(25 * 60_000);
    await seen;
  });

  it('leaves no timer behind when the scene finishes (the runner would wait for it to exit)', async () => {
    vi.useFakeTimers();
    await withDeadline('scene "a"', 60_000, Promise.resolve());
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is not tripped by a scene that finishes just before the limit', async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('done'), 59_000));
    const result = withDeadline('scene "slow"', 60_000, slow);
    await vi.advanceTimersByTimeAsync(59_000);
    await expect(result).resolves.toBe('done');
  });
});
