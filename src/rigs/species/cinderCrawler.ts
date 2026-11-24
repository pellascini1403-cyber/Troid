import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens, scorched } from '../kit/materials';
import { easeOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE CINDER CRAWLER (docs/PROMPT24-LOG.md): the second half's charger, and nothing like the thorn-beast of the first: a beetle of slag. A high dome of two wing-cases split down the middle and cracked all over with light, six stubby
 * legs, a head with a long forward-curving horn and two coals for eyes, embers rising from the seams. Its warning is the shell: through the wind-up the wing-cases LIFT on their hinge at the back, the hot back showing under them
 * and the little wings trembling, the horn going down; the charge is a low gallop with the cases half open and a tail of sparks; and when it hits a wall it lands on its horn, cases askew and legs splayed. Dead, the cases fall off and the light goes out.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const SHELL = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.35);
const HIP_Y = 20;

/** One wing-case: the dome's half, hinged at the back (the origin is the hinge, x forward). */
const CASE: readonly Pt[] = [[0, 0], [4, 24], [20, 40], [46, 46], [70, 38], [88, 20], [90, 4], [60, -2], [30, -3]];
const HEAD: readonly Pt[] = [[-8, -8], [-10, 6], [2, 14], [18, 12], [30, 2], [26, -8], [10, -12]];
const HORN: readonly Pt[] = [[0, 9], [12, 11], [26, 19], [40, 32], [30, 14], [16, 2], [3, -4]];

