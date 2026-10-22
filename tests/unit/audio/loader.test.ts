import { describe, expect, it } from 'vitest';
import { decodeWith } from '@/audio/loader';
import { makeRig } from '../../helpers/audioRig';
import { fakeBuffer } from '../../helpers/fakeAudio';

describe('SoundLoader: the groups of sounds', () => {
  it('fetches and decodes every variation of a group once, and keeps them while somebody holds the group', async () => {
    const { loader, fetched } = makeRig();
    const report = await loader.retain('core');
    expect(report.failed).toEqual([]);
    expect(loader.get('hero.slash')).toHaveLength(3);
    expect(loader.get('hero.step')).toHaveLength(4);
    expect(loader.get('wide.thing')).toHaveLength(1);
    expect(report.loaded).toBe(loader.stats().groups['core']?.loaded);
    const first = fetched.length;
    await loader.retain('core'); // already in: nothing is fetched again
    expect(fetched).toHaveLength(first);
    expect(loader.isReady('core')).toBe(true);
    // the preferred format is asked for; the other is not unless it fails
    expect(fetched.every((u) => u.endsWith('.opus'))).toBe(true);
  });

  it('counts the memory the decoded sounds take', async () => {
    const { loader } = makeRig();
    expect(loader.bytes).toBe(0);
    await loader.retain('boss');
    // one mono sound of two seconds at 48 kHz, 4 bytes a sample
    expect(loader.bytes).toBe(2 * 48000 * 4);
    expect(loader.stats().groups['boss']?.bytes).toBe(2 * 48000 * 4);
  });

  it('lets a group go a while after the last holder has: a hero who steps back through a door finds it still there', async () => {
    const { loader, timers } = makeRig();
    await loader.retain('music.a');
    await loader.retain('music.a');
    loader.release('music.a');
    expect(timers.pending).toHaveLength(0); // one holder is left
    loader.release('music.a');
    expect(timers.pending).toHaveLength(1);
    expect(timers.pending[0]?.ms).toBe(20_000);
    expect(loader.has('music.a.base')).toBe(true);
    timers.fire();
    expect(loader.has('music.a.base')).toBe(false);
    expect(loader.bytes).toBe(0);
    expect(loader.isReady('music.a')).toBe(false);
  });

  it('keeps a group that is asked for again during the grace period', async () => {
    const { loader, timers, fetched } = makeRig();
    await loader.retain('music.a');
    loader.release('music.a');
    const fetchedBefore = fetched.length;
    await loader.retain('music.a');
    expect(timers.pending).toHaveLength(0); // the countdown was cancelled
    expect(loader.has('music.a.base')).toBe(true);
    expect(fetched).toHaveLength(fetchedBefore);
  });

  it('fetches again a group that was let go', async () => {
    const { loader, timers, fetched } = makeRig();
    await loader.retain('music.b');
    loader.release('music.b');
    timers.fire();
    const n = fetched.length;
    await loader.retain('music.b');
    expect(fetched.length).toBeGreaterThan(n);
    expect(loader.has('music.b.base')).toBe(true);
  });

  it('does not keep a group that was let go while it was still arriving', async () => {
    const { loader } = makeRig();
    const loading = loader.retain('music.a');
    loader.release('music.a'); // nobody wants it any more before it is in
    await loading;
    expect(loader.has('music.a.base')).toBe(false);
    expect(loader.bytes).toBe(0);
  });

  it('two holders asking at once share one load', async () => {
    const { loader, fetched } = makeRig();
    const [a, b] = await Promise.all([loader.retain('boss'), loader.retain('boss')]);
    expect(a).toBe(b);
    expect(fetched).toHaveLength(1);
    expect(loader.stats().groups['boss']?.refs).toBe(2);
  });

  it('never fetches more files at once than it is allowed', async () => {
    const { loader, inFlight } = makeRig({ loader: { concurrency: 3 } });
    await loader.retain('core');
    expect(inFlight.max).toBeGreaterThan(1);
    expect(inFlight.max).toBeLessThanOrEqual(3);
  });

  it('answers a group it does not know with an empty report and does not hold on to it', async () => {
    const { loader } = makeRig();
    const r = await loader.retain('nothing.here');
    expect(r).toEqual({ group: 'nothing.here', sounds: 0, loaded: 0, failed: [] });
    expect(loader.knows('nothing.here')).toBe(false);
    expect(loader.knows('core')).toBe(true);
    expect(() => loader.release('nothing.here')).not.toThrow();
  });
});

