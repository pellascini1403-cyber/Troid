import { clamp, clamp01 } from '@/core/math';
import type { Pt } from './geometry';

/**
 * The motion of the rigs (docs/PROMPT24-LOG.md): small pure helpers a species composes its animation from. None of them touches the simulation or consumes its random numbers — this is the view, and it may be as
 * lively as it likes without a tick of the game ever knowing.
 */

export const TAU = Math.PI * 2;

/** A seed in [0, 1) from any string (the id of an entity): the same creature always gets the same one, and no random number of the simulation is used. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** `0 → 1 → 0` over [a, b]: a smooth bump (sine). */
export function bump(x: number, a: number, b: number): number {
  const t = clamp01((x - a) / (b - a));
  return Math.sin(t * Math.PI);
}

/** 0 before `a`, 1 after `b`, smooth between. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export const easeIn = (t: number): number => t * t;
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
/** Overshoots and settles: the snap of a spring that was let go. */
export function easeOutBack(t: number, k = 1.70158): number {
  const u = t - 1;
  return 1 + (k + 1) * u * u * u + k * u * u;
}

/** A smooth, repeating, never quite periodic wobble in [−1, 1] (two sines of unrelated frequency). */
export function wobble(t: number, hz = 1, seed = 0): number {
  return 0.62 * Math.sin(t * TAU * hz + seed * 17.3) + 0.38 * Math.sin(t * TAU * hz * 2.37 + seed * 5.1 + 1.3);
}

/** A damped spring that follows a target: secondary motion (a tail, a crest, a hanging veil) that lags and overshoots by itself. */
export class Spring {
  x: number;
  v = 0;
  constructor(
    start = 0,
    /** Stiffness (1/s²). */
    private readonly k = 90,
    /** Damping (1/s): about 2·√k is critical. */
    private readonly c = 11,
  ) {
    this.x = start;
  }
  step(target: number, dt: number): number {
    if (dt <= 0) return this.x;
    // sub-steps keep a stiff spring stable on a slow frame
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += ((target - this.x) * this.k - this.v * this.c) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  set(x: number): void {
    this.x = x;
    this.v = 0;
  }
}

/** The two angles (counter-clockwise from +x) of a limb of two bones `l1`, `l2` that reaches for `(tx, ty)` from its root at the origin; it stretches (and stops at full reach) when the target is too far. `bend` is the side the middle joint pops out to. */
export function ik2(l1: number, l2: number, tx: number, ty: number, bend: 1 | -1 = 1): { a1: number; a2: number; reach: number } {
  const d = Math.max(0.0001, Math.hypot(tx, ty));
  const reach = Math.min(d, l1 + l2 - 0.001);
  const base = Math.atan2(ty, tx);
  const cosA = clamp((l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach), -1, 1);
  const a1 = base + bend * Math.acos(cosA);
  const kx = Math.cos(a1) * l1;
  const ky = Math.sin(a1) * l1;
  const a2 = Math.atan2(ty - ky, tx - kx);
  return { a1, a2, reach };
}

/**
 * The cycle of a step: where a foot is while the body walks. `phase` ∈ [0, 1): the first `stance` of it the foot is on the ground (it slides back at the speed of the body), the rest of it the foot swings forward
 * in an arc `lift` high. Returns the foot's offset from its rest position.
 */
export function footCycle(phase: number, stride: number, lift: number, stance = 0.6): { x: number; y: number } {
  const p = ((phase % 1) + 1) % 1;
  if (p < stance) {
    const t = p / stance;
    return { x: stride * (0.5 - t), y: 0 };
  }
  const t = (p - stance) / (1 - stance);
  return { x: stride * (t - 0.5), y: Math.sin(t * Math.PI) * lift };
}

/**
 * A chain of points that trails behind its root: every point is one segment from the one before it, and turns toward where it was only a little at a time — so it keeps its length exactly and drags behind with some give.
 * For tails, tentacles and trains of cloth. Call `follow(rootX, rootY, dt)` once a frame, then read `pts`. `drag` ∈ [0, 1): how much of the old direction each segment keeps per frame at 60 Hz.
 */
export class Chain {
  readonly pts: Pt[];
  private readonly px: number[];
  private readonly py: number[];
  private readonly ang: number[];
  constructor(
    readonly n: number,
    private readonly seg: number,
    private readonly drag = 0.72,
    x = 0,
    y = 0,
  ) {
    this.px = Array.from({ length: n }, (_, i) => x - i * seg);
    this.py = Array.from({ length: n }, () => y);
    this.ang = Array.from({ length: n }, () => Math.PI);
    this.pts = this.px.map((px, i) => [px, this.py[i]!] as Pt);
  }
  /** Moves the root to `(x, y)` and lets the rest follow; `gx, gy` is a constant pull (gravity, a current) in cm/s². */
  follow(x: number, y: number, dt: number, gx = 0, gy = 0): void {
    const k = Math.pow(this.drag, dt * 60);
    this.px[0] = x;
    this.py[0] = y;
    for (let i = 1; i < this.n; i++) {
      // where this point would be if it simply hung from the one before it, and the pull on it
      let dx = this.px[i]! - this.px[i - 1]! + gx * dt * dt * i * 0.5;
      let dy = this.py[i]! - this.py[i - 1]! + gy * dt * dt * i * 0.5;
      if (dx === 0 && dy === 0) dx = -1;
      const want = Math.atan2(dy, dx);
      // turn toward it along the short way round
      let d = want - this.ang[i]!;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ang[i] = this.ang[i]! + d * (1 - k);
      this.px[i] = this.px[i - 1]! + Math.cos(this.ang[i]!) * this.seg;
      this.py[i] = this.py[i - 1]! + Math.sin(this.ang[i]!) * this.seg;
    }
    for (let i = 0; i < this.n; i++) this.pts[i] = [this.px[i]!, this.py[i]!];
  }
}

/**
 * The points of a tentacle: from `root`, `n` points over `len`, curling by `curl` radians in all and swaying like a wave with `phase` (the wave travels toward the tip). A cheap, always-moving spine for ribbons.
 */
export function tentacle(root: Pt, angle: number, len: number, n: number, curl: number, sway: number, phase: number): Pt[] {
  const out: Pt[] = [];
  let x = root[0];
  let y = root[1];
  let a = angle;
  const seg = len / (n - 1);
  for (let i = 0; i < n; i++) {
    out.push([x, y]);
    const u = i / (n - 1);
    a += (curl / (n - 1)) * 1 + Math.sin(phase - u * 4.2) * sway * (0.25 + u);
    x += Math.cos(a) * seg;
    y += Math.sin(a) * seg;
  }
  return out;
}

/** A tiny pool of rising motes (embers, spores, ash): positions in cm as a function of time, no state. Returns the `i`-th of `count`: x, y, alpha, size ∈ [0,1]. */
export function mote(i: number, count: number, t: number, hz = 0.5, seed = 0): { x: number; y: number; a: number; s: number } {
  const ph = (i / count + seed) % 1;
  const life = (t * hz + ph) % 1;
  const r = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  const rnd = r - Math.floor(r);
  return { x: (rnd - 0.5) * 2 + Math.sin(life * TAU + i) * 0.25, y: life, a: Math.sin(life * Math.PI), s: 0.5 + 0.5 * (1 - life) };
}
