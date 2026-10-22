import { buf, linToDb, peak, SR, type Buf, type Stereo } from './core';
import { biquad, biquadWith } from './filter';

/**
 * MEASURING A SOUND: the loudness the way broadcasting measures it (ITU-R BS.1770: K-weighted, gated — what a "LUFS" is), the peak, the quiet parts, and whether a loop closes on itself without a jump. The
 * numbers are what lets this repository say a sound is not too loud, a piece of music is not too quiet and a loop has no click — without anyone having to listen to all of it, every time.
 */

/**
 * Weights a channel as the ear does (a shelf of +4 dB above ~1.7 kHz and a high-pass at 38 Hz): the first stage of BS.1770. At 48 kHz — the rate of everything here — they are the coefficients the standard gives, to the
 * digit (a cookbook shelf with the same corner is a quarter of a decibel off at 1 kHz); at another rate they are the cookbook's approximation.
 */
export function kWeight(x: Buf): Buf {
  if (SR === 48000) {
    const shelf = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585] as const;
    const high = [1, -2, 1, -1.99004745483398, 0.99007225036621] as const;
    return biquadWith(biquadWith(x, shelf), high);
  }
  return biquad(biquad(x, 'hs', 1681.974450955533, 0.7071752369554196, 3.999843853973347), 'hp', 38.13547087613982, 0.5003270373253953);
}

const channels = (s: Stereo | Buf): Buf[] => (s instanceof Float32Array ? [s] : [s.l, s.r]);

/** Mean square of each 400 ms block (a block every 100 ms), summed over the channels, after K-weighting. */
function blocks(s: Stereo | Buf): number[] {
  const w = channels(s).map(kWeight);
  const size = Math.round(0.4 * SR);
  const hop = Math.round(0.1 * SR);
  const out: number[] = [];
  const n = (w[0] as Buf).length;
  for (let start = 0; start + size <= n; start += hop) {
    let z = 0;
    for (const c of w) {
      let sum = 0;
      for (let i = start; i < start + size; i++) sum += (c[i] as number) ** 2;
      z += sum / size;
    }
    out.push(z);
  }
  return out;
}

const lufsOf = (z: number): number => -0.691 + 10 * Math.log10(Math.max(z, 1e-12));

/** The integrated loudness (LUFS) of something at least 400 ms long: what the whole of it sounds like, ignoring the silences. */
export function integratedLufs(s: Stereo | Buf): number {
  const z = blocks(s);
  const absolute = z.filter((v) => lufsOf(v) > -70);
  if (absolute.length === 0) return -Infinity;
  const mean = absolute.reduce((a, b) => a + b, 0) / absolute.length;
  const gate = lufsOf(mean) - 10;
  const kept = absolute.filter((v) => lufsOf(v) > gate);
  if (kept.length === 0) return -Infinity;
  return lufsOf(kept.reduce((a, b) => a + b, 0) / kept.length);
}

/** The loudest 400 ms of a sound (LUFS), as if it were padded with silence to 400 ms when it is shorter: the loudness of a short sound for comparing one with another. */
export function momentaryLufs(s: Stereo | Buf): number {
  const w = channels(s).map(kWeight);
  const size = Math.round(0.4 * SR);
  const n = Math.max((w[0] as Buf).length, size);
  const hop = Math.round(0.05 * SR);
  let best = 0;
  for (let start = 0; start + size <= n + hop; start += hop) {
    let z = 0;
    for (const c of w) {
      let sum = 0;
      const end = Math.min(c.length, start + size);
      for (let i = start; i < end; i++) sum += (c[i] as number) ** 2;
      z += sum / size;
    }
    if (z > best) best = z;
  }
  return lufsOf(best);
}

/** The highest peak of the sound, in dBFS. */
export const peakDb = (s: Stereo | Buf): number => linToDb(Math.max(...channels(s).map(peak)));