describe('SoundLoader: when a file cannot be had', () => {
  it('falls back to the next format and the sound still plays', async () => {
    const { loader, fetched } = makeRig({ failing: ['.opus'] });
    const report = await loader.retain('boss');
    expect(report.failed).toEqual([]);
    expect(loader.has('boss.roar')).toBe(true);
    expect(fetched.some((u) => u.endsWith('.mp3'))).toBe(true);
  });

  it('leaves out a sound whose every file fails, reports it, and loads the rest of the group', async () => {
    const warnings: string[] = [];
    const { loader } = makeRig({ failing: ['hit_'], loader: { warn: (m) => warnings.push(m) } });
    const report = await loader.retain('core');
    expect(loader.has('hit.heavy')).toBe(false);
    expect(loader.get('hit.heavy')).toHaveLength(0);
    expect(loader.has('hero.slash')).toBe(true);
    expect(report.failed.length).toBe(2); // the two variations of the sound
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/hit_1\.opus/);
  });

  it('keeps the variations that did arrive of a sound that lost some', async () => {
    const { loader } = makeRig({ failing: ['slash_2'] });
    await loader.retain('core');
    expect(loader.get('hero.slash')).toHaveLength(2);
  });

  it('does not ask again for a file that just failed, and does after a while', async () => {
    let clock = 0;
    const { loader, timers, fetched } = makeRig({ failing: ['roar'], loader: { now: () => clock, retryAfterMs: 5000 } });
    await loader.retain('boss');
    const first = fetched.filter((u) => u.includes('roar')).length;
    expect(first).toBe(2); // both formats were tried
    loader.release('boss');
    timers.fire();
    clock = 1000;
    await loader.retain('boss');
    expect(fetched.filter((u) => u.includes('roar')).length).toBe(first); // too soon
    loader.release('boss');
    timers.fire();
    clock = 6000;
    await loader.retain('boss');
    expect(fetched.filter((u) => u.includes('roar')).length).toBe(first * 2);
  });

  it('tries the missing files of a group again when it is asked for while it is held (a network that came back)', async () => {
    let clock = 0;
    let broken = true;
    const { loader } = makeRig({ failing: (url) => broken && url.includes('roar'), loader: { now: () => clock, retryAfterMs: 1000 } });
    const first = await loader.retain('boss');
    expect(first.failed).toHaveLength(1);
    expect(loader.has('boss.roar')).toBe(false);
    broken = false;
    clock = 2000;
    const second = await loader.retain('boss');
    expect(second.failed).toEqual([]);
    expect(loader.has('boss.roar')).toBe(true);
  });

  it('gives up on a file that never arrives', async () => {
    const { loader } = makeRig({ loader: { timeoutMs: 20, io: { fetchBytes: (_u, signal) => new Promise((_r, rej) => signal.addEventListener('abort', () => rej(new Error('aborted')))), decode: async () => fakeBuffer(1) } } });
    const t0 = Date.now();
    const report = await loader.retain('boss');
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(report.failed).toHaveLength(1);
    expect(loader.has('boss.roar')).toBe(false);
  });

  it('survives a file that is not audio at all', async () => {
    const { loader } = makeRig({ loader: { io: { fetchBytes: async () => new ArrayBuffer(4), decode: async () => { throw new Error('EncodingError: unable to decode'); } } } });
    const report = await loader.retain('boss');
    expect(report.failed).toHaveLength(1);
    expect(loader.bytes).toBe(0);
  });

  it('does nothing after it has been disposed', async () => {
    const { loader } = makeRig();
    await loader.retain('boss');
    loader.dispose();
    expect(loader.has('boss.roar')).toBe(false);
    const r = await loader.retain('core');
    expect(r.loaded).toBe(0);
  });
});

describe('decodeWith: the two forms of decodeAudioData', () => {
  const buffer = fakeBuffer(1);
  it('works with the promise form', async () => {
    const ctx = { decodeAudioData: () => Promise.resolve(buffer) } as unknown as BaseAudioContext;
    await expect(decodeWith(ctx, new ArrayBuffer(1))).resolves.toBe(buffer);
  });

  it('works with a browser that only has the callbacks', async () => {
    const ctx = { decodeAudioData: (_b: ArrayBuffer, ok: (b: AudioBuffer) => void) => { ok(buffer); } } as unknown as BaseAudioContext;
    await expect(decodeWith(ctx, new ArrayBuffer(1))).resolves.toBe(buffer);
  });

  it('rejects when the audio cannot be decoded, in either form, and when the call throws', async () => {
    const promiseForm = { decodeAudioData: () => Promise.reject(new Error('bad')) } as unknown as BaseAudioContext;
    await expect(decodeWith(promiseForm, new ArrayBuffer(1))).rejects.toThrow('bad');
    const callbackForm = { decodeAudioData: (_b: ArrayBuffer, _ok: unknown, fail: (e: Error) => void) => { fail(new Error('nope')); } } as unknown as BaseAudioContext;
    await expect(decodeWith(callbackForm, new ArrayBuffer(1))).rejects.toThrow('nope');
    const throws = { decodeAudioData: () => { throw new Error('sync'); } } as unknown as BaseAudioContext;
    await expect(decodeWith(throws, new ArrayBuffer(1))).rejects.toThrow('sync');
  });
});