export const CINDER_CRAWLER_RIG: RigDef = {
  id: 'cinder_crawler',
  width: 1.2,
  height: 0.75,
  shadow: 120,
  aura: { color: RIM, at: [0, 36], size: 200, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('cinder-crawler');
    const body = k.group('body');
    const shell = scorched(SHELL, RIM, { gloss: lens([30, 36], 18, 3.4, -0.1, HOT, 0.18), width: 2.2 });
    const farShell = scorched(mix(SHELL, PALETTE.enemyInk, 0.5), mix(RIM, PALETTE.enemyInk, 0.55), { width: 1.4 });
    const limb = ink(RIM, { width: 1.6 });
    const farLimb = ink(mix(RIM, PALETTE.enemyInk, 0.55), { fill: mix(PALETTE.enemyInk, DEEP, 0.3), width: 1.1 });

    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 2.6], [l2 + 8, 0], [l2 - 1, -2.6]]).fill(DEEP);
    };
    const mkLeg = (i: number, far: boolean) => new Leg(k, `${far ? 'far' : 'near'}${i}`, { l1: 13, l2: 15, w0: far ? 8 : 9, w1: 6.4, w2: 3.6, mat: far ? farLimb : limb, foot });
    const farLegs = [0, 1, 2].map((i) => mkLeg(i, true));
    const nearLegs = [0, 1, 2].map((i) => mkLeg(i, false));

    // the back under the cases: glowing, with the little wings folded on it
    const back = k.part('back', (pen) => {
      pen.shape([[0, 0], [8, 22], [40, 34], [78, 26], [90, 4], [50, -2]], scorched(mix(DEEP, PALETTE.enemyInk, 0.4), HOT, { width: 1 }), { round: 0.9 }, (p) => {
        p.contour([[10, 8], [36, 16], [70, 10]], { closed: false }).stroke(HOT, 2.2, 0.9);
        p.contour([[14, 3], [44, 8], [76, 3]], { closed: false }).stroke(RIM, 1.4, 0.7);
      });
    });
    const wings = [0, 1].map((i) => k.part(`wing${i}`, (pen) => pen.shape([[0, 0], [30, 5], [66, 4], [74, -1], [40, -4]], { fill: mix(PALETTE.enemyInk, HOT, 0.2), alpha: 0.72, rims: [] }, { sharp: [3] })));
    const crack = (p: Pen, pts: Pt[], w = 2.4): void => {
      p.contour(pts, { closed: false, round: 0.3 }).stroke(DEEP, w + 1.4, 0.95);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(RIM, w, 0.95);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(HOT, w * 0.45, 0.9);
    };
    const mkCase = (key: string, far: boolean) =>
      k.part(key, (pen) =>
        pen.shape(CASE, far ? farShell : shell, { round: 0.8 }, (p) => {
          if (far) return;
          // the cracks that run over the dome, and the plates between them
          crack(p, [[8, 8], [14, 24], [32, 30], [44, 42]]);
          crack(p, [[34, 2], [40, 18], [60, 26], [74, 36]], 2);
          crack(p, [[62, -1], [66, 12], [84, 18]], 1.8);
          crack(p, [[22, 36], [28, 32]], 1.4);
        }),
      );
    const caseFar = mkCase('case-far', true);
    const caseNear = mkCase('case-near', false);
    const head = k.group('head');
    const skull = k.part('skull', (pen) => pen.shape(HEAD, scorched(SHELL, RIM, { gloss: lens([8, 4], 7, 2.2, -0.2, HOT, 0.2), width: 1.8 }), {}, (p) => crack(p, [[-4, 0], [6, 7], [14, 2]], 1.5)));
    const horn = k.part('horn', (pen) => pen.shape(HORN, scorched(mix(SHELL, DEEP, 0.4), HOT, { width: 1.8 }), { sharp: [3], round: 0.6 }, (p) => p.contour([[4, 6], [26, 16], [44, 36]], { closed: false }).stroke(HOT, 1, 0.6)));
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 3.4, 4).fill(HOT);
      pen.ellipse(0.8, 0, 1.5, 3.4).fill(PALETTE.enemyInk);
    });
    const eyeGlow = k.glow(HOT, 34, 0);
    const backGlow = k.glow(RIM, 150, 0);
    const embers = new Motes(k, 12, HOT, 7, 0.1);
    const sparks = new Motes(k, 8, HOT, 6, 0.6);
    const chips = [0, 1, 2, 3].map((i) => k.part(`chip${i}`, (pen) => pen.shape([[0, 0], [16 + i * 3, 7], [22, 20], [4, 14]], shell, { round: 0.3 })));
    for (const c of chips) c.visible = false;

    head.addChild(skull, horn, eye, eyeGlow);
    body.addChild(back, ...wings, backGlow, caseFar, caseNear, embers, head, ...chips);
    root.addChild(farLegs[0]!.root, farLegs[1]!.root, farLegs[2]!.root, body, nearLegs[0]!.root, nearLegs[1]!.root, nearLegs[2]!.root, sparks);
    place(skull, 0, 0);
    place(horn, 18, 6);
    place(eye, 14, 5);
    eyeGlow.position.set(14, -5);

    let cycle = k.seed * 3;
    let open = 0;
    let dip = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const rush = f.anim === 'attack';
        const dazed = f.anim === 'land';
        const speed = Math.abs(f.vx);

        // the cases: shut, lifting through the wind-up, half open on the charge, askew when it is dazed, gone when it is dead
        const wantOpen = wind ? 0.25 + 0.75 * easeOut(f.p) : rush ? 0.4 : dazed ? 0.55 : f.anim === 'alert' ? 0.15 : f.phase === 'recovery' ? 0.3 * (1 - f.p) : 0;
        open = dt > 0 ? damp(open, wantOpen, 12, dt) : open;
        dip = dt > 0 ? damp(dip, wind ? 0.5 + 0.5 * f.p : rush ? 0.7 : dazed ? 0.8 : 0, 12, dt) : dip;
        cycle += dt * (rush ? 4 : speed > 0.2 ? 0.55 + speed * 0.5 : 0);
        const moving = speed > 0.2 || rush;

        const shake = wind ? Math.sin(f.t * 62) * 0.8 * f.p : 0;
        const by = HIP_Y + 14 - 8 * dip + (moving ? 1.4 * Math.sin(cycle * TAU * 2) : 0.7 * Math.sin(f.t * 2)) - (dead ? 6 * easeOut(f.dying) : 0);
        const pitch = (rush ? -0.06 : 0) + (dazed ? -0.2 + 0.06 * Math.sin(f.t * 8) : 0) - 0.25 * f.hurt + (f.anim === 'alert' ? 0.1 * (1 - f.p) : 0);
        place(body, shake - 5 * f.hurt, by, pitch);
        const hinge: Pt = [-46, 12];
        const lift = open * 0.62 + (dazed ? 0.1 * Math.sin(f.t * 9) : 0);
        place(caseNear, hinge[0], hinge[1], lift + 0.02 * Math.sin(f.t * 1.6) + (dazed ? 0.12 : 0), 1, dead ? 1 - 0.0 : 1);
        place(caseFar, hinge[0] + 2, hinge[1] + 1, lift * 0.85 - (dazed ? 0.08 : 0), 0.96, 0.96);
        place(back, hinge[0], hinge[1] - 2);
        wings.forEach((w, i) => {
          w.visible = open > 0.15;
          place(w, hinge[0] + 6, hinge[1] + 6, 0.08 + lift * 0.35 + 0.25 * Math.sin(f.t * (40 + i * 7)) * open, 1, 1);
        });
        place(back, hinge[0], hinge[1] - 2);
        backGlow.position.set(-4, -(24));
        backGlow.alpha = Math.min(1, (0.1 + 0.9 * open * (wind ? 1.2 : 0.8)) * (dead ? 1 - f.dying : 1));
        backGlow.scale.set((110 + 70 * open) / backGlow.texture.width);

        // the head: low with the charge, up with the alert, the horn driven down in the daze
        const hLift = (f.anim === 'alert' ? 6 * (1 - f.p) : 0) - (rush ? 4 : 0) - (dazed ? 8 : 0);
        place(head, 52, 20 + hLift, (wind ? -0.25 * f.p : 0) + (dazed ? -0.5 : 0) + (rush ? -0.1 : 0) + 0.04 * Math.sin(f.t * 1.7));
        place(horn, 18, 6, -0.06 * Math.sin(f.t * 3));
        const eyeOpen = dead ? 0.1 : 1 - 0.85 * f.hurt;
        eye.scale.set(1 + 0.4 * f.heat, Math.max(0.1, eyeOpen) * (1 + 0.3 * f.heat));
        eyeGlow.alpha = Math.min(1, (0.3 + 0.8 * f.heat) * eyeOpen) * (dead ? 0 : 1);
        eyeGlow.scale.set((28 + 26 * f.heat) / eyeGlow.texture.width);

        // six legs
        const hips = [-34, -2, 30] as const;
        const stride = rush ? 24 : 11;
        const mk = (leg: Leg, i: number, far: boolean): void => {
          const fc = footCycle(cycle + (i % 2 ? 0.5 : 0) + (far ? 0.5 : 0), stride, rush ? 8 : 6);
          const hipH = by - 4;
          leg.root.position.set(hips[i]! + (far ? -4 : 0), -hipH);
          let fx = (far ? 8 : 3) + (moving ? fc.x : 0);
          let fy = moving ? fc.y : 0;
          if (wind && i === 2) {
            const w = f.t * 15 + (far ? Math.PI : 0);
            fx += 10 + 6 * Math.sin(w);
            fy += Math.max(0, -Math.cos(w)) * 7;
          }
          if (dazed) fx += (i - 1) * 9;
          if (dead) {
            fx = 6 * (1 - f.dying);
            fy = 10 * easeOut(f.dying);
          }
          leg.reach(fx, -hipH + 4 + fy, i === 0 ? -1 : 1);
        };
        farLegs.forEach((l, i) => mk(l, i, true));
        nearLegs.forEach((l, i) => mk(l, i, false));

        // embers from the seams, thicker as it heats; sparks behind it when it charges; the cases fly off when it dies
        embers.position.set(0, -by - 20);
        embers.show(f.t, 0, 0, 90, 46, 0.7, (0.25 + 0.7 * open) * (dead ? Math.max(0, 1 - f.dying * 1.5) : 1));
        sparks.position.set(-60, -6);
        sparks.show(f.t, 0, 0, 50, 24, 2, rush ? 0.9 : 0);
        chips.forEach((c, i) => {
          c.visible = dead && f.dying > 0.1;
          if (c.visible) {
            flung(c, [-10 + i * 30, 36], [(i - 1.5) * 34, 36 + i * 6], (i - 1.5) * 3, 170, -by + 2, Math.min(1, (f.dying - 0.1) * 1.4));
            c.alpha = 1 - Math.max(0, (f.dying - 0.65) / 0.35);
          }
        });
        if (dead) {
          const g = Math.min(1, f.dying * 2.4);
          caseNear.alpha = caseFar.alpha = 1 - g;
        } else caseNear.alpha = caseFar.alpha = 1;
      },
    };
  },
};
