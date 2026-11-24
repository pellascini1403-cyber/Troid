import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeOut } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE MAGMA TOAD (docs/PROMPT24-LOG.md): the leaper of the second half, and not the mire toad in another colour. A horned toad of obsidian: a flat, broad, angular head with two horns swept back, a back of black glass plates with the fire
 * showing between them, a tail, no throat sac and no warts — the heat is in the CRACKS. The crouch is the warning: the cracks between the plates widen and go white, the mouth burns along its whole length, the horns glow at the tips; the leap
 * is the body flung out behind it; the landing breaks the floor — a ring of lava runs out far along the ground and droplets of it are thrown up. Spent, it sits panting, the cracks closing slowly. Dead, the plates fall apart.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const GLASS = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.3);

const TORSO: readonly Pt[] = [[-48, -4], [-44, 12], [-28, 24], [-2, 28], [24, 26], [44, 16], [54, 2], [48, -12], [26, -22], [0, -24], [-28, -21], [-46, -14]];
const HEAD: readonly Pt[] = [[-10, -6], [-12, 6], [0, 14], [22, 13], [40, 6], [43, -2], [28, -10], [8, -12]];
const JAW: readonly Pt[] = [[0, 0], [20, -1], [38, -3], [30, -12], [10, -13], [0, -8]];
const PLATES: ReadonlyArray<Pt[]> = [
  [[-4, 0], [0, 14], [14, 20], [22, 8], [16, -4]],
  [[-4, 0], [2, 16], [16, 22], [26, 12], [20, -2]],
  [[-4, 0], [2, 14], [14, 18], [22, 8], [16, -2]],
  [[-4, 0], [0, 10], [10, 14], [16, 6], [11, -2]],
];
const PLATE_AT: ReadonlyArray<Pt> = [[-36, 6], [-14, 18], [10, 20], [32, 12]];

