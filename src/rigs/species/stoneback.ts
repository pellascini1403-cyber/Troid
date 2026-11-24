import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, solid } from '../kit/materials';
import { easeIn, easeInOut, easeOut, footCycle } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE STONEBACK (docs/PROMPT24-LOG.md): a stone beast that hides behind a SLAB. The slab is the whole of its defence — a blow from the front is turned away — so the slab is the whole of its drawing: a tall carved stone held upright
 * in front of it, runes cut into it, and over its top edge two small eyes. The body behind it is a shell of three stone plates on two pillars of legs. It turns slowly and walks heavily. To smash it heaves the slab UP and BACK
 * over itself (the runes light), then drops it forward on the floor with all its weight; and with the slab lying in front of it, guard down, the body and the head are bare — that is the opening, drawn as it is: the runes go dark,
 * the dust settles, and only at the end does it lift the slab again. Dead, the shell comes apart.
 */

const STONE = PALETTE.worldSlate;
const RIM = PALETTE.worldGlow;
const RUNE = PALETTE.violetCore;
const DARK = PALETTE.worldNight;

const SLAB_W = 26;
const SLAB_H = 118;
const SLAB_X = 62; // where the slab's front-bottom corner stands, in front of the feet
const SLAB: readonly Pt[] = [[-SLAB_W, 0], [0, 0], [0, SLAB_H - 12], [-5, SLAB_H], [-SLAB_W + 5, SLAB_H], [-SLAB_W, SLAB_H - 9]];
const HEAD: readonly Pt[] = [[-11, -8], [-13, 6], [-1, 14], [14, 13.5], [25, 6], [27, -4], [17, -12], [2, -12.5]];
const PLATES: ReadonlyArray<{ pts: readonly Pt[]; at: Pt }> = [
  { at: [-30, 38], pts: [[-18, -34], [-22, -6], [-14, 22], [6, 32], [20, 12], [16, -20], [0, -36]] },
  { at: [0, 54], pts: [[-22, -14], [-18, 8], [-4, 20], [16, 16], [24, -2], [20, -20], [0, -26]] },
  { at: [18, 34], pts: [[-14, -28], [-16, 0], [-6, 22], [10, 26], [20, 8], [18, -18], [4, -30]] },
];