/** The true peak (what the peak will be once the sound is converted back to analogue or decoded and resampled): the largest of the samples and of the points between them, found with 4× oversampling, in dBFS. */
export function truePeakDb(s: Stereo | Buf): number {
  let best = 0;
  // a windowed-sinc interpolation at the three points between each pair of samples
  const taps = 12;
  const phases = [0.25, 0.5, 0.75];
  const kernels = phases.map((p) => {
    const k = new Float64Array(taps * 2);
    for (let j = 0; j < taps * 2; j++) {
      const x = j - taps + 1 - p;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / taps);
      k[j] = sinc * win;
    }
    return k;
  });
  for (const c of channels(s)) {
    best = Math.max(best, peak(c));
    for (let i = taps; i < c.length - taps; i += 1) {
      const v = c[i] as number;
      if (Math.abs(v) < best * 0.5 && Math.abs(c[i + 1] as number) < best * 0.5) continue; // cannot beat the best so far
      for (const k of kernels) {
        let sum = 0;
        for (let j = 0; j < taps * 2; j++) sum += (c[i - taps + 1 + j] as number) * (k[j] as number);
        if (Math.abs(sum) > best) best = Math.abs(sum);
      }
    }
  }
  return linToDb(best);
}

/** The RMS level over the part of the sound that is not silent (above −50 dB of its own peak), in dBFS. */
export function activeRmsDb(s: Stereo | Buf): number {
  const cs = channels(s);
  const p = Math.max(...cs.map(peak));
  const floor = p * 10 ** (-50 / 20);
  let sum = 0;
  let count = 0;
  for (const c of cs) {
    for (let i = 0; i < c.length; i++) {
      if (Math.abs(c[i] as number) > floor) {
        sum += (c[i] as number) ** 2;
        count++;
      }
    }
  }
  return linToDb(Math.sqrt(sum / Math.max(1, count)));
}

