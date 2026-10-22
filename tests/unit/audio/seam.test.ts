import { describe, expect, it } from 'vitest';
import { BRIDGE_GAP_SECONDS, BRIDGE_TREND_SECONDS, healBuffer, healLoop, SEAM_LIMITS, seamCloses, seamMetric } from '@/audio/seam';
import { SoundLoader } from '@/audio/loader';
import { loopSeam } from '../../../tools/audio/dsp/measure';
import { SEAM } from '../../../tools/audio/check';
import { makeIndex, sound } from '../../helpers/audioRig';
import { FakeBuffer } from '../../helpers/fakeAudio';

/**
 * THE SEAM OF A LOOP (docs/PROMPT18-LOG.md): a codec codes the two ends of a file apart, so a loop whose rendered seam is clean comes out of a decoder with a step at it (measured in a real browser: thirty decibels more on
 * an Opus bed) and a burst of jitter in its first and last samples. The loader closes the seam again once the file is decoded; these tests are the maths of that, and what the loader does with it.
 */
const RATE = 48000;

/** A smooth, slow signal that is exactly periodic over `n` samples (a few hum partials and a drift), like a bed of ambience. */
function hum(n: number, amp = 0.1): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    x[i] = amp * (0.6 * Math.sin(t * 3) + 0.3 * Math.sin(t * 7 + 1) + 0.1 * Math.sin(t * 19 + 2));
  }
  return x;
}

/** What a codec leaves: a floor of noise all through, the ends no longer meeting (a level apart) and the first and last few samples noisier still. */
function coded(n: number, mismatch: number, jitter: number, seed = 1): Float32Array {
  const x = hum(n);
  let s = seed;
  const rnd = (): number => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let i = 0; i < n; i++) x[i] += 0.0008 * rnd() + (i < n / 2 ? mismatch / 2 : -mismatch / 2) * Math.exp(-Math.min(i, n - 1 - i) / 4000);
  for (let i = 0; i < 10; i++) {
    x[i] += jitter * rnd() * (1 - i / 10);
    x[n - 1 - i] += jitter * rnd() * (1 - i / 10);
  }
  return x;
}

/** The largest difference between two renderings of the same loop. */
const farthest = (a: Float32Array, b: Float32Array): number => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
};

const maxStep = (x: Float32Array, from: number, to: number): number => {
  let m = 0;
  for (let i = Math.max(1, from); i < Math.min(x.length, to); i++) m = Math.max(m, Math.abs(x[i]! - x[i - 1]!));
  return m;
};

