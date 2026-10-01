export const EPS = 1e-6;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}
export function remap(v: number, inA: number, inB: number, outA: number, outB: number, clampT = true): number {
  const t = invLerp(inA, inB, v);
  return lerp(outA, outB, clampT ? clamp01(t) : t);
}
export function sign(v: number): -1 | 0 | 1 {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}

/** Moves `current` toward `target` by at most `maxDelta`; never overshoots. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  if (current > target) return Math.max(current - maxDelta, target);
  return target;
}

/** Frame-rate independent exponential smoothing (`lambda` ≈ 1 / time-constant, in 1/s). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export interface SmoothState {
  value: number;
  velocity: number;
}

/**
 * Critically damped spring (same family as Unity's SmoothDamp). Follows a moving target without
 * overshoot and keeps velocity continuous, which is what a platformer camera needs.
 */
export function smoothDamp(
  state: SmoothState,
  target: number,
  smoothTime: number,
  dt: number,
  maxSpeed = Infinity,
): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const maxChange = maxSpeed * st;
  const change = clamp(state.value - target, -maxChange, maxChange);
  const clampedTarget = state.value - change;
  const temp = (state.velocity + omega * change) * dt;
  state.velocity = (state.velocity - omega * temp) * exp;
  let out = clampedTarget + (change + temp) * exp;
  // Prevent overshooting the original target.
  if (target - state.value > 0 === out > target) {
    out = target;
    state.velocity = dt > 0 ? (out - target) / dt : 0;
  }
  state.value = out;
  return out;
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
}

export interface Vec2 {
  x: number;
  y: number;
}
export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

/**
 * Axis-aligned rectangle, Y up: `x0 < x1`, `y0 < y1`. Used for colliders, hitboxes, hurtboxes
 * and triggers alike so every spatial query in the game speaks the same type.
 */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export function rect(x0 = 0, y0 = 0, x1 = 0, y1 = 0): Rect {
  return { x0, y0, x1, y1 };
}
/** Strict overlap: rectangles that merely touch along an edge do NOT overlap. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}
export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}
/** Rect of an actor standing at `(x, feetY)`; positions in this game are the centre of the feet. */
export function rectFromFeet(out: Rect, x: number, feetY: number, halfW: number, height: number): Rect {
  out.x0 = x - halfW;
  out.x1 = x + halfW;
  out.y0 = feetY;
  out.y1 = feetY + height;
  return out;
}
export function rectFromCenter(out: Rect, cx: number, cy: number, w: number, h: number): Rect {
  out.x0 = cx - w / 2;
  out.x1 = cx + w / 2;
  out.y0 = cy - h / 2;
  out.y1 = cy + h / 2;
  return out;
}
export function rectWidth(r: Rect): number {
  return r.x1 - r.x0;
}
export function rectHeight(r: Rect): number {
  return r.y1 - r.y0;
}
