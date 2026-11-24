import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeInOut, easeOut, footCycle } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE BASALT GUARD (docs/PROMPT24-LOG.md): it has the stoneback's rule — a blow from the front is turned away by what it holds up — and nothing else of it: a sentinel that stands on two legs, built of hexagonal basalt columns, a helm with
 * one slit of ember for a visor and a tower shield made of three columns with a coal at its boss. Its cracks glow between the columns like the seams of a forge. The smash is the shield itself: heaved up and back over the shoulder, runes of
 * heat in every seam, then brought down on the floor in front of it with the whole body behind it; with the shield lying there the guard is open — chest bare, visor dim, one hand still on the shield — and only at the end does it haul it up again.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const BASALT = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.55);
const DARK = PALETTE.worldVoid;

const SH_W = 40;
const SH_H = 126;
const SH_X = 78;
const SHIELD: readonly Pt[] = [[-SH_W, 0], [0, 0], [0, SH_H - 14], [-6, SH_H + 4], [-SH_W / 2, SH_H - 4], [-SH_W + 8, SH_H + 6], [-SH_W, SH_H - 12]];
const TORSO: readonly Pt[] = [[-32, 66], [-37, 96], [-30, 126], [-8, 138], [16, 134], [34, 120], [38, 92], [30, 66], [0, 58]];
const HELM: readonly Pt[] = [[-15, 0], [-17, 20], [-8, 35], [10, 36], [19, 20], [17, 0], [0, -4]];

