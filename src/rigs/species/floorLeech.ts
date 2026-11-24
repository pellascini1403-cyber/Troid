import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { place, type Kit } from '../kit/kit';
import { ink } from '../kit/materials';
import { easeIn, easeOut, TAU } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE FLOOR LEECH (docs/PROMPT24-LOG.md): a puddle that is not one. Asleep it is a flat, glossy patch of ink on the floor with a ripple that passes over it now and then and two faint glints that might be eyes — nothing can touch it.
 * The rise is a column of segmented body standing up out of the puddle in an instant, the round toothed mouth of a lamprey open at its head; the bite is the whole body flung forward in an arc; afterwards it stands coiled and gaping, swaying
 * and panting — the opening —; and it sinks back into the puddle. The segments are in its outline: a body of rings that squeezes and stretches.
 */

const RIM = PALETTE.violetCore;
const GLOW = PALETTE.violetGlow;
const SEG = 13;

/** The spine of the body in four poses (flat in the puddle, standing, thrown forward, coiled back): its shape in between is a blend. Root first; cm. */
const FLAT: readonly Pt[] = Array.from({ length: SEG }, (_, i) => [-44 + i * 6, 3 + 0.6 * Math.sin(i)] as Pt);
const STAND: readonly Pt[] = Array.from({ length: SEG }, (_, i) => {
  const u = i / (SEG - 1);
  return [-18 + 30 * u * u + 8 * Math.sin(u * 5), 4 + 58 * u] as Pt;
});
const THROW: readonly Pt[] = Array.from({ length: SEG }, (_, i) => {
  const u = i / (SEG - 1);
  return [-20 + 82 * u, 8 + 34 * Math.sin(u * 2.4) * (1 - u * 0.4) - 6 * u] as Pt;
});
const COIL: readonly Pt[] = Array.from({ length: SEG }, (_, i) => {
  const u = i / (SEG - 1);
  return [-26 + 40 * Math.sin(u * 3.1) * 0.4 + 16 * u, 4 + 52 * u + 8 * Math.sin(u * 6)] as Pt;
});
const mixPose = (a: readonly Pt[], b: readonly Pt[], t: number): Pt[] => a.map((p, i) => [p[0] + (b[i]![0] - p[0]) * t, p[1] + (b[i]![1] - p[1]) * t] as Pt);