/** Where the sound is silent: the longest stretch (ms) below −60 dBFS in frames of 5 ms, and the share of the sound that is below it. */
export function silence(s: Stereo | Buf, thresholdDb = -60): { longestMs: number; share: number } {
  const cs = channels(s);
  const frame = Math.round(0.005 * SR);
  const n = (cs[0] as Buf).length;
  const limit = 10 ** (thresholdDb / 20);
  let quiet = 0;
  let longest = 0;
  let run = 0;
  const frames = Math.floor(n / frame);
  for (let f = 0; f < frames; f++) {
    let m = 0;
    for (const c of cs) {
      for (let i = f * frame; i < (f + 1) * frame; i++) m = Math.max(m, Math.abs(c[i] as number));
    }
    if (m < limit) {
      quiet++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  return { longestMs: longest * 5, share: quiet / Math.max(1, frames) };
}

/**
 * Whether a loop closes on itself. When it plays round, the last sample is followed by the first: if they are far apart compared with how far neighbouring samples are from each other, there is a click. The score is
 * the size of that step over the 95th percentile of the steps within 2048 samples of the seam (1 or less is a seam like any other place in the sound; more than ~4 is an event that is only there). `levelDb` is how loud the last 50 ms is against the first 50 ms (a loop that begins quieter than it ends,
 * or the reverse, "breathes" at the seam). `jumpDb` is the size of the step itself, in dBFS: a step that is large against a quiet neighbourhood but is 60 dB below full scale (an onset that falls on the seam) cannot be heard.
 */
export function loopSeam(s: Stereo | Buf): { step: number; levelDb: number; jumpDb: number } {
  const cs = channels(s);
  let worst = 0;
  let level = 0;
  let jumpAbs = 0;
  for (const c of cs) {
    const n = c.length;
    // what a step usually is near the seam: the 95th percentile of the steps of the 2048 samples on each side of it (the seam's own step is left out)
    const span = Math.min(2048, Math.floor(n / 4));
    const steps: number[] = [];
    for (let i = 1; i < span; i++) {
      steps.push(Math.abs((c[i] as number) - (c[i - 1] as number)));
      steps.push(Math.abs((c[n - i] as number) - (c[n - i - 1] as number)));
    }
    steps.sort((a, b) => a - b);
    const typical = steps[Math.floor(steps.length * 0.95)] ?? 0;
    const jump = Math.abs((c[0] as number) - (c[n - 1] as number));
    jumpAbs = Math.max(jumpAbs, jump);
    worst = Math.max(worst, jump / Math.max(typical, 1e-7));
    const w = Math.round(0.05 * SR);
    const head = Math.sqrt(c.subarray(0, w).reduce((a, v) => a + v * v, 0) / w);
    const tail = Math.sqrt(c.subarray(n - w).reduce((a, v) => a + v * v, 0) / w);
    level = Math.max(level, Math.abs(linToDb(head + 1e-9) - linToDb(tail + 1e-9)));
  }
  return { step: worst, levelDb: level, jumpDb: linToDb(jumpAbs) };
}

/** The "brightness" of a sound: the frequency (Hz) at which its energy is centred. A shrill, tiring sound has a high one. Found from a handful of windows with a plain DFT, which is enough to compare one sound with another. */
export function spectralCentroid(b: Buf): number {
  const size = 1024;
  const hop = Math.max(size, Math.floor(b.length / 24));
  let num = 0;
  let den = 0;
  const win = buf(size);
  const cos = new Float64Array(size);
  const sin = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  for (let start = 0; start + size <= b.length; start += hop) {
    for (let k = 1; k < size / 2; k++) {
      let r = 0;
      let im = 0;
      for (let i = 0; i < size; i++) {
        const a = (2 * Math.PI * ((k * i) % size)) / size;
        cos[i] = Math.cos(a);
        sin[i] = Math.sin(a);
        const v = (b[start + i] as number) * (win[i] as number);
        r += v * (cos[i] as number);
        im -= v * (sin[i] as number);
      }
      const mag = r * r + im * im;
      num += mag * ((k * SR) / size);
      den += mag;
    }
  }
  return den > 0 ? num / den : 0;
}

/** The octave bands the profile is given in: centre frequency (Hz). */
export const OCTAVES = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** An in-place radix-2 FFT of `re` + i·`im` (their length is a power of two). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = (re[b] as number) * cr - (im[b] as number) * ci;
        const ti = (re[b] as number) * ci + (im[b] as number) * cr;
        re[b] = (re[a] as number) - tr;
        im[b] = (im[a] as number) - ti;
        re[a] = (re[a] as number) + tr;
        im[a] = (im[a] as number) + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * How the energy of a sound is spread over the octaves, in dB below the loudest octave (0 is the loudest): the average power spectrum of the whole sound (Hann windows of 8192 samples, half overlapping) summed in each
 * octave band. It says where a sound's weight is and whether it is bright, thin or muddy — what a spectrogram shows by eye, as numbers a check can read.
 */
export function bandProfile(s: Stereo | Buf): number[] {
  const size = 8192;
  const mono = 'l' in s ? Float32Array.from(s.l, (v, i) => (v + (s.r[i] as number)) / 2) : s;
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const power = new Float64Array(size / 2);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start + size <= mono.length; start += size / 2) {
    for (let i = 0; i < size; i++) {
      re[i] = (mono[start + i] as number) * (win[i] as number);
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) power[k] = (power[k] as number) + (re[k] as number) ** 2 + (im[k] as number) ** 2;
  }
  const bands = OCTAVES.map((c) => {
    const lo = c / Math.SQRT2;
    const hi = c * Math.SQRT2;
    let sum = 0;
    for (let k = 1; k < size / 2; k++) {
      const f = (k * SR) / size;
      if (f >= lo && f < hi) sum += power[k] as number;
    }
    return sum;
  });
  const max = Math.max(...bands, 1e-30);
  return bands.map((b) => Math.round(10 * Math.log10(Math.max(b, 1e-30) / max) * 10) / 10);
}
