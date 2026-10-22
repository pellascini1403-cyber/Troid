/**
 * THE SEAM OF A LOOP (docs/PROMPT18-LOG.md): a piece of music or a bed of ambience is played round and round, and the one place where it can be heard to be a loop is the point where its last sample meets its first. The pieces
 * are rendered so that the seam is closed (the build measures it, and refuses a loop that is not), but the files the game ships are LOSSY, and a codec codes the start and the end of a file apart from one another: it
 * leaves a burst of noise in the first and the last few samples, and the slow part of the two ends no longer meets. Measured in a real browser, the Opus copy of a bed whose rendered seam is clean (a step of −69 dBFS)
 * came out with a step of −38 dBFS across the seam — thirty decibels more, a tick once every twelve seconds — and ten samples of jitter ten times the size of any other in the file.
 *
 * So the seam is closed AGAIN once the file is decoded, whatever codec it came through, the way a declicker mends a click: the samples right around the seam (half a millisecond each side) are thrown away and drawn anew as a
 * smooth curve (a cubic) from the trend of the signal before the seam to the trend of the signal after it. What is lost is a thousandth of a second of the finest detail, once a loop; what is gained is a seam that is
 * no step at all.
 *
 * PURE: samples in, samples out. Nothing here knows about a browser, a buffer node or a context.
 */

/** Half the stretch that is drawn anew (seconds): the samples each side of the seam. Long enough to hold the codec's burst, short enough never to be a change that is heard. */
export const BRIDGE_GAP_SECONDS = 0.0005;
/** How much of the signal on each side is looked at to find where it was going (seconds). */
export const BRIDGE_TREND_SECONDS = 0.001;

export interface SeamMetric {
  /** The step across the seam, in units of the 95th percentile of the steps of the 2048 samples on each side of it (the seam's own step left out). Under 4 the seam is no more than the signal's own roughness. */
  step: number;
  /** The step across the seam, in dBFS. */
  jumpDb: number;
}

export interface SeamReport {
  before: SeamMetric;
  after: SeamMetric;
}

/** A seam closes if its step is within this many of the neighbourhood's steps, or is lower than this (dBFS) — the same rule `tools/audio/check.ts` judges the rendered loops by. */
export const SEAM_LIMITS = { step: 4, jumpDb: -45 } as const;

export const seamCloses = (m: SeamMetric): boolean => m.step <= SEAM_LIMITS.step || m.jumpDb <= SEAM_LIMITS.jumpDb;

/**
 * How much a loop's seam stands out. Equal, step for step of the maths, to `loopSeam` of the production tool (tools/audio/dsp/measure.ts): a test keeps the two together, because the claim "the loops close" is the same
 * claim in the studio and in the player's browser.
 */
export function seamMetric(channels: ReadonlyArray<ArrayLike<number>>): SeamMetric {
  let worst = 0;
  let jumpAbs = 0;
  for (const c of channels) {
    const n = c.length;
    if (n < 8) continue;
    const span = Math.min(2048, Math.floor(n / 4));
    const steps: number[] = [];
    for (let i = 1; i < span; i++) {
      steps.push(Math.abs(c[i] - c[i - 1]));
      steps.push(Math.abs(c[n - i] - c[n - i - 1]));
    }
    steps.sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length * 0.95)] ?? 0;
    const jump = Math.abs(c[0] - c[n - 1]);
    jumpAbs = Math.max(jumpAbs, jump);
    worst = Math.max(worst, jump / Math.max(typical, 1e-7));
  }
  return { step: worst, jumpDb: 20 * Math.log10(Math.max(jumpAbs, 1e-12)) };
}

/** The straight line that best fits `count` samples of a loop from position `from` (positions are taken round the loop): its value at the sample `at` (0-based within the run) and its slope per sample. */
function trendOf(c: Float32Array, from: number, count: number, at: number): { value: number; slope: number } {
  const n = c.length;
  const mean = (count - 1) / 2;
  let sum = 0;
  for (let t = 0; t < count; t++) sum += c[(from + t + n) % n];
  const average = sum / count;
  let num = 0;
  let den = 0;
  for (let t = 0; t < count; t++) {
    num += (t - mean) * (c[(from + t + n) % n] - average);
    den += (t - mean) * (t - mean);
  }
  const slope = den > 0 ? num / den : 0;
  return { value: average + slope * (at - mean), slope };
}

/**
 * Closes the seam of a loop, in place: for each channel, the samples around the seam are replaced by a cubic curve that leaves the trend of the signal before it (its value and its slope) and arrives at the trend of
 * the signal after it. A channel too short to have a seam of its own (a click, not a loop) is not touched.
 */
export function healLoop(channels: ReadonlyArray<Float32Array>, sampleRate: number): void {
  const gap = Math.max(4, Math.round(sampleRate * BRIDGE_GAP_SECONDS));
  const trend = Math.max(8, Math.round(sampleRate * BRIDGE_TREND_SECONDS));
  for (const c of channels) {
    const n = c.length;
    if (n < 8 * (gap + trend)) continue;
    // positions are counted from the seam: −1 is the last sample of the file, 0 the first. The samples −gap … gap−1 are the ones drawn anew; the line before the seam is fitted to the `trend` samples that end
    // just before them, and the one after to the `trend` samples that start just after
    const before = trendOf(c, -gap - trend, trend, trend - 1);
    const after = trendOf(c, gap, trend, 0);
    const span = 2 * gap + 1;
    for (let s = -gap; s < gap; s++) {
      const u = (s + gap + 1) / span;
      const u2 = u * u;
      const u3 = u2 * u;
      c[(s + n) % n] =
        (2 * u3 - 3 * u2 + 1) * before.value + (u3 - 2 * u2 + u) * span * before.slope + (-2 * u3 + 3 * u2) * after.value + (u3 - u2) * span * after.slope;
    }
  }
}

/** The part of a decoded buffer the healing reads and writes (an `AudioBuffer` has all of it). */
export interface LoopSamples {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Measures the seam of a decoded loop, closes it, and measures it again. */
export function healBuffer(buffer: LoopSamples): SeamReport {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const before = seamMetric(channels);
  healLoop(channels, buffer.sampleRate);
  return { before, after: seamMetric(channels) };
}
