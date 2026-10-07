import type { AtlasMeta, SpriteSetDefinition } from './SpriteSetDefinition';
import { clipFrameNames } from './SpriteSetDefinition';
import type { AnimState } from './vocabulary';

export interface SpriteIssue {
  level: 'error' | 'warn' | 'info';
  message: string;
}

/** The sword must be held by the right hand: grip and hand anchors closer than this (metres) in every attack frame. */
export const SWORD_GRIP_TOLERANCE = 0.04;
/** Character height in the atlas vs the definition: more than this relative difference is reported as a scale problem. */
export const SCALE_TOLERANCE = 0.15;

/** Clips in which the sword is in play: they must carry the full sword contract frame by frame. */
export const SWORD_STATES: readonly AnimState[] = ['attack', 'attack1', 'attack2', 'attackAir', 'attackCrouch', 'special'];

/**
 * Checks a sprite set against the engine's asset contract (docs/ARCHITECTURE-2D.md §7.6): the same function backs the
 * unit tests that guard the placeholder and runs in dev when final art is integrated, so what is missing or mis-scaled
 * shows up immediately. PURE: pass the frame names the atlas really contains (`available`) when they are known.
 */
export function validateSpriteSet(def: SpriteSetDefinition, meta: AtlasMeta | null, available?: ReadonlySet<string>): SpriteIssue[] {
  const issues: SpriteIssue[] = [];
  const err = (message: string): void => void issues.push({ level: 'error', message });
  const warn = (message: string): void => void issues.push({ level: 'warn', message });

  // 1. basics
  if (!(def.artPxPerMeter > 0)) err(`artPxPerMeter must be positive (got ${def.artPxPerMeter})`);
  if (def.pivot[0] < 0 || def.pivot[0] > 1 || def.pivot[1] < 0 || def.pivot[1] > 1) {
    err(`pivot ${JSON.stringify(def.pivot)} must be normalised to the frame (0..1)`);
  }
  if (!(def.height > 0)) err(`height must be positive (got ${def.height})`);

  // 2. idle is the last-resort fallback of every state
  if (!def.clips.idle || def.clips.idle.count <= 0) err('no "idle" clip: it is the last-resort fallback of every state');

  // 3. every clip: frames exist, phases are coherent
  for (const [state, clip] of Object.entries(def.clips) as Array<[AnimState, NonNullable<SpriteSetDefinition['clips'][AnimState]>]>) {
    if (clip.count <= 0) {
      err(`clip "${state}" has no frames`);
      continue;
    }
    if (available) {
      const missing = clipFrameNames(clip).filter((n) => !available.has(n));
      if (missing.length > 0) err(`clip "${state}" references frames that are not in the atlas: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`);
    }
    if (clip.phases) {
      const { startup, active, recovery } = clip.phases;
      const ranges: Array<[string, readonly [number, number]]> = [['startup', startup], ['active', active], ['recovery', recovery]];
      for (const [name, [lo, hi]] of ranges) {
        if (!(lo >= 0 && hi >= lo && hi < clip.count)) err(`clip "${state}" phase "${name}" [${lo}, ${hi}] is outside its ${clip.count} frames`);
      }
      if (!(startup[1] < active[0] && active[1] < recovery[0])) warn(`clip "${state}" phases overlap or are out of order (startup → active → recovery)`);
    }
  }

  // 4. sword contract: per-frame hand, grip and tip; the grip sits in the hand
  for (const state of SWORD_STATES) {
    const clip = def.clips[state];
    if (!clip) continue;
    if (!meta) {
      warn(`clip "${state}" has no atlas metadata: the sword anchors will be proportional fallbacks`);
      continue;
    }
    let bad = 0;
    for (const name of clipFrameNames(clip)) {
      const a = meta.frames[name]?.anchors;
      if (!a?.weapon_tip) err(`frame "${name}" has no "weapon_tip" anchor`);
      if (!a?.weapon_grip) err(`frame "${name}" has no "weapon_grip" anchor`);
      if (!a?.hand_r) err(`frame "${name}" has no "hand_r" anchor`);
      if (a?.weapon_grip && a.hand_r) {
        const d = Math.hypot(a.weapon_grip[0] - a.hand_r[0], a.weapon_grip[1] - a.hand_r[1]);
        if (d > SWORD_GRIP_TOLERANCE) bad++;
      }
    }
    if (bad > 0) err(`clip "${state}": the sword grip is not on the right hand (> ${SWORD_GRIP_TOLERANCE} m) in ${bad} frame(s)`);
  }

  // 5. scale: the idle frames' character height, converted to metres, must match the definition
  const idle = def.clips.idle;
  if (idle && meta && def.artPxPerMeter > 0 && def.height > 0) {
    const heights = clipFrameNames(idle).map((n) => meta.frames[n]?.heightPx).filter((h): h is number => h !== undefined);
    if (heights.length > 0) {
      const mean = heights.reduce((a, b) => a + b, 0) / heights.length / def.artPxPerMeter;
      if (Math.abs(mean - def.height) / def.height > SCALE_TOLERANCE) {
        const suggested = (heights.reduce((a, b) => a + b, 0) / heights.length / def.height).toFixed(2);
        warn(`the character is ${mean.toFixed(2)} m tall at ${def.artPxPerMeter} px/m, the definition says ${def.height} m. Suggested artPxPerMeter: ${suggested}`);
      }
    }
  }

  // 6. summary
  const clipCount = Object.keys(def.clips).length;
  const frameCount = Object.values(def.clips).reduce((n, c) => n + (c?.count ?? 0), 0);
  issues.push({ level: 'info', message: `${clipCount} clip(s), ${frameCount} frame(s)${def.placeholder ? ', PLACEHOLDER' : ''}` });
  return issues;
}
