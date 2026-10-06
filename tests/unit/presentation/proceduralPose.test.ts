import { describe, expect, it } from 'vitest';
import { INK_SLIME_LOOK } from '@/content/proceduralActors';
import { createProceduralPose, evalPose, resolvePose, type ProceduralLook } from '@/presentation/proceduralPose';
import { ANIM_STATES, type AnimState } from '@/presentation/vocabulary';

const look = INK_SLIME_LOOK;
const pose = (anim: AnimState, progress = 0, time = 0, phase: 'none' | 'startup' | 'active' | 'recovery' = 'none') =>
  evalPose(look, anim, phase, progress, time, createProceduralPose());

describe('procedural pose: squash, stretch and the signs of a coming blow', () => {
  it('rests near its natural size, breathing a few percent', () => {
    for (let t = 0; t < 4; t += 0.05) {
      const p = pose('idle', 0, t);
      expect(p.scaleY).toBeGreaterThan(0.95);
      expect(p.scaleY).toBeLessThan(1.05);
      expect(p.aura).toBe(0);
      expect(p.eyeGlow).toBeLessThan(0.5); // dim eyes: nothing is about to happen
    }
  });

  it('the wind-up builds monotonically: it squashes and widens, the eyes go white-hot, the aura grows', () => {
    let prev = pose('telegraph', 0);
    for (let i = 1; i <= 24; i++) {
      const cur = pose('telegraph', i / 24);
      expect(cur.scaleY, `tick ${i}`).toBeLessThan(prev.scaleY);
      expect(cur.scaleX, `tick ${i}`).toBeGreaterThan(prev.scaleX);
      expect(cur.eyeGlow, `tick ${i}`).toBeGreaterThan(prev.eyeGlow);
      expect(cur.aura, `tick ${i}`).toBeGreaterThan(prev.aura);
      expect(cur.auraScale, `tick ${i}`).toBeGreaterThan(prev.auraScale);
      prev = cur;
    }
  });

  it('by the end of the wind-up the warning is unmistakable (the 24-tick telegraph of GAME-SPEC §15.1)', () => {
    const start = pose('telegraph', 0);
    const end = pose('telegraph', 1);
    expect(start.scaleY).toBeCloseTo(1, 6); // it begins as it was: no pop
    expect(end.scaleY).toBeLessThan(0.65); // squashed
    expect(end.scaleX).toBeGreaterThan(1.25); // widened
    expect(end.eyeGlow).toBeGreaterThan(1.5); // incandescent, past plain white
    expect(end.aura).toBeGreaterThan(0.9); // violet
    expect(end.auraScale).toBeGreaterThan(1.4); // and bigger
  });

  it('the held breath: a tremble that grows with the wind-up and is zero at rest', () => {
    const mid = Array.from({ length: 40 }, (_, i) => Math.abs(pose('telegraph', 0.5, i * 0.013).shakeX));
    const end = Array.from({ length: 40 }, (_, i) => Math.abs(pose('telegraph', 1, i * 0.013).shakeX));
    expect(Math.max(...end)).toBeGreaterThan(Math.max(...mid));
    expect(pose('telegraph', 0, 0.3).shakeX).toBe(0);
    expect(pose('idle', 0, 0.3).shakeX).toBe(0);
  });

  it('the lunge is long and flat; the recovery slumps and returns to rest over its 36 ticks', () => {
    const lunge = pose('attack', 0.5, 0, 'active');
    expect(lunge.scaleX).toBeGreaterThan(1.25);
    expect(lunge.scaleY).toBeLessThan(0.9);
    expect(lunge.lean).toBeGreaterThan(0);
    const slumped = pose('idle', 0, 0, 'recovery');
    expect(slumped.scaleY).toBeLessThan(0.85);
    expect(slumped.scaleX).toBeGreaterThan(1.1);
    expect(slumped.aura).toBe(0);
    const recovered = pose('idle', 1, 0, 'recovery');
    expect(recovered.scaleY).toBeCloseTo(1, 6);
    expect(recovered.scaleX).toBeCloseTo(1, 6);
    // a recovery that is not a recovery is just idle
    expect(pose('idle', 0, 0, 'none').scaleY).not.toBeCloseTo(slumped.scaleY, 2);
  });

  it('a hit squashes it for a moment and closes the eyes; death spreads it into a flat puddle', () => {
    const hit = pose('hurt', 0);
    expect(hit.scaleY).toBeLessThan(0.8);
    expect(hit.squint).toBeGreaterThan(0.9);
    expect(pose('hurt', 1).squint).toBeLessThan(0.3);
    const gone = pose('death', 1);
    expect(gone.scaleY).toBeLessThan(0.1);
    expect(gone.scaleX).toBeGreaterThan(1.5);
    expect(gone.eyeGlow).toBe(0);
  });

  it('breathing is periodic at the frequency of the pose and only depends on time (a hit-stop freezes it)', () => {
    const hz = look.poses.idle!.wobble!.hz;
    expect(pose('idle', 0, 0.37).scaleY).toBeCloseTo(pose('idle', 0, 0.37 + 1 / hz).scaleY, 9);
    expect(pose('idle', 0, 0.37)).toEqual(pose('idle', 0, 0.37)); // pure
  });

  it('every number is finite and sane for every animation, progress and time (no NaN reaches the renderer)', () => {
    for (const anim of ANIM_STATES) {
      for (const phase of ['none', 'startup', 'active', 'recovery'] as const) {
        for (let pr = -0.2; pr <= 1.3; pr += 0.1) {
          for (const time of [0, 0.5, 13.37, 1e4]) {
            const p = pose(anim, pr, time, phase);
            for (const [k, v] of Object.entries(p)) expect(Number.isFinite(v), `${anim} ${phase} ${k}`).toBe(true);
            expect(p.scaleX).toBeGreaterThan(0.05);
            expect(p.scaleX).toBeLessThan(2.2);
            expect(p.scaleY).toBeGreaterThan(0.03);
            expect(p.scaleY).toBeLessThan(1.4);
          }
        }
      }
    }
  });

  it('progress outside 0..1 is clamped, not extrapolated', () => {
    expect(pose('telegraph', -3).scaleY).toBe(pose('telegraph', 0).scaleY);
    expect(pose('telegraph', 9).scaleY).toBe(pose('telegraph', 1).scaleY);
  });
});

