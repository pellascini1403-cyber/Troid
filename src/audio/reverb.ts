/**
 * THE ROOM'S ECHO (docs/PROMPT18-LOG.md): the same sword is heard differently in a root gallery than in a stone sanctum. The engine sends a part of every sound to a reverberation whose impulse response is MADE HERE, from
 * a few numbers per room — how long the tail lasts, how fast the air eats the high end, how long before the first reflections — so that no file has to be shipped, fetched or decoded for it.
 *
 * Pure: `renderImpulse` is a function of the room and a random source, and the same ones give the same impulse.
 */
export interface RoomSpec {
  /** How long the tail takes to fall 60 dB (seconds). */
  rt60: number;
  /** 0 … 1: how quickly the high end dies in the tail (1: a heavy, dull room; 0: a bright one). */
  damp: number;
  /** Time before the first reflection (ms). */
  predelayMs: number;
  /** 0 … 1: how much of the reverberation joins the sound. */
  wet: number;
}

/** A place with no echo of its own: a playground, a room that comes later. */
export const DRY_ROOM: RoomSpec = { rt60: 0.9, damp: 0.6, predelayMs: 8, wet: 0.5 };

/** The longest an impulse is made (seconds): beyond it the tail is below hearing anyway and the cost of the convolution grows with the length. */
export const MAX_TAIL_SECONDS = 2.8;

/**
 * Two channels of impulse response. Early reflections (a handful of taps in the first 90 ms) give the room its size; the tail is noise under an exponential envelope whose high end is rolled off more and more as it
 * goes (a one-pole low-pass that closes), which is how a real room sounds; the whole is scaled to unit energy so that `wet` means the same in every room.
 */
export function renderImpulse(spec: RoomSpec, sampleRate: number, rnd: () => number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const rt60 = Math.min(MAX_TAIL_SECONDS, Math.max(0.15, spec.rt60));
  const length = Math.max(64, Math.round(rt60 * 1.15 * sampleRate));
  const pre = Math.min(length >> 2, Math.max(0, Math.round((spec.predelayMs / 1000) * sampleRate)));
  const out: Array<Float32Array<ArrayBuffer>> = [new Float32Array(length), new Float32Array(length)];
  const damp = Math.min(1, Math.max(0, spec.damp));
  for (let ch = 0; ch < 2; ch++) {
    const h = out[ch] as Float32Array<ArrayBuffer>;
    let lp = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      const env = 10 ** ((-3 * t) / rt60);
      // the cut-off falls from where the room starts (bright 12 kHz … dull 6 kHz) toward a floor (3.5 kHz … 0.9 kHz) as the tail goes on
      const floor = 3500 - 2600 * damp;
      const fc = floor + (12000 - 6000 * damp - floor) * Math.exp(-t / (rt60 * 0.3));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
      lp += a * ((rnd() * 2 - 1) - lp);
      const fade = Math.min(1, (i - pre) / (0.004 * sampleRate)); // no click at the start of the tail
      h[i] = lp * env * fade;
    }
    // the early reflections: a few taps, each fainter and later than the one before, different in each ear
    const taps = 7;
    for (let k = 0; k < taps; k++) {
      const at = pre + Math.round((0.006 + (k + 0.4 + rnd() * 0.6) * 0.011 * (0.6 + rt60 * 0.5)) * sampleRate);
      if (at < length) h[at] = (h[at] as number) + (rnd() < 0.5 ? -1 : 1) * 0.55 * 0.78 ** k;
    }
  }
  // unit energy, so that a room's `wet` is its level whatever its length
  let energy = 0;
  for (const h of out) for (let i = 0; i < h.length; i++) energy += (h[i] as number) ** 2;
  const k = 1 / Math.sqrt(Math.max(1e-12, energy / 2));
  for (const h of out) for (let i = 0; i < h.length; i++) h[i] = (h[i] as number) * k;
  return [out[0] as Float32Array<ArrayBuffer>, out[1] as Float32Array<ArrayBuffer>];
}