export const STONEBACK_RIG: RigDef = {
  id: 'stoneback',
  width: 1.4,
  height: 1.4,
  shadow: 150,
  aura: { color: RUNE, at: [20, 60], size: 210, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('stoneback');
    const body = k.group('body');
    const slabPivot = k.group('slab-pivot');

    const stone = solid(STONE, RIM, { ramp: 'sphere', edge: DARK, gloss: lens([-8, 10], 9, 3, -0.2, RIM, 0.14), width: 2.6 });
    const farStone = solid(mix(STONE, DARK, 0.45), mix(RIM, DARK, 0.5), { ramp: 'sphere', edge: DARK, width: 1.6 });
    const limbStone = solid(STONE, RIM, { ramp: 'sphere', edge: DARK, width: 2.2 });
    const crack = (p: Pen, pts: Pt[]): void => {
      p.contour(pts, { closed: false, round: 0 }).stroke(DARK, 1.4, 0.9);
    };

    // ------------------------------------------------------------------------------------------ legs
    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 6, 9], [l2 + 12, 7], [l2 + 15, -9], [l2 - 6, -10]]).fill(mix(STONE, DARK, 0.3));
    };
    const mkLeg = (key: string, far: boolean) => new Leg(k, key, { l1: 15, l2: 17, w0: far ? 22 : 26, w1: far ? 19 : 23, w2: far ? 16 : 19, mat: far ? farStone : limbStone, foot });
    const legs = [mkLeg('far-back', true), mkLeg('far-front', true), mkLeg('near-back', false), mkLeg('near-front', false)];

    // ------------------------------------------------------------------------------------------ body
    const plates = PLATES.map((pl, i) =>
      k.part(`plate${i}`, (pen) =>
        pen.shape(pl.pts, stone, { round: 0.55 }, (p) => {
          crack(p, [[-6, 14], [-2, 2], [-8, -10]]);
          crack(p, [[8, -4], [12, -14]]);
          // moss in the cracks
          p.ellipse(-4, 20, 6, 2.4).fill(mix(STONE, PALETTE.worldGlow, 0.25), 0.55);
        }),
      ),
    );
    const belly = k.part('belly', (pen) => pen.shape([[-42, 0], [-46, 22], [-20, 36], [10, 36], [36, 20], [40, 0]], farStone, { round: 0.8 }));
    const head = k.part('head', (pen) =>
      pen.shape(HEAD, stone, {}, (p) => {
        // a heavy brow, and a mouth that is a crack
        p.hard([[-10, 9], [8, 10], [24, 3], [9, 2.5]]).fill(DARK, 0.8);
        crack(p, [[2, -8], [11, -5], [22, -6]]);
      }),
    );
    const eyes = k.part('eyes', (pen) => {
      pen.ellipse(0, 0, 2.6, 3.4).fill(PALETTE.whiteHot);
      pen.ellipse(8.5, -0.5, 2.3, 3).fill(PALETTE.whiteHot);
    });
    const eyeGlow = k.glow(RUNE, 34, 0);

    // ------------------------------------------------------------------------------------------ the slab
    const slab = k.part('slab', (pen) =>
      pen.shape(SLAB, stone, { round: 0 }, (p) => {
        // courses of stone, cracks, the chipped corner
        p.line([-SLAB_W + 1, 38], [-1, 40]).stroke(DARK, 1.4, 0.8);
        p.line([-SLAB_W + 1, 78], [-1, 76]).stroke(DARK, 1.4, 0.8);
        crack(p, [[-20, 118], [-14, 100], [-18, 88]]);
        crack(p, [[-6, 30], [-12, 16], [-5, 4]]);
        p.hard([[-SLAB_W, 0], [-SLAB_W + 7, 0], [-SLAB_W, 9]]).fill(mix(STONE, DARK, 0.5));
        // moss along the foot
        for (let i = 0; i < 4; i++) p.ellipse(-20 + i * 5.5, 3, 3.4, 1.9).fill(mix(STONE, PALETTE.worldGlow, 0.2), 0.6);
      }),
    );
    // the runes: cut into the slab, and a light over them that comes with the warning
    const runes = k.part('runes', (pen) => {
      pen.circle(-13, 78, 8.5).stroke(RUNE, 1.7, 0.95);
      pen.line([-13, 69], [-13, 87]).stroke(RUNE, 1.5, 0.9);
      pen.line([-20, 78], [-6, 78]).stroke(RUNE, 1.5, 0.9);
      pen.contour([[-19, 52], [-13, 60], [-7, 52], [-13, 46]], { round: 0 }).stroke(RUNE, 1.6, 0.9);
      pen.line([-19, 32], [-7, 32]).stroke(RUNE, 1.5, 0.85);
      pen.circle(-13, 22, 3).stroke(RUNE, 1.4, 0.85);
    });
    runes.blendMode = 'add';
    const runeGlow = k.glow(RUNE, 96, 0);
    const arm = new Leg(k, 'arm', { l1: 30, l2: 32, w0: 22, w1: 19, w2: 17, mat: limbStone, foot: (pen, l2) => pen.hard([[l2 - 2, 10], [l2 + 12, 8], [l2 + 13, -8], [l2 - 2, -9]]).fill(mix(STONE, DARK, 0.25)) });
    const dust = new Motes(k, 9, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 18, 0.3);
    const flecks = new Motes(k, 6, PALETTE.worldGlow, 7, 0.7);

    slabPivot.addChild(slab, runes, runeGlow);
    body.addChild(belly, ...plates, head, eyes, eyeGlow);
    root.addChild(legs[0]!.root, legs[1]!.root, body, legs[2]!.root, legs[3]!.root, arm.root, slabPivot, dust, flecks);
    plates.forEach((pl, i) => place(pl, PLATES[i]!.at[0], PLATES[i]!.at[1]));
    place(belly, 0, 0);
    runeGlow.position.set(-13, -62);

    // ------------------------------------------------------------------------------------------ motion
    let walk = k.seed * 2;
    let rise = 0;
    let rune = 0;
    let down = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const windup = f.anim === 'telegraph';
        const smash = f.anim === 'attack';
        const spent = f.phase === 'recovery';
        const speed = Math.abs(f.vx);
        const stepping = speed > 0.25 && !windup && !smash && !spent && !dead;

        // the slab's angle: upright (0), heaved back over the shoulder (negative), lying on the floor in front (≈ 1.52)
        let angle = 0;
        let lift = 0;
        if (windup) {
          angle = -0.62 * easeOut(Math.min(1, f.p * 1.3));
          lift = 16 * easeOut(f.p);
        } else if (smash) {
          // it falls, with all its weight: slowly at first, then the floor
          angle = -0.62 + 2.14 * easeIn(Math.min(1, f.p * 1.4));
          lift = 16 * (1 - Math.min(1, f.p * 2));
        } else if (spent) {
          // lying there while the dust settles; only at the end does it get the slab up again
          angle = 1.52 * (1 - easeInOut(Math.max(0, (f.p - 0.68) / 0.32)));
        } else if (dead) {
          angle = 1.52 * easeIn(Math.min(1, f.dying * 1.6));
        } else if (f.anim === 'hurt') angle = 0.06 * Math.sin(f.t * 40) * f.hurt;
        else angle = 0.025 * Math.sin(f.t * 1.6) + (stepping ? 0.03 * Math.sin(walk * 6.283 * 2) : 0);
        const ang = dt > 0 && !smash ? damp(down, angle, 18, dt) : angle;
        down = ang;
        const guarding = ang < 0.3;
        rise = dt > 0 ? damp(rise, windup ? 1 : 0, 10, dt) : rise;
        rune = dt > 0 ? damp(rune, windup ? easeIn(f.p) : smash ? 1 - f.p * 0.7 : guarding && !spent ? 0.18 : 0, 14, dt) : rune;

        // the walk: a stomp, slow; the whole body drops on each step
        if (stepping) walk += dt * (0.5 + speed * 0.5);
        const bob = stepping ? -3.2 * Math.abs(Math.sin(walk * Math.PI * 2)) : 0.7 * Math.sin(f.t * 1.5);
        const lunge = smash ? 10 * Math.sin(Math.min(1, f.p * 1.6) * Math.PI * 0.5) : 0;
        const by = 36 + bob + 5 * rise - (spent ? 4 * (1 - f.p) : 0) - (dead ? 10 * easeOut(f.dying) : 0);

        place(body, -4 + lunge - 4 * f.hurt, by, -0.05 * (smash ? 1 : 0) + 0.04 * f.hurt + (spent ? -0.04 : 0) + (windup ? 0.05 * f.p : 0), 1 + (spent ? 0.02 : 0), dead ? 1 - 0.3 * f.dying : 1);
        // the shell's plates shift a little as it breathes, and fly apart when it dies
        plates.forEach((pl, i) => {
          if (dead) {
            const sgn = i === 0 ? -1 : i === 2 ? 1 : 0.2;
            flung(pl, PLATES[i]!.at, [sgn * 55, 30 + i * 8], sgn * 2.2, 160, -by + 14, f.dying);
            pl.alpha = f.dying > 0.7 ? 1 - (f.dying - 0.7) / 0.3 : 1;
          } else {
            place(pl, PLATES[i]!.at[0], PLATES[i]!.at[1] + 0.5 * Math.sin(f.t * 1.5 + i), 0.02 * Math.sin(f.t * 1.5 + i * 2));
            pl.alpha = 1;
          }
        });
        place(head, 30 + lunge * 0.5, 50 + (spent ? 2 * Math.sin(f.t * 5) : 0) + 4 * rise, windup ? -0.12 * f.p : spent ? -0.28 + 0.1 * Math.sin(f.t * 5) : dead ? -0.5 * f.dying : 0);
        const open = dead ? 0.1 : 1 - 0.85 * f.hurt;
        place(eyes, 32 + lunge * 0.5, 56 + 4 * rise, 0, 1, Math.max(0.1, open));
        eyeGlow.position.set(36 + lunge * 0.5, -(56 + 4 * rise));
        eyeGlow.alpha = Math.min(1, (0.25 + 0.75 * f.heat) * open) * (spent ? 0.35 : 1);
        eyeGlow.scale.set((24 + 22 * f.heat) / eyeGlow.texture.width);

        // the legs: pillars that stomp
        const hipX = [-30, 10, -22, 20] as const;
        legs.forEach((leg, i) => {
          const far = i < 2;
          const front = i % 2 === 1;
          const hipH = by - 8;
          const ph = walk + (front ? 0.5 : 0) + (far ? 0.25 : 0);
          const c = footCycle(ph, 12, 8);
          const fx = (front ? 6 : -4) + (stepping ? c.x : 0) - (smash ? -6 : 0);
          const fy = stepping ? c.y : 0;
          leg.root.position.set(hipX[i]!, -hipH);
          leg.reach(fx, -hipH + 9 + fy, front ? 1 : -1);
        });

        // the slab, and the arm that holds it: the pivot is its front-bottom corner on the floor
        slabPivot.position.set(SLAB_X + lunge * 0.6, -(lift));
        slabPivot.rotation = ang; // (a positive angle tips it forward, which is clockwise: y is down)
        const wobbleSlab = f.anim === 'hurt' ? Math.sin(f.t * 55) * 1.4 * f.hurt : 0;
        slabPivot.position.x += wobbleSlab;
        // the grip: where the arm's hand is on the slab's back edge, carried by the slab as it turns
        const gx = -SLAB_W - 2;
        const gy = 52;
        const cs = Math.cos(-ang);
        const sn = Math.sin(-ang);
        const handX = SLAB_X + lunge * 0.6 + wobbleSlab + (gx * cs - gy * sn) * 1;
        const handY = lift + (gx * sn + gy * cs);
        const shoulder: Pt = [2 + lunge, by + 18];
        arm.root.position.set(shoulder[0], -shoulder[1]);
        arm.reach(handX - shoulder[0], handY - shoulder[1], -1);

        // the runes: dark and quiet in the guard, alight with the warning, and out again when it is spent
        runes.alpha = Math.min(1, rune * 1.3);
        runeGlow.alpha = Math.min(0.9, rune * 0.9);
        runeGlow.scale.set((70 + 40 * rune) / runeGlow.texture.width);

        // the dust of the fall, and the flecks that come off the slab when it lands
        const landed = smash ? Math.max(0, (f.p - 0.55) / 0.45) : spent ? Math.max(0, 1 - f.p * 1.5) : 0;
        dust.position.set(SLAB_X + 60, 0);
        dust.show(f.t, 0, 12, 140, 36, 0.5, landed > 0 ? 0.55 * Math.min(1, landed * 2) : 0);
        flecks.position.set(SLAB_X + 40, 0);
        flecks.show(f.t, 0, 20, 100, 50, 0.9, smash && f.p > 0.55 ? 0.8 * (1 - f.p) * 2 : 0);
      },
    };
  },
};