describe('the measure of a seam', () => {
  it('is, step for step, the measure the production tool judges the rendered loops by', () => {
    const n = 30_000;
    const cases: Float32Array[] = [hum(n), coded(n, 0.02, 0.02), coded(n, -0.03, 0.004, 7), new Float32Array(n)];
    const noise = new Float32Array(n);
    let s = 99;
    for (let i = 0; i < n; i++) noise[i] = (((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1) * 0.2;
    cases.push(noise);
    for (const c of cases) {
      const mine = seamMetric([c]);
      const theirs = loopSeam(c);
      expect(mine.step).toBeCloseTo(theirs.step, 9);
      expect(mine.jumpDb).toBeCloseTo(theirs.jumpDb, 9);
    }
    // two channels: the worse of them
    const a = hum(n);
    const b = coded(n, 0.03, 0.01);
    const both = loopSeam({ l: a, r: b });
    const mine = seamMetric([a, b]);
    expect(mine.step).toBeCloseTo(both.step, 9);
    expect(mine.jumpDb).toBeCloseTo(both.jumpDb, 9);
  });

  it('holds a loop to the same rule in the studio and in the browser', () => {
    expect(SEAM).toEqual(SEAM_LIMITS);
    expect(seamCloses({ step: 4, jumpDb: -20 })).toBe(true);
    expect(seamCloses({ step: 5, jumpDb: -44 })).toBe(false);
    expect(seamCloses({ step: 5, jumpDb: -46 })).toBe(true);
    expect(seamCloses({ step: 40, jumpDb: -30 })).toBe(false);
  });

  it('reads a clean periodic loop as closed and a coded one as open', () => {
    const n = 120_000;
    expect(seamCloses(seamMetric([hum(n)]))).toBe(true);
    const open = seamMetric([coded(n, 0.02, 0.02)]);
    expect(open.step).toBeGreaterThan(SEAM_LIMITS.step);
    expect(seamCloses(open)).toBe(false);
  });
});

describe('closing a seam', () => {
  const n = 120_000; // 2.5 s: a bed is twelve, a piece forty

  it('turns a seam a codec opened into one that is closed: the step across it is no more than the signal\'s own', () => {
    for (const [mismatch, jitter] of [[0.02, 0.02], [-0.03, 0.01], [0.05, 0.002], [0.012, 0.05]] as const) {
      const x = coded(n, mismatch, jitter);
      const before = seamMetric([x]);
      healLoop([x], RATE);
      const after = seamMetric([x]);
      expect(seamCloses(before), `before (${mismatch}, ${jitter}) the seam stands out`).toBe(false);
      expect(seamCloses(after), `after (${mismatch}, ${jitter}) it is closed`).toBe(true);
      expect(after.step, `and a good deal under the limit: ${after.step.toFixed(2)}`).toBeLessThan(1.5);
      expect(after.jumpDb).toBeLessThan(before.jumpDb - 10);
    }
  });

  it('touches nothing but the samples round the seam — the rest of the loop is bit for bit what was decoded', () => {
    const x = coded(n, 0.01, 0.02);
    const was = Float32Array.from(x);
    healLoop([x], RATE);
    const gap = Math.round(RATE * BRIDGE_GAP_SECONDS);
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const inside = i < gap || i >= n - gap;
      if (x[i] !== was[i]) {
        changed++;
        expect(inside, `sample ${i} changed outside the stretch round the seam`).toBe(true);
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(2 * gap);
    // half a millisecond each side: a thousandth of a second of a loop of tens of seconds
    expect(2 * gap / RATE).toBeLessThanOrEqual(0.0011);
  });

  it('draws the stretch as a smooth curve: no step across it bigger than the signal takes anywhere else', () => {
    const x = coded(n, 0.03, 0.03);
    const elsewhere = maxStep(x, 5000, n - 5000);
    healLoop([x], RATE);
    const gap = Math.round(RATE * BRIDGE_GAP_SECONDS);
    const trend = Math.round(RATE * BRIDGE_TREND_SECONDS);
    const round = new Float32Array(2 * (gap + trend));
    round.set(x.subarray(n - gap - trend), 0);
    round.set(x.subarray(0, gap + trend), gap + trend);
    expect(maxStep(round, 0, round.length)).toBeLessThanOrEqual(elsewhere * 1.5);
    expect(Math.abs(x[0]! - x[n - 1]!)).toBeLessThan(elsewhere);
  });

  it('is the same when it is done twice: what it drew is on the curve it would draw again', () => {
    const x = coded(n, 0.01, 0.02);
    healLoop([x], RATE);
    const once = Float32Array.from(x);
    healLoop([x], RATE);
    expect(farthest(x, once)).toBeLessThan(1e-6);
  });

  it('leaves a constant constant, silence silent, and a loop that was already closed as good as it was', () => {
    const flat = new Float32Array(n).fill(0.25);
    healLoop([flat], RATE);
    expect(Math.max(...flat.subarray(0, 100))).toBeCloseTo(0.25, 6);
    expect(Math.min(...flat.subarray(n - 100))).toBeCloseTo(0.25, 6);
    const quiet = new Float32Array(n);
    healLoop([quiet], RATE);
    expect(quiet.every((v) => v === 0)).toBe(true);
    const clean = hum(n);
    const was = Float32Array.from(clean);
    healLoop([clean], RATE);
    expect(farthest(clean, was), 'a clean loop moves by less than a ten-thousandth of full scale').toBeLessThan(1e-4);
    expect(seamCloses(seamMetric([clean]))).toBe(true);
  });

  it('mends each channel on its own', () => {
    const l = coded(n, 0.02, 0.01, 3);
    const r = coded(n, -0.01, 0.03, 5);
    healBuffer({ numberOfChannels: 2, sampleRate: RATE, getChannelData: (c) => (c === 0 ? l : r) });
    expect(seamCloses(seamMetric([l]))).toBe(true);
    expect(seamCloses(seamMetric([r]))).toBe(true);
  });

  it('does not touch what is too short to be a loop of its own', () => {
    const tiny = coded(300, 0.05, 0.05);
    const was = Float32Array.from(tiny);
    healLoop([tiny], RATE);
    expect(Array.from(tiny)).toEqual(Array.from(was));
  });

  it('reports the seam before and after', () => {
    const x = coded(n, 0.012, 0.02);
    const report = healBuffer({ numberOfChannels: 1, sampleRate: RATE, getChannelData: () => x });
    expect(seamCloses(report.before)).toBe(false);
    expect(seamCloses(report.after)).toBe(true);
    expect(report.after.step).toBeLessThan(report.before.step);
  });
});

describe('the loader and the seams', () => {
  /** A manifest with a short loop and a short effect, and a decoder that gives each the samples of a coded file. */
  function rig(options: { heal?: undefined | null; failHeal?: boolean } = {}) {
    const frames = 96_000;
    const index = makeIndex();
    index.sounds = {
      'bed.x.base': sound({ name: 'bed_x', group: 'amb.x', bus: 'ambience', channels: 2, seconds: 2, voices: 1, loop: { start: 0, end: 2 } }),
      'hero.hit': sound({ name: 'hit', seconds: 2 }),
    };
    index.tracks = {};
    const decoded: FakeBuffer[] = [];
    const warnings: string[] = [];
    const loader = new SoundLoader({
      index,
      baseUrl: 'https://t.test/audio/index.json',
      formats: ['opus'],
      warn: (m) => void warnings.push(m),
      ...(options.failHeal ? { heal: () => { throw new Error('boom'); } } : options.heal === null ? { heal: null } : {}),
      io: {
        fetchBytes: async () => new ArrayBuffer(8),
        decode: async () => {
          const b = new FakeBuffer(2, frames, RATE);
          b.copyToChannel(coded(frames, 0.01, 0.02, 11), 0);
          b.copyToChannel(coded(frames, -0.008, 0.03, 13), 1);
          decoded.push(b);
          return b as unknown as AudioBuffer;
        },
      },
    });
    return { loader, decoded, warnings };
  }

  const seamOf = (b: FakeBuffer) => seamMetric([b.getChannelData(0), b.getChannelData(1)]);

  it('closes the seam of a loop when it decodes it — and only of a loop', async () => {
    const { loader, decoded } = rig();
    await loader.retain('amb.x');
    await loader.retain('core');
    expect(decoded).toHaveLength(2);
    const [bed, effect] = decoded as [FakeBuffer, FakeBuffer];
    expect(seamCloses(seamOf(bed)), 'the loop closes').toBe(true);
    expect(seamCloses(seamOf(effect)), 'the effect is left as the codec made it: it has no seam').toBe(false);
  });

  it('says what it found: the seam as the codec left it and as it came to', async () => {
    const { loader } = rig();
    expect(loader.stats().seams).toEqual({});
    await loader.retain('amb.x');
    await loader.retain('core');
    const seams = loader.stats().seams;
    expect(Object.keys(seams)).toEqual(['bed.x.base']);
    const report = seams['bed.x.base']!;
    expect(seamCloses(report.before)).toBe(false);
    expect(seamCloses(report.after)).toBe(true);
  });

  it('keeps the report after the group has been let go, and makes a new one when it is decoded again', async () => {
    const { loader, decoded } = rig();
    await loader.retain('amb.x');
    loader.release('amb.x');
    expect(Object.keys(loader.stats().seams)).toEqual(['bed.x.base']);
    await loader.retain('amb.x');
    expect(decoded).toHaveLength(1); // (still in memory: the grace period has not passed)
  });

  it('can be told to leave the loops as they are', async () => {
    const { loader, decoded } = rig({ heal: null });
    await loader.retain('amb.x');
    expect(seamCloses(seamOf(decoded[0]!))).toBe(false);
    expect(loader.stats().seams).toEqual({});
  });

  it('never fails a load because a seam could not be mended: the loop plays as it came, and the reason is said', async () => {
    const { loader, warnings } = rig({ failHeal: true });
    const report = await loader.retain('amb.x');
    expect(report.failed).toEqual([]);
    expect(report.loaded).toBe(1);
    expect(loader.has('bed.x.base')).toBe(true);
    expect(warnings.some((w) => w.includes('bed.x.base') && w.includes('boom'))).toBe(true);
  });
});
