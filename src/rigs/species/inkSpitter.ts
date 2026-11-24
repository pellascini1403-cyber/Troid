import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, sampleContour, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut, footCycle } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE INK SPITTER (docs/PROMPT24-LOG.md): a heron made of ink — a plump belly on two stilts, a long S-curved neck that ends in a funnel of a beak, a crest, a plume for a tail — with a window in its belly through which the ink it
 * will throw can be seen, level and sloshing. It keeps its distance, so it walks on its toes and backs away with the neck bobbing; the AIM is everything: the neck draws back into a coil, the belly glows and the level rises, a bead of ink
 * swells in the funnel; the shot is the neck thrown straight out and the body kicked back by it; then it hangs its head. Dead, the belly bursts.
 */

const RIM = PALETTE.violetCore;
const INKGLOW = PALETTE.violetGlow;

/** The neck, as three poses (relaxed S, coiled back to throw, thrown straight out): its shape in between is a blend of them. Root first, in cm. */
const NECK_REST: readonly Pt[] = [[8, 56], [12, 68], [8, 82], [14, 94], [26, 100], [34, 98], [38, 94]];
const NECK_COIL: readonly Pt[] = [[8, 56], [-2, 66], [-12, 80], [-8, 96], [8, 104], [24, 98], [30, 88]];
const NECK_THROW: readonly Pt[] = [[8, 56], [22, 68], [38, 78], [54, 84], [70, 87], [84, 88], [94, 88]];
const BELLY: readonly Pt[] = [[-22, 18], [-26, 36], [-14, 52], [6, 58], [24, 50], [28, 32], [20, 16], [0, 11]];
const BEAK: readonly Pt[] = [[0, 4.5], [10, 3], [20, 7.5], [22, -7.5], [10, -3.5], [0, -4.5]];
const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const INK_SPITTER_RIG: RigDef = {
  id: 'ink_spitter',
  width: 0.9,
  height: 1.2,
  shadow: 70,
  aura: { color: RIM, at: [10, 62], size: 170, base: 0.03 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('ink-spitter');
    const body = k.group('body');
    const skin = ink(RIM, { gloss: lens([-8, 40], 6.5, 3, -0.4, INKGLOW, 0.28) });
    const plain = ink(RIM, { width: 1.5 });
    const limb = ink(RIM, { width: 1.5 });
    const farLimb = ink(mix(RIM, PALETTE.enemyInk, 0.55), { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.22), width: 1.2 });

    // ------------------------------------------------------------------------------------------ legs
    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 2, 2.2], [l2 + 12, 0.5], [l2 + 14, -1.6], [l2 - 2, -2.4]]).fill(PALETTE.enemyInk);
      pen.hard([[l2 - 2, 1.5], [l2 + 8, 5], [l2 + 9, 3]]).fill(PALETTE.enemyInk);
      pen.hard([[l2 - 2, -1.5], [l2 - 11, -3.5], [l2 - 10, -1.2]]).fill(PALETTE.enemyInk);
    };
    const legFar = new Leg(k, 'leg-far', { l1: 24, l2: 26, w0: 6, w1: 4.4, w2: 3, mat: farLimb, foot });
    const legNear = new Leg(k, 'leg-near', { l1: 25, l2: 27, w0: 7, w1: 5, w2: 3.4, mat: limb, foot });

    // ------------------------------------------------------------------------------------------ body
    const plume = [0, 1, 2].map((i) => k.part(`plume${i}`, (pen) => pen.shape([[0, 0], [-8 - i * 2, 5], [-22 - i * 4, 7 - i * 3], [-12 - i * 3, 0], [-5, -2]], plain, { sharp: [2] })));
    const belly = k.part('belly', (pen) => pen.shape(BELLY, skin));
    // the window in the belly: a round pane, and behind it the ink it will throw — its light is the level
    const window = k.part('window', (pen) => {
      pen.circle(0, 0, 11).fill(mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.55));
      pen.circle(0, 0, 11).stroke(RIM, 1.3, 0.85);
      pen.ellipse(-3.5, 4, 3.4, 1.7).fill(PALETTE.whiteHot, 0.35);
    });
    const windowGlow = k.glow(PALETTE.violetGlow, 30, 0);
    const wing = k.part('wing', (pen) => pen.shape([[0, 0], [-8, -10], [-22, -22], [-34, -18], [-26, -8], [-12, 4]], plain, { sharp: [3] }));
    const neck = k.ribbon({ n: 13, width: (u) => 9 - 3.5 * u, color: PALETTE.enemyInk, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.3 }, rim: { color: RIM, width: 1.5, alpha: 0.95 } }, 'neck');
    const head = k.group('head');
    const skull = k.part('skull', (pen) => pen.shape([[-7, 0], [-5, 6], [3, 8], [10, 4], [11, -3], [4, -7], [-4, -5]], ink(RIM, { gloss: lens([-1, 3], 3.6, 1.6, -0.3, INKGLOW, 0.3) })));
    const beak = k.part('beak', (pen) => pen.shape(BEAK, ink(RIM, { width: 1.3 }), { sharp: [2, 3] }, (p) => p.ellipse(18, 0, 3.4, 3.6).fill(PALETTE.enemyInk, 0.9)));
    const crest = [0, 1, 2].map((i) => k.part(`crest${i}`, (pen) => pen.shape([[0, 0], [-4 - i, 7 + i * 3], [-12 - i * 3, 13 + i * 4], [-6, 3]], ink(RIM, { width: 1.2 }), { sharp: [2] })));
    const eye = k.part('eye', (pen) => pen.ellipse(0, 0, 1.9, 2.8).fill(PALETTE.whiteHot));
    const eyeGlow = k.glow(INKGLOW, 22, 0);
    const bead = k.glow(INKGLOW, 20, 0);
    const beadCore = k.glow(PALETTE.whiteHot, 10, 0);
    const splat = new Motes(k, 10, INKGLOW, 10, 0.4);

    head.addChild(...crest, skull, beak, eye, eyeGlow);
    body.addChild(...plume, wing, belly, window, windowGlow, neck, head, bead, beadCore);
    root.addChild(legFar.root, body, legNear.root, splat);
    place(skull, 0, 0);
    place(beak, 9, -1.5);
    place(eye, 3.5, 2.6);
    eyeGlow.position.set(3.5, -2.6);
    crest.forEach((c, i) => place(c, -3 - i * 1.5, 6 + i * 1, 0.5 + i * 0.35));
    place(window, 2, 34);
    windowGlow.position.set(2, -34);
    plume.forEach((p, i) => place(p, -22, 24 + i * 5, 2.8 - i * 0.3));
    place(wing, -8, 44, 0.1);

    // ------------------------------------------------------------------------------------------ motion
    let walk = k.seed * 3;
    let aimAmt = 0;
    let inkLevel = 0.55;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const aim = f.anim === 'telegraph';
        const fire = f.anim === 'attack';
        const moving = Math.abs(f.vx) > 0.25 && !aim && !fire && !dead;

        // how far the neck is coiled (1) or thrown (−1): it draws back through the aim and snaps out in the shot
        const wantAim = aim ? easeOut(Math.min(1, f.p * 1.15)) : fire ? -1 : f.phase === 'recovery' ? 0.2 * (1 - f.p) : 0;
        aimAmt = dt > 0 ? damp(aimAmt, wantAim, fire ? 40 : f.phase === 'recovery' ? 6 : 14, dt) : aimAmt;
        inkLevel = dt > 0 ? damp(inkLevel, aim ? 0.55 + 0.4 * f.p : fire ? 0.5 : f.phase === 'recovery' ? 0.5 : 0.55 + 0.05 * Math.sin(f.t * 1.6), 7, dt) : inkLevel;

        if (moving) walk += dt * (0.7 + Math.abs(f.vx) * 0.5);
        const stepBeat = Math.sin(walk * Math.PI * 2);
        const bodyY = 0 - 0 * stepBeat;

        // the body: it kicks back with the shot, leans back to aim
        const kick = fire ? -7 : 0;
        const lean = (aim ? 0.14 * f.p : 0) + (fire ? -0.1 : 0) + 0.25 * f.hurt + (dead ? 0.7 * easeIn(f.dying) : 0);
        const by = 4 * Math.abs(stepBeat) * (moving ? 1 : 0) + 0.8 * Math.sin(f.t * 1.8) + (dead ? -22 * easeOut(f.dying) : 0);
        place(body, kick - 3 * f.hurt, by + bodyY + 36, lean, 0.8, 0.8 * (1 - (dead ? 0.35 * f.dying : 0)));

        // legs: long strides on the toes; the knees bend backward, as a heron's do
        const hipH = 46 + by;
        const mk = (leg: Leg, hipX: number, off: number): void => {
          const c = footCycle(walk + off, 14, 8);
          leg.root.position.set(hipX + kick * 0.4, -hipH);
          leg.reach((moving ? c.x : 0) + 2 - (aim ? 4 * f.p : 0), -hipH + 3 + (moving ? c.y : 0) + (dead ? 14 * f.dying : 0), -1);
        };
        mk(legFar, -4, 0.5);
        mk(legNear, 2, 0);

        // the neck: a blend of the three poses, with a little life in it
        const coil = Math.max(0, aimAmt);
        const thrown = Math.max(0, -aimAmt);
        const sway = 1.6 * Math.sin(f.t * 1.7) + (moving ? 3.2 * Math.sin(walk * Math.PI * 2 + 1) : 0);
        const pts: Pt[] = NECK_REST.map((p, i) => {
          const q = lerpPt(lerpPt(p, NECK_COIL[i]!, coil), NECK_THROW[i]!, thrown);
          const u = i / 6;
          return [q[0] + (moving ? 2.2 * Math.sin(walk * Math.PI * 2 + u * 2) * u : 0), q[1] + sway * u * (1 - thrown)] as Pt;
        });
        if (dead) {
          for (let i = 1; i < pts.length; i++) pts[i] = [pts[i]![0] + 30 * (i / 6) * f.dying, pts[i]![1] - 70 * (i / 6) * easeIn(f.dying)];
        }
        const smooth = sampleContour(pts, { closed: false }, 2);
        neck.setSpine(smooth);
        const tip = smooth[smooth.length - 1]!;
        const prev = smooth[smooth.length - 3]!;
        const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
        place(head, tip[0], tip[1], ang + (thrown > 0.5 ? 0 : -0.15 * coil) - 0.2 * f.hurt);
        const gape = fire ? 0.35 : aim ? 0.1 + 0.2 * f.p : 0.02;
        place(beak, 9, -1.5, -gape * 0.5);

        // the belly: the ink in it rises with the aim and glows through the window
        windowGlow.alpha = Math.min(1, (inkLevel - 0.3) * 0.9 + 0.4 * f.heat) * (dead ? 0 : 1);
        windowGlow.scale.set((22 + 14 * inkLevel + 10 * f.heat) / windowGlow.texture.width);
        const eyeOpen = dead ? 0.1 : 1 - 0.85 * f.hurt;
        eye.scale.set(1 + 0.4 * f.heat, Math.max(0.08, eyeOpen) * (1 + 0.3 * f.heat));
        eyeGlow.alpha = Math.min(1, (0.15 + 0.85 * f.heat) * eyeOpen) * (dead ? 0 : 1);
        eyeGlow.scale.set((16 + 16 * f.heat) / eyeGlow.texture.width);

        // the bead of ink swelling in the funnel while it aims, and gone with the shot
        const swell = aim ? easeIn(f.p) : 0;
        const beak2 = lerpPt(tip, [tip[0] + 20 * Math.cos(ang), tip[1] + 20 * Math.sin(ang)], 1);
        bead.position.set(beak2[0], -beak2[1]);
        beadCore.position.set(beak2[0], -beak2[1]);
        bead.alpha = swell * 0.95;
        bead.scale.set((8 + 34 * swell) / bead.texture.width);
        beadCore.alpha = swell;
        beadCore.scale.set((5 + 16 * swell) / beadCore.texture.width);

        // death: the belly bursts into ink
        splat.position.set(0, 0);
        splat.show(f.t, 4, 40, 90, 70, 0.6, dead ? Math.min(1, f.dying * 4) * (1 - f.dying) * 1.4 : 0);
        for (const [i, p] of plume.entries()) {
          if (dead) flung(p, [-22, 24 + i * 5], [-30 - i * 12, 40], -2 - i, 140, -by - 2, f.dying);
          else place(p, -22, 24 + i * 5 + 0.8 * Math.sin(f.t * 2 + i), 2.8 - i * 0.3 + 0.06 * Math.sin(f.t * 2.4 + i) - (fire ? 0.3 : 0));
        }
      },
    };
  },
};