export const BASALT_GUARD_RIG: RigDef = {
  id: 'basalt_guard',
  width: 1.5,
  height: 1.55,
  shadow: 150,
  aura: { color: RIM, at: [10, 90], size: 230, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('basalt-guard');
    const body = k.group('body');
    const slabPivot = k.group('shield-pivot');
    const stone = scorched(BASALT, RIM, { gloss: lens([-10, 106], 14, 3.2, -0.3, HOT, 0.1), width: 2.6 });
    const limb = scorched(BASALT, RIM, { width: 2 });
    const farLimb = scorched(mix(BASALT, DARK, 0.5), mix(RIM, DARK, 0.6), { width: 1.3 });
    const seam = (p: Pen, pts: Pt[], w = 2): void => {
      p.contour(pts, { closed: false, round: 0 }).stroke(DEEP, w + 1.2, 0.95);
      p.contour(pts, { closed: false, round: 0 }).stroke(RIM, w, 0.95);
      p.contour(pts, { closed: false, round: 0 }).stroke(HOT, w * 0.4, 0.85);
    };

    const boot = (pen: Pen, l2: number): void => {
      pen.shape([[l2 - 8, 11], [l2 + 18, 9], [l2 + 22, -10], [l2 - 8, -11]], scorched(mix(BASALT, DARK, 0.3), RIM, { width: 1.4 }), { round: 0.3 });
    };
    const legs = [0, 1, 2, 3].map((i) => new Leg(k, `leg${i}`, { l1: 34, l2: 36, w0: i < 2 ? 26 : 30, w1: i < 2 ? 22 : 25, w2: i < 2 ? 19 : 22, mat: i < 2 ? farLimb : limb, foot: boot }));
    const pelvis = k.part('pelvis', (pen) => pen.shape([[-26, 0], [-28, 14], [-14, 22], [14, 22], [28, 14], [26, 0], [0, -4]], limb, { round: 0.4 }, (p) => seam(p, [[-8, 2], [-6, 16]], 1.4)));
    const torso = k.part('torso', (pen) =>
      pen.shape(TORSO, stone, { round: 0.5 }, (p) => {
        // the columns that make the chest, and the heat between them
        for (const x of [-18, -2, 14, 28]) seam(p, [[x, 64], [x - 2, 90], [x + 1, 124]], 1.7);
        seam(p, [[-30, 100], [-8, 106], [16, 100], [34, 98]], 1.3);
        p.hard([[-4, 128], [8, 132], [10, 124]]).fill(HOT, 0.5);
      }),
    );
    const pauldron = (key: string, far: boolean) =>
      k.part(key, (pen) => pen.shape([[-20, 0], [-22, 14], [-12, 26], [12, 28], [24, 14], [22, 0], [0, -6]], far ? farLimb : stone, { round: 0.3 }, (p) => {
        if (!far) {
          seam(p, [[-8, 0], [-6, 22]], 1.4);
          seam(p, [[8, 0], [9, 22]], 1.4);
        }
      }));
    const pauldronNear = pauldron('pauldron-near', false);
    const pauldronFar = pauldron('pauldron-far', true);
    const head = k.group('head');
    const helm = k.part('helm', (pen) =>
      pen.shape(HELM, stone, { round: 0.4 }, (p) => {
        p.hard([[-15, 18], [18, 20], [18, 8], [-15, 8]]).fill(PALETTE.enemyInk, 0.9); // the visor
        p.hard([[-4, 36], [4, 36], [2, 48], [-2, 48]]).fill(mix(BASALT, DEEP, 0.3)); // a column for a crest
      }),
    );
    const visor = k.part('visor', (pen) => pen.shape([[-14, 0], [15, 0.6], [17, 4], [-14, 4]], { fill: HOT, rims: [] }, { round: 0.3 }));
    const visorGlow = k.glow(HOT, 60, 0);
    const armNear = new Leg(k, 'arm-near', { l1: 32, l2: 34, w0: 24, w1: 20, w2: 18, mat: limb, foot: (pen, l2) => pen.shape([[l2 - 3, 12], [l2 + 14, 10], [l2 + 15, -10], [l2 - 3, -11]], scorched(mix(BASALT, DEEP, 0.2), RIM, { width: 1.2 }), { round: 0.3 }) });
    const armFar = new Leg(k, 'arm-far', { l1: 30, l2: 32, w0: 22, w1: 18, w2: 16, mat: farLimb, foot: (pen, l2) => pen.shape([[l2 - 3, 11], [l2 + 12, 9], [l2 + 13, -9], [l2 - 3, -10]], farLimb, { round: 0.3 }) });

    const shield = k.part('shield', (pen) =>
      pen.shape(SHIELD, stone, { round: 0 }, (p) => {
        // three columns, their seams alight, and a coal at the boss
        seam(p, [[-SH_W / 3 * 2, 2], [-SH_W / 3 * 2, SH_H - 8]], 1.8);
        seam(p, [[-SH_W / 3, 2], [-SH_W / 3, SH_H - 8]], 1.8);
        p.circle(-SH_W / 2, SH_H * 0.52, 14).fill(PALETTE.enemyInk);
        p.circle(-SH_W / 2, SH_H * 0.52, 14).stroke(RIM, 2, 0.95);
        p.circle(-SH_W / 2, SH_H * 0.52, 9).fill(DEEP);
        p.circle(-SH_W / 2, SH_H * 0.52, 6).fill(RIM);
        p.circle(-SH_W / 2, SH_H * 0.52, 3).fill(HOT);
        p.hard([[-SH_W, 0], [-SH_W + 9, 0], [-SH_W, 10]]).fill(mix(BASALT, DARK, 0.5));
      }),
    );
    const bossGlow = k.glow(HOT, 80, 0);
    const dust = new Motes(k, 9, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 18, 0.3);
    const embers = new Motes(k, 10, HOT, 7, 0.7);
    const chunks = [0, 1, 2, 3, 4].map((i) => k.part(`chunk${i}`, (pen) => pen.shape([[0, 0], [14 + i * 2, 4], [18, 22 + i * 3], [3, 28]], stone, { round: 0.2 })));
    for (const c of chunks) c.visible = false;

    slabPivot.addChild(shield, bossGlow);
    body.addChild(pelvis, torso, pauldronFar, head, visorGlow);
    head.addChild(helm, visor);
    root.addChild(legs[0]!.root, legs[1]!.root, armFar.root, body, legs[2]!.root, legs[3]!.root, pauldronNear, armNear.root, slabPivot, dust, embers, ...chunks);

    let walk = k.seed * 2;
    let angle = 0;
    let heat = 0;

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

        let want = 0;
        let lift = 0;
        if (windup) {
          want = -0.62 * easeOut(Math.min(1, f.p * 1.3));
          lift = 18 * easeOut(f.p);
        } else if (smash) {
          want = -0.62 + 2.14 * easeIn(Math.min(1, f.p * 1.4));
          lift = 18 * (1 - Math.min(1, f.p * 2));
        } else if (spent) want = 1.52 * (1 - easeInOut(Math.max(0, (f.p - 0.68) / 0.32)));
        else if (dead) want = 1.52 * easeIn(Math.min(1, f.dying * 1.6));
        else if (f.anim === 'hurt') want = 0.05 * Math.sin(f.t * 40) * f.hurt;
        else want = 0.02 * Math.sin(f.t * 1.5) + (stepping ? 0.03 * Math.sin(walk * 12.5) : 0);
        angle = dt > 0 && !smash ? damp(angle, want, 18, dt) : want;
        heat = dt > 0 ? damp(heat, windup ? easeIn(f.p) : smash ? 1 - f.p * 0.7 : angle < 0.3 && !spent ? 0.12 : 0, 12, dt) : heat;
        if (stepping) walk += dt * (0.5 + speed * 0.45);

        const bob = stepping ? -3 * Math.abs(Math.sin(walk * Math.PI * 2)) : 0.8 * Math.sin(f.t * 1.5);
        const lunge = smash ? 12 * Math.sin(Math.min(1, f.p * 1.6) * Math.PI * 0.5) : 0;
        const hipY = 70 + bob + 4 * (windup ? f.p : 0) - (spent ? 5 * (1 - f.p) : 0) - (dead ? 22 * easeOut(f.dying) : 0);
        const lean = (windup ? -0.1 * f.p : 0) + (smash ? 0.12 * Math.min(1, f.p * 1.6) : 0) + (spent ? 0.06 : 0) + 0.04 * f.hurt - (dead ? 0.5 * f.dying : 0);
        place(body, -6 + lunge - 4 * f.hurt, hipY - 66, -lean);
        place(pelvis, 0, 66);
        place(torso, 0, 0);
        place(pauldronNear, 8 + lunge - 6 + 0, hipY + 64 + (windup ? 8 * f.p : 0), -lean * 0.8 + 0.06 * Math.sin(f.t * 1.5));
        place(pauldronFar, -10, 126 + (windup ? 6 * f.p : 0), 0.05);
        place(head, 6 + lunge * 0.3, 138 + (windup ? 4 * f.p : 0) - (spent ? 6 : 0), -0.05 * Math.sin(f.t * 1.2) + (windup ? 0.12 * f.p : 0) + (spent ? -0.2 : 0) - (dead ? 0.4 * f.dying : 0));
        const open = dead ? 0.1 : 1 - 0.8 * f.hurt;
        place(visor, -1, 22, 0, 1, Math.max(0.1, open) * (1 + 0.8 * heat));
        visor.alpha = 0.4 + 0.6 * Math.min(1, f.heat + 0.2);
        visorGlow.position.set(6 + lunge * 0.3 + 3, -(138 + 24 + (windup ? 4 * f.p : 0) - (spent ? 6 : 0)));
        visorGlow.alpha = Math.min(1, 0.2 + 0.8 * f.heat) * (spent ? 0.4 : 1) * (dead ? 0 : 1);
        visorGlow.scale.set((50 + 40 * f.heat) / visorGlow.texture.width);

        // the legs: two pillars that stamp
        const hipX = [-14, 8, -8, 14] as const;
        legs.forEach((leg, i) => {
          const far = i < 2;
          const front = i % 2 === 1;
          const c = footCycle(walk + (front ? 0.5 : 0) + (far ? 0.25 : 0), 18, 9);
          leg.root.position.set(hipX[i]!, -(hipY));
          leg.reach((front ? 8 : -8) + (stepping ? c.x : 0) + (smash ? 5 : 0), -hipY + 10 + (stepping ? c.y : 0), front ? 1 : -1);
        });

        // the shield: pivot at its front-bottom corner on the floor; the arm that carries it follows the grip
        slabPivot.position.set(SH_X + lunge * 0.7, -lift);
        slabPivot.rotation = angle;
        const gx = -SH_W - 2;
        const gy = 60;
        const cs = Math.cos(-angle);
        const sn = Math.sin(-angle);
        const hx = SH_X + lunge * 0.7 + (gx * cs - gy * sn);
        const hy = lift + (gx * sn + gy * cs);
        const shoulder: Pt[] = [[10 + lunge, hipY + 60], [-2 + lunge, hipY + 62]];
        [armNear, armFar].forEach((arm, i) => {
          arm.root.position.set(shoulder[i]![0], -shoulder[i]![1]);
          arm.reach(hx - shoulder[i]![0] + (i ? -8 : 0), hy - shoulder[i]![1] + (i ? 24 : 0), -1);
        });
        const rune = Math.min(1, heat * 1.3);
        bossGlow.position.set(-SH_W / 2, -(SH_H * 0.52));
        bossGlow.alpha = Math.min(0.95, 0.12 + 0.9 * rune);
        bossGlow.scale.set((50 + 60 * rune) / bossGlow.texture.width);

        const landed = smash ? Math.max(0, (f.p - 0.55) / 0.45) : spent ? Math.max(0, 1 - f.p * 1.5) : 0;
        dust.position.set(SH_X + 70, 0);
        dust.show(f.t, 0, 12, 150, 36, 0.5, landed > 0 ? 0.55 * Math.min(1, landed * 2) : 0);
        embers.position.set(SH_X + 40, 0);
        embers.show(f.t, 0, 20, 110, 56, 1, smash && f.p > 0.55 ? 0.9 * (1 - f.p) * 2 : windup ? 0.5 * f.p : 0);
        // dead: the columns come apart
        chunks.forEach((c, i) => {
          c.visible = dead && f.dying > 0.1;
          if (c.visible) {
            flung(c, [(i - 2) * 16, 90 + (i % 2) * 20], [(i - 2) * 38, 50 + i * 8], (i - 2) * 2.4, 190, 2, Math.min(1, (f.dying - 0.1) * 1.4));
            c.alpha = 1 - Math.max(0, (f.dying - 0.7) / 0.3);
          }
        });
        if (dead) {
          const g = Math.min(1, f.dying * 1.8);
          torso.alpha = pelvis.alpha = pauldronNear.alpha = pauldronFar.alpha = helm.alpha = 1 - g * 0.9;
        } else torso.alpha = pelvis.alpha = pauldronNear.alpha = pauldronFar.alpha = helm.alpha = 1;
      },
    };
  },
};