describe('procedural pose: a look may define only a few poses', () => {
  const minimal: ProceduralLook = {
    ...look,
    poses: { idle: { scaleX: [1, 1], scaleY: [1, 1], eyeGlow: [0.4, 0.4] }, run: { scaleX: [1.2, 1.2], scaleY: [0.9, 0.9], eyeGlow: [0.6, 0.6] } },
    phases: undefined,
  };

  it('follows the vocabulary fallbacks: walk → run, hurt → idle, and anything ends in idle', () => {
    expect(resolvePose(minimal, 'walk')).toBe(minimal.poses.run);
    expect(resolvePose(minimal, 'hurt')).toBe(minimal.poses.idle);
    expect(resolvePose(minimal, 'telegraph')).toBe(minimal.poses.idle);
    expect(resolvePose(minimal, 'death')).toBe(minimal.poses.idle);
  });

  it('a look with no poses at all is neutral rather than broken', () => {
    const none: ProceduralLook = { ...look, poses: {}, phases: undefined };
    const p = evalPose(none, 'telegraph', 'startup', 0.5, 1, createProceduralPose());
    expect(p).toEqual({ scaleX: 1, scaleY: 1, lean: 0, shakeX: 0, eyeGlow: 0, squint: 0, aura: 0, auraScale: 1 });
  });
});

describe('the Ink Slime look', () => {
  it('defines its OWN pose for every animation its brain publishes (nothing relies on a fallback)', () => {
    for (const anim of ['idle', 'walk', 'run', 'alert', 'telegraph', 'attack', 'hurt', 'death'] as const) {
      expect(look.poses[anim], anim).toBeDefined();
    }
    expect(look.phases?.recovery).toBeDefined();
  });

  it('is a 1.1 × 0.9 m blob (the size of its body) in the violet / ink / white palette', () => {
    expect(look.width).toBeCloseTo(1.1, 6);
    expect(look.height).toBeCloseTo(0.9, 6);
    // the eye is the whitest thing on it, the body the darkest
    const lum = (c: number): number => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
    expect(lum(look.colors.eye)).toBeGreaterThan(220);
    expect(lum(look.colors.fill)).toBeLessThan(10);
    // violet: blue and red above green
    const aura = look.colors.aura;
    expect(aura & 255).toBeGreaterThan((aura >> 8) & 255);
    expect((aura >> 16) & 255).toBeGreaterThan((aura >> 8) & 255);
  });
});