export const MAGMA_TOAD_RIG: RigDef = {
  id: 'magma_toad',
  width: 1.3,
  height: 0.95,
  shadow: 140,
  aura: { color: RIM, at: [0, 36], size: 220, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('magma-toad');
    const body = k.group('body');
    const skin = scorched(GLASS, RIM, { gloss: lens([-12, 14], 16, 3.4, -0.1, HOT, 0.2), width: 2.4 });
    const limb = scorched(GLASS, RIM, { width: 1.9 });
    const farLimb = scorched(mix(GLASS, PALETTE.enemyInk, 0.45), mix(RIM, PALETTE.enemyInk, 0.55), { width: 1.2 });
    const hindFoot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 2, 3], [l2 + 15, 1], [l2 + 17, -2.5], [l2 + 5, -4], [l2 - 2, -3]]).fill(DEEP);
    };
    const handFoot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 2.4], [l2 + 7, 0.5], [l2 + 8, -2.4], [l2 - 1, -2.4]]).fill(DEEP);
    };
    const hindFar = new Leg(k, 'hind-far', { l1: 30, l2: 34, w0: 21, w1: 11, w2: 5.4, mat: farLimb, foot: hindFoot });
    const hindNear = new Leg(k, 'hind-near', { l1: 31, l2: 35, w0: 24, w1: 12, w2: 6, mat: limb, foot: hindFoot });
    const armFar = new Leg(k, 'arm-far', { l1: 14, l2: 16, w0: 9, w1: 7, w2: 4.4, mat: farLimb, foot: handFoot });
    const armNear = new Leg(k, 'arm-near', { l1: 15, l2: 17, w0: 10, w1: 7.4, w2: 4.6, mat: limb, foot: handFoot });

    const crack = (p: Pen, pts: Pt[], w = 2.2): void => {
      p.contour(pts, { closed: false, round: 0.3 }).stroke(DEEP, w + 1.3, 0.95);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(RIM, w, 0.95);
    };
    const torso = k.part('torso', (pen) => pen.shape(TORSO, skin, { round: 1 }, (p) => {
      // the fire shows through the body between the plates: a belly of coals
      p.contour([[47, 3], [38, -11], [22, -21], [0, -24], [-24, -21], [-40, -13], [-30, -15], [-4, -17], [22, -14], [38, -3]], { closed: true }).fill(mix(DEEP, RIM, 0.3), 0.7);
      crack(p, [[-40, 0], [-30, 8], [-22, 4]], 1.6);
    }));
    const plates = PLATES.map((pts, i) => k.part(`plate${i}`, (pen) => pen.shape(pts, scorched(GLASS, RIM, { gloss: lens([6, 10], 6, 1.8, -0.5, HOT, 0.3), width: 1.8 }), { sharp: [1, 2], round: 0.2 })));
    const cracksUnder = k.part('cracks', (pen) => {
      // the seams between the plates and down the flanks: glow with the heat
      crack(pen, [[-42, 14], [-34, 6], [-28, 16], [-20, 6]], 2);
      crack(pen, [[-12, 24], [-8, 12], [2, 22], [8, 10]], 2);
      crack(pen, [[20, 22], [24, 8], [36, 16], [44, 6]], 2);
      crack(pen, [[-30, -6], [-10, -10], [10, -8], [34, -6]], 1.6);
    });
    cracksUnder.blendMode = 'add';
    const tail = k.part('tail', (pen) => pen.shape([[0, 8], [-20, 5], [-38, -3], [-20, -7], [0, -8]], skin, { sharp: [2], round: 0.7 }, (p) => crack(p, [[-4, 0], [-20, 0]], 1.2)));
    const head = k.group('head');
    const skull = k.part('skull', (pen) => pen.shape(HEAD, skin, { round: 0.9 }, (p) => {
      p.hard([[0, 13], [22, 12], [40, 6], [22, 9]]).fill(PALETTE.enemyInk, 0.7);
      crack(p, [[-6, 2], [6, 8], [14, 4]], 1.4);
    }));
    const jaw = k.part('jaw', (pen) => pen.shape(JAW, limb, { round: 0.7 }));
    const mouth = k.part('mouth', (pen) => {
      pen.contour([[0, 0], [14, -0.5], [28, -2], [38, -3]], { closed: false }).stroke(RIM, 2.6, 0.95);
      pen.contour([[0, 0], [14, -0.5], [28, -2], [38, -3]], { closed: false }).stroke(HOT, 1.2, 0.95);
    });
    mouth.blendMode = 'add';
    const hornA = k.part('horn-a', (pen) => pen.shape([[0, 0], [-14, 12], [-34, 20], [-22, 4], [-6, -3]], scorched(mix(GLASS, DEEP, 0.2), RIM, { width: 1.5 }), { sharp: [2], round: 0.5 }));
    const hornB = k.part('horn-b', (pen) => pen.shape([[0, 0], [-12, 10], [-28, 14], [-18, 1], [-4, -3]], farLimb, { sharp: [2], round: 0.5 }));
    const hornGlowA = k.glow(HOT, 22, 0);
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 4, 2.6).fill(HOT);
      pen.ellipse(0.8, 0, 1.4, 2.4).fill(PALETTE.enemyInk);
    });
    const eyeGlow = k.glow(HOT, 36, 0);
    const heatGlow = k.glow(RIM, 150, 0);
    const lavaRing = k.part('ring', (pen) => pen.ellipse(0, 0, 60, 8).stroke(RIM, 3, 0.95));
    lavaRing.blendMode = 'add';
    const lavaRing2 = k.part('ring2', (pen) => pen.ellipse(0, 0, 60, 8).stroke(HOT, 1.6, 0.95));
    lavaRing2.blendMode = 'add';
    const drops = new Motes(k, 12, HOT, 9, 0.3);
    const embers = new Motes(k, 8, HOT, 6, 0.8);

    head.addChild(hornB, skull, jaw, mouth, hornA, hornGlowA, eye, eyeGlow);
    body.addChild(tail, torso, cracksUnder, heatGlow, ...plates, head);
    root.addChild(hindFar.root, armFar.root, lavaRing, lavaRing2, body, hindNear.root, armNear.root, drops, embers);
    place(skull, 0, 0);
    place(jaw, 2, -4);
    place(mouth, 3, -4);
    place(hornA, 6, 12, 0.35);
    place(hornB, 10, 12, 0.18);
    place(eye, 22, 14);
    eyeGlow.position.set(22, -14);
    hornGlowA.position.set(-26, -22);
    plates.forEach((p, i) => place(p, PLATE_AT[i]![0], PLATE_AT[i]![1] + 4, -0.1 + i * 0.05));
    place(tail, -48, 6, 0);
    place(head, 44, 4, 0);

    let squat = 0;
    let heatAmt = 0;
    let hop = k.seed * 2;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const crouch = f.anim === 'telegraph';
        const leap = f.anim === 'attack';
        const land = f.anim === 'land';
        const moving = Math.abs(f.vx) > 0.3 && f.anim === 'walk';

        const wantSquat = crouch ? 0.45 + 0.55 * easeIn(f.p) : land ? 0.9 - 0.3 * easeOut(f.p) : f.phase === 'recovery' ? 0.25 + 0.05 * Math.sin(f.t * 8) : dead ? 1 : 0;
        squat = dt > 0 ? damp(squat, wantSquat, crouch ? 8 : 16, dt) : squat;
        const wantHeat = crouch ? 0.35 + 0.65 * f.p : leap ? 1 : land ? 0.9 - 0.4 * f.p : f.phase === 'recovery' ? 0.5 * (1 - f.p) : dead ? 0 : 0.14 + 0.08 * Math.sin(f.t * 1.5);
        heatAmt = dt > 0 ? damp(heatAmt, wantHeat, 9, dt) : heatAmt;
        if (moving) hop += dt * 1.6;
        const arc = moving ? Math.sin((hop % 1) * Math.PI) : 0;
        const air = leap ? Math.max(-1, Math.min(1, f.vy / 7)) : arc * 0.6;

        const by = 34 - 17 * squat + (moving ? 8 * arc : 0) + (leap ? 6 : 0) - (dead ? 6 * f.dying : 0);
        const sx = 1 + 0.2 * squat + (leap ? -0.1 : 0) + (dead ? 0.3 * f.dying : 0);
        const sy = 1 - 0.34 * squat + (leap ? 0.12 : 0) - (dead ? 0.5 * easeOut(f.dying) : 0) - 0.08 * f.hurt;
        const shake = crouch ? Math.sin(f.t * 55) * 0.7 * f.p : 0;
        place(body, shake - 4 * f.hurt, by, (leap ? 0.5 * air : 0) + (moving ? 0.1 * (0.5 - arc) : 0) - 0.1 * squat + 0.25 * f.hurt, sx, sy);

        // the cracks, the mouth and the horns: the heat is drawn in them
        cracksUnder.alpha = Math.min(1, 0.2 + 0.95 * heatAmt);
        mouth.alpha = Math.min(1, 0.25 + 0.95 * heatAmt);
        heatGlow.alpha = Math.min(1, heatAmt * 0.8) * (dead ? 0 : 1);
        heatGlow.position.set(0, -26);
        heatGlow.scale.set((110 + 90 * heatAmt) / heatGlow.texture.width);
        hornGlowA.alpha = Math.min(1, heatAmt * 1.1);
        hornGlowA.scale.set((16 + 20 * heatAmt) / hornGlowA.texture.width);

        // the head: broad and low; the jaw drops in the leap and to pant
        const gape = leap ? 0.5 : crouch ? 0.1 + 0.12 * f.p : land ? 0.3 : f.phase === 'recovery' ? 0.16 + 0.1 * Math.sin(f.t * 9) : 0.02;
        place(head, 44, 4 + (f.anim === 'alert' ? 5 * (1 - f.p) : 0), (leap ? 0.2 : 0) - 0.08 * squat + 0.03 * Math.sin(f.t * 1.6));
        place(jaw, 2, -4, -gape);
        place(mouth, 3, -4, -gape * 0.4);
        const open = dead ? 0.15 : 1 - 0.85 * f.hurt;
        place(eye, 22, 14, 0, 1 + 0.4 * f.heat, Math.max(0.1, open) * (1 + 0.3 * f.heat));
        eyeGlow.alpha = Math.min(1, (0.2 + 0.85 * f.heat) * open) * (dead ? 0 : 1);
        eyeGlow.scale.set((28 + 24 * f.heat) / eyeGlow.texture.width);
        plates.forEach((p, i) => {
          // the plates lift on their seams when the cracks widen
          place(p, PLATE_AT[i]![0], PLATE_AT[i]![1] + 4 + 3 * heatAmt + (dead ? (i - 1.5) * 8 * f.dying : 0), -0.1 + i * 0.05 + 0.1 * heatAmt * (i - 1.5) + (dead ? (i - 1.5) * 0.7 * f.dying : 0));
        });

        // legs
        const hipX = -26;
        const hipH = by - 6;
        const hx = leap ? -62 : -4 + 12 * squat + (land ? -8 : 0);
        const hy = leap ? -hipH + 14 + 14 * Math.max(0, air) : -hipH + (moving ? 12 * arc : 0);
        hindNear.root.position.set(hipX, -hipH);
        hindFar.root.position.set(hipX - 5, -hipH + 2);
        hindNear.reach(hx, hy, 1);
        hindFar.reach(hx - 8 + (land ? -10 : 0), hy + (leap ? 4 : 0), 1);
        const armH = by - 8;
        armNear.root.position.set(26, -armH);
        armFar.root.position.set(20, -armH + 1);
        const ax = leap ? 26 : land ? 18 : 8;
        const ay = leap ? -armH + 32 : -armH + (moving ? 8 * arc : 0);
        armNear.reach(ax, ay, -1);
        armFar.reach(ax - 7, ay + (leap ? 3 : 0), -1);

        // the landing: a ring of lava runs out along the floor, a second one inside it, and droplets are thrown up
        const ringU = land ? easeOut(f.p) : 0;
        for (const [i, r] of [lavaRing, lavaRing2].entries()) {
          r.visible = land && f.p < 0.98;
          if (r.visible) {
            const u = Math.max(0, Math.min(1, f.p - i * 0.1));
            r.alpha = (1 - easeOut(u)) * 0.95;
            place(r, 0, 3, 0, 0.4 + 3.2 * easeOut(u) * (1 + ringU * 0.0), 0.7 + 0.4 * easeOut(u));
          }
        }
        drops.position.set(0, 0);
        drops.show(f.t, 0, 14, 160, 70, 1, land && f.p < 0.7 ? 0.9 * (1 - f.p) : dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.4 : 0);
        embers.position.set(0, -by - 10);
        embers.show(f.t, 0, 0, 90, 40, 0.6, 0.15 + 0.5 * heatAmt);
      },
    };
  },
};