export const FLOOR_LEECH_RIG: RigDef = {
  id: 'floor_leech',
  width: 1.2,
  height: 0.55,
  shadow: 110,
  aura: { color: RIM, at: [0, 24], size: 150, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('floor-leech');
    const puddle = k.part('puddle', (pen) =>
      pen.shape([[-62, 0], [-56, 5], [-30, 8], [6, 9], [40, 7], [62, 2], [56, -1], [20, -2], [-30, -2]], ink(RIM, { gloss: [{ at: [-26, 5], rx: 18, ry: 1.8, rot: 0.02, color: GLOW, alpha: 0.3 }, { at: [26, 4], rx: 9, ry: 1.2, rot: -0.03, color: GLOW, alpha: 0.25 }], width: 1.8 }), { round: 1 }),
    );
    const ripple = k.part('ripple', (pen) => pen.ellipse(0, 0, 40, 4.5).stroke(GLOW, 1.4, 0.8));
    ripple.blendMode = 'add';
    const body = k.ribbon(
      {
        n: SEG,
        // the rings: the width goes in and out along the body, so the outline is segmented
        width: (u) => (30 - 12 * u) * (1 + 0.1 * Math.cos(u * TAU * 7.5)),
        color: PALETTE.enemyInk,
        ramp: 'tube',
        edge: { color: PALETTE.enemyInk, grow: 0.4 },
        rim: { color: RIM, width: 2.2, alpha: 0.95 },
      },
      'body',
    );
    const belly = k.ribbon({ n: SEG, width: (u) => (11 - 5 * u) * (1 + 0.1 * Math.cos(u * TAU * 7.5)), color: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.6), ramp: 'flat', alpha: 0.8 }, 'belly');
    const mouth = k.group('mouth');
    const maw = k.part('maw', (pen) => {
      // the ring of the mouth seen at an angle: a dark throat, a lit lip, teeth all round
      pen.ellipse(0, 0, 8, 12).fill(PALETTE.enemyInk);
      pen.ellipse(0, 0, 5.4, 8.6).fill(mix(PALETTE.violetDeep, PALETTE.violetCore, 0.35));
      pen.ellipse(0, 0, 2.6, 4.4).fill(GLOW);
      pen.ellipse(0, 0, 8, 12).stroke(RIM, 1.8, 0.95);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        const x = Math.cos(a) * 8;
        const y = Math.sin(a) * 12;
        pen.hard([[x, y], [x * 0.55 + Math.cos(a + 0.2) * 1.6, y * 0.55], [x * 0.55 - Math.cos(a + 0.2) * 1.6, y * 0.55 + 1]]).fill(PALETTE.whiteHot, 0.9);
      }
    });
    const eyeA = k.part('eye-a', (pen) => pen.ellipse(0, 0, 1.8, 2.6).fill(PALETTE.whiteHot));
    const eyeB = k.part('eye-b', (pen) => pen.ellipse(0, 0, 1.5, 2.2).fill(PALETTE.whiteHot));
    const glow = k.glow(GLOW, 40, 0);
    const glints = [0, 1].map(() => k.glow(GLOW, 8, 0));

    mouth.addChild(maw);
    root.addChild(puddle, ripple, body, belly, mouth, eyeA, eyeB, glow, ...glints);

    let up = 0;
    let lunge = 0;
    let coil = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const asleep = f.anim === 'crouch';
        const rise = f.anim === 'telegraph';
        const bite = f.anim === 'attack';
        const open = f.phase === 'recovery';

        // how far out of the puddle: asleep, it is in it; the rise is almost instant; it sinks back slowly
        const wantUp = rise ? easeOut(Math.min(1, f.p * 2.2)) : bite || open ? 1 : 0;
        // (the sink is `crouch` with progress; the sleep is `crouch` with none)
        const sinking = asleep && f.p > 0 && f.p < 1;
        up = dt > 0 ? damp(up, sinking ? 1 - easeIn(f.p) : wantUp, rise ? 22 : sinking ? 12 : 14, dt) : up;
        lunge = dt > 0 ? damp(lunge, bite ? 1 : 0, bite ? 40 : 10, dt) : lunge;
        coil = dt > 0 ? damp(coil, open ? 1 : 0, 10, dt) : coil;

        // the pose: a blend of flat, standing, thrown and coiled — and a wave of its own along it
        let pts = mixPose(FLAT, STAND, up);
        pts = mixPose(pts, THROW, lunge);
        pts = mixPose(pts, COIL, coil * (1 - lunge) * 0.7);
        const sway = (open ? 5 : 2.5) * Math.sin(f.t * (open ? 5 : 2.4)) * up * (1 - lunge);
        const shaken = dead ? Math.sin(f.t * 40) * 3 * (1 - f.dying) : 0;
        pts = pts.map((p, i) => {
          const u = i / (SEG - 1);
          const droop = dead ? -50 * easeIn(f.dying) * u : 0;
          return [p[0] + (sway + shaken) * u + (dead ? 18 * f.dying * u : 0), Math.max(2, p[1] + droop)] as Pt;
        });
        // a squeeze runs up the body when it rises
        if (rise) for (let i = 0; i < pts.length; i++) pts[i] = [pts[i]![0], pts[i]![1] * (1 + 0.06 * Math.sin(f.t * 30 - i))];
        const tight = Math.min(1, up + 0.001);
        body.setSpine(pts);
        belly.setSpine(pts.map((p, i) => [p[0] + 1.5, p[1] - 3.4 * (1 - i / SEG)] as Pt));
        body.alpha = belly.alpha = Math.min(1, up * 4) * (dead ? 1 - Math.max(0, (f.dying - 0.7) / 0.3) : 1);

        // the mouth at the head, turned to where the last of the spine points, gaping with the rise, the bite and the pant
        const tip = pts[SEG - 1]!;
        const prev = pts[SEG - 3]!;
        const dir = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
        const gape = (rise ? 0.5 + 0.5 * f.p : bite ? 1.1 : open ? 0.7 + 0.25 * Math.sin(f.t * 8) : 0.2) * tight;
        place(mouth, tip[0] + Math.cos(dir) * 5, tip[1] + Math.sin(dir) * 5, dir - 0.05, 0.9 + 0.7 * gape, 1.05 + 0.7 * gape);
        mouth.alpha = body.alpha;
        const ex = tip[0] - Math.cos(dir) * 8 - Math.sin(dir) * 9;
        const ey = tip[1] - Math.sin(dir) * 8 + Math.cos(dir) * 9;
        const blink = dead ? 0.1 : 1 - 0.85 * f.hurt;
        place(eyeA, ex, ey, 0, 1 + 0.4 * f.heat, Math.max(0.1, blink));
        place(eyeB, ex - Math.cos(dir) * 8, ey - Math.sin(dir) * 8 + 2, 0, 0.9 + 0.4 * f.heat, Math.max(0.1, blink));
        eyeA.alpha = eyeB.alpha = Math.min(1, up * 3);
        glow.position.set(tip[0] + Math.cos(dir) * 6, -(tip[1] + Math.sin(dir) * 6));
        glow.alpha = Math.min(1, (0.1 + 0.9 * f.heat) * up) * (dead ? 0 : 1);
        glow.scale.set((34 + 30 * f.heat) / glow.texture.width);

        // asleep: a ripple crosses the puddle now and then, and two glints blink in it
        const sleeping = up < 0.35;
        const rp = (f.t * 0.45) % 1;
        ripple.visible = sleeping && !dead;
        ripple.alpha = Math.sin(rp * Math.PI) * 0.7 * (1 - up * 2);
        place(ripple, -24 + rp * 48, 4, 0, 0.3 + 1.3 * rp, 0.8);
        glints.forEach((g, i) => {
          g.visible = sleeping && !dead;
          g.position.set(6 + i * 13, -3.5);
          g.alpha = (0.35 + 0.65 * Math.max(0, Math.sin(f.t * 1.3 + i * 2.4))) * (1 - up * 3);
        });
        // the puddle thins as it comes up and spreads when it dies
        place(puddle, 0, 0, 0, 1 + 0.12 * up + (dead ? 0.4 * f.dying : 0), 1 - 0.3 * up - (dead ? 0.5 * f.dying : 0));
        puddle.alpha = dead ? 1 - Math.max(0, (f.dying - 0.5) / 0.5) : 1;
      },
    };
  },
};
