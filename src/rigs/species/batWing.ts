import type { Pt } from '../kit/geometry';

/** Where the parts of one bat wing are for a given pose (all in the body's own space: cm, x forward, y up). */
export interface WingShape {
  /** Shoulder, elbow, wrist. */
  S: Pt;
  E: Pt;
  W: Pt;
  /** The tips of the fingers, from the leading edge to the trailing one, and the middle of each finger. */
  tips: Pt[];
  mids: Pt[];
  /** Where the trailing edge meets the body. */
  H: Pt;
  /** The outline of the membrane, in order: shoulder, elbow, wrist, then every tip with a scallop between, a last scallop and the hip. */
  outline: Pt[];
}

export interface WingSpec {
  /** Bone lengths (cm): upper arm and forearm. */
  arm: readonly [number, number];
  /** Length of each finger, leading edge first. */
  fingers: readonly number[];
  /** Where each finger points at full spread, as an angle (radians) from the axis of the hand, leading edge first (positive: toward the front of the wing). */
  fan: readonly number[];
  /** How deep the scallops between the fingers are (0 straight, 0.3 deep). */
  scallop?: number;
}

const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const add = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const toward = (p: Pt, c: Pt, k: number): Pt => [p[0] + (c[0] - p[0]) * k, p[1] + (c[1] - p[1]) * k];

/** Number of points in the membrane outline of a wing with `fingers` fingers: shoulder, elbow, wrist, the tips, a scallop after each, and the hip. */
export const wingOutlineLength = (fingers: number): number => 3 + fingers * 2 + 1;

/**
 * The pose of a bat's wing: `phi` is where the arm points (radians, counter-clockwise from forward: π/2 straight up, π straight back, 3π/2 straight down) and `spread` how open the hand is (0 folded shut, 1 spread). Pure maths,
 * shared by every bat: the membrane is the polygon between the bones, with the trailing edge scalloped between the fingertips.
 */
export function wingShape(S: Pt, H: Pt, phi: number, spread: number, spec: WingSpec): WingShape {
  const s = Math.max(0.04, Math.min(1, spread));
  // folded, the whole wing is short: the forearm lies back along the body and the fingers along it
  const fold = 0.45 + 0.55 * s;
  const E = add(S, dir(phi - 0.3 * s), spec.arm[0] * fold);
  const W = add(E, dir(phi + 0.2 * s), spec.arm[1] * fold);
  const psi = phi + 0.1 * s;
  const reach = 0.3 + 0.7 * s;
  const tips: Pt[] = [];
  const mids: Pt[] = [];
  for (let i = 0; i < spec.fingers.length; i++) {
    const tip = add(W, dir(psi + spec.fan[i]! * s), spec.fingers[i]! * reach);
    tips.push(tip);
    mids.push(mid(W, tip));
  }
  const depth = (spec.scallop ?? 0.2) * s;
  const outline: Pt[] = [S, E, W];
  for (let i = 0; i < tips.length; i++) {
    outline.push(tips[i]!);
    const next = i + 1 < tips.length ? tips[i + 1]! : H;
    outline.push(toward(mid(tips[i]!, next), W, i + 1 < tips.length ? depth : depth * 0.8));
  }
  outline.push(H);
  return { S, E, W, H, tips, mids, outline };
}
