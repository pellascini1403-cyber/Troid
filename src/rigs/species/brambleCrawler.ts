import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens, solid } from '../kit/materials';
import { easeIn, easeOut, footCycle, TAU, tentacle, wobble } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE BRAMBLE CRAWLER (docs/PROMPT24-LOG.md): a low beast made of black thorn-vine — a long dome of woven bramble on six jointed legs, a spade of a head with three eyes in a row and two hooked mandibles, a crest of pale thorns
 * down its back and a thorned tail. It charges in one straight line, so everything about it is a warning of that line: it settles, the front legs SCRAPE the ground, the crest bristles and the mandibles open; the charge is a
 * flat gallop with the crest laid back; and when it hits a wall it is dazed — head down, legs splayed, thorns shaken loose — which is the opening. Dead, it comes apart: the thorns fly off and the vines fall in a heap.
 */

const RIM = PALETTE.worldGlow;
const THORN = mix(PALETTE.worldHaze, PALETTE.worldGlow, 0.35);
const HALO = PALETTE.violetCore;

const BODY_Y = 33;
const CARAPACE: readonly Pt[] = [[-49, -4], [-45, 10], [-31, 19.5], [-8, 22.5], [15, 20.5], [35, 12.5], [47, 2], [45, -8], [20, -12.5], [-10, -13.5], [-39, -11.5]];
const HEAD: readonly Pt[] = [[-3, 9], [8, 10.5], [19, 8], [28, 2], [31, -3.5], [23, -9.5], [9, -10.5], [-2, -5]];
const MANDIBLE: readonly Pt[] = [[0, 2.2], [6, -3.2], [12, -3.6], [16.5, 1.8], [11, -0.2], [5.5, 0.6]];

/** The thorns of the crest: where they stand along the back (x, y of the foot on the carapace, body space), how tall and how much they lean. */
const CREST: ReadonlyArray<readonly [number, number, number, number]> = [
  [-40, 12, 12, 0.45], [-31, 18, 17, 0.3], [-21, 21, 21, 0.2], [-10, 22.5, 24, 0.1], [1, 22.5, 22, 0], [12, 21, 21, -0.1], [23, 17, 17, -0.22], [32, 12, 13, -0.35],
];
const HIPS = [-30, 2, 31] as const;

export const BRAMBLE_CRAWLER_RIG: RigDef = {
  id: 'bramble_crawler',
  width: 1.1,
  height: 0.7,
  shadow: 120,
  aura: { color: HALO, at: [0, 30], size: 190, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('bramble-crawler');
    const body = k.group('body');
    const skin = ink(RIM, { gloss: lens([-12, 14], 11, 3.2, -0.08, PALETTE.worldGlow, 0.22) });
    const farSkin = ink(mix(RIM, PALETTE.enemyInk, 0.55), { fill: mix(PALETTE.enemyInk, PALETTE.worldDeep, 0.3), width: 1.2 });

    // ------------------------------------------------------------------------------------------ legs
    const foot = (pen: import('../kit/paint').Pen, l2: number): void => {
      pen.hard([[l2 - 1, 2], [l2 + 7, -1.5], [l2 - 1, -2]]).fill(THORN);
    };
    const limb = ink(RIM, { width: 1.5 });
    const mkLeg = (i: number, far: boolean): Leg => new Leg(k, `${far ? 'far' : 'near'}-leg${i}`, { l1: 17, l2: 21, w0: far ? 6.5 : 7.5, w1: 5, w2: 2.6, mat: far ? farSkin : limb, foot });
    const farLegs = HIPS.map((_, i) => mkLeg(i, true));
    const nearLegs = HIPS.map((_, i) => mkLeg(i, false));

    // ------------------------------------------------------------------------------------------ body
    const tail = k.ribbon({ n: 7, width: (u) => 9 - 8 * u, color: PALETTE.enemyInk, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.3 }, rim: { color: RIM, width: 1.2, alpha: 0.9 } }, 'tail');
    const tailThorn = k.part('tail-thorn', (pen) => pen.shape([[0, -2.5], [10, 0], [0, 2.5]], { fill: THORN, rims: [] }, { sharp: [1], round: 0 }));
    const carapace = k.part('carapace', (pen) =>
      pen.shape(CARAPACE, skin, { sharp: [] }, (p) => {
        // the weave: vines that cross over the dome, a lighter violet on the black
        const vine = mix(PALETTE.violetDeep, PALETTE.worldSlate, 0.45);
        p.contour([[-44, 4], [-30, 14], [-8, 18], [16, 15], [38, 8]], { closed: false }).stroke(vine, 1.6, 0.8);
        p.contour([[-42, -4], [-26, 6], [-6, 10], [18, 7], [40, 0]], { closed: false }).stroke(vine, 1.4, 0.7);
        p.contour([[-24, 18], [-18, 6], [-22, -8]], { closed: false }).stroke(vine, 1.2, 0.6);
        p.contour([[2, 21], [10, 8], [4, -9]], { closed: false }).stroke(vine, 1.2, 0.6);
        p.contour([[26, 15], [30, 4], [24, -8]], { closed: false }).stroke(vine, 1.2, 0.6);
      }),
    );
    const crest = CREST.map(([, , h], i) =>
      k.part(`thorn${i}`, (pen) => pen.shape([[-3, 0], [-1.6, h * 0.55], [0.4, h], [2, h * 0.5], [3.2, 0]], solid(THORN, PALETTE.whiteHot, { ramp: 'tube', edge: PALETTE.enemyInk }), { sharp: [2], round: 0.7 })),
    );
    const head = k.group('head');
    const skull = k.part('head', (pen) => pen.shape(HEAD, ink(RIM, { gloss: lens([9, 5], 7, 2.2, -0.12, PALETTE.worldGlow, 0.22) }), {}, (p) => p.hard([[2, 9.5], [10, 12], [14, 9]]).fill(THORN)));
    const mandA = k.part('mandible-up', (pen) => pen.shape(MANDIBLE, solid(THORN, PALETTE.whiteHot, { ramp: 'tube', edge: PALETTE.enemyInk }), { sharp: [3] }));
    const mandB = k.part('mandible-low', (pen) => pen.shape(MANDIBLE, solid(mix(THORN, PALETTE.enemyInk, 0.35), RIM, { ramp: 'tube', edge: PALETTE.enemyInk }), { sharp: [3] }));
    const eyes = k.part('eyes', (pen) => {
      pen.ellipse(0, 0, 2.3, 3.2).fill(PALETTE.whiteHot);
      pen.ellipse(5.6, -1.2, 2, 2.8).fill(PALETTE.whiteHot);
      pen.ellipse(10.5, -3, 1.7, 2.3).fill(PALETTE.whiteHot);
    });
    const glow = k.glow(PALETTE.violetGlow, 30, 0);
    head.addChild(skull, mandB, mandA, eyes, glow);
    place(head, 44, -1);
    place(mandA, 27, -2);
    place(mandB, 27, -6, 0, 1, -0.9);
    place(eyes, 15, 3);
    glow.position.set(21, -1.5);

    body.addChild(tail, tailThorn, carapace, ...crest, head);
    root.addChild(...farLegs.map((l) => l.root), body, ...nearLegs.map((l) => l.root));
    crest.forEach((c, i) => place(c, CREST[i]![0], CREST[i]![1], -CREST[i]![3]));

    // ------------------------------------------------------------------------------------------ motion
    let cycle = k.seed * 3;
    let crouch = 0;
    let bristle = 0;
    let mouth = 0;
    let dizzy = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const telegraph = f.anim === 'telegraph';
        const rush = f.anim === 'attack';
        const dazed = f.anim === 'land';
        const speed = Math.abs(f.vx);

        // the feelings of the body, smoothed so a state change is a motion and not a jump
        const wantCrouch = telegraph ? 0.55 + 0.45 * easeIn(f.p) : rush ? 0.7 : dazed ? 0.9 : dead ? 1 : f.anim === 'alert' ? -0.2 : f.phase === 'recovery' ? 0.35 * (1 - f.p) : 0;
        crouch = dt > 0 ? damp(crouch, wantCrouch, 12, dt) : crouch;
        const wantBristle = telegraph ? 0.35 + 0.65 * easeOut(f.p) : f.anim === 'alert' ? 0.7 * (1 - f.p) : dazed ? 0.2 : rush ? -0.25 : 0;
        bristle = dt > 0 ? damp(bristle, wantBristle, 14, dt) : bristle;
        const wantMouth = telegraph ? 0.35 + 0.65 * f.p : rush ? 0.2 : f.anim === 'alert' ? 0.4 : dazed ? 0.6 : 0.06;
        mouth = dt > 0 ? damp(mouth, wantMouth, 12, dt) : mouth;
        dizzy = dt > 0 ? damp(dizzy, dazed ? 1 - f.p * 0.7 : 0, 6, dt) : dizzy;

        // the cadence of the legs follows the ground it covers; a gallop is quick, a patrol slow, and it stands still otherwise
        cycle += dt * (rush ? 4.2 : speed > 0.2 ? 0.55 + speed * 0.55 : 0);
        const stride = rush ? 22 : 11;
        const lift = rush ? 7 : 6;

        const shake = telegraph ? Math.sin(f.t * 60) * 0.9 * f.p : 0;
        const bob = dead ? 0 : 0.8 * Math.sin(f.t * 2.2) + (speed > 0.2 ? 1.1 * Math.sin(cycle * TAU * 2) : 0);
        const by = BODY_Y - 12 * crouch + bob - (dead ? 15 * easeOut(f.dying) : 0);
        const pitch = (rush ? -0.07 : 0) + (dazed ? -0.22 * dizzy + 0.07 * Math.sin(f.t * 9) * dizzy : 0) + (f.anim === 'alert' ? 0.12 * (1 - f.p) : 0) - 0.28 * f.hurt + (telegraph ? -0.05 * f.p : 0);
        const squash = 1 + 0.03 * Math.sin(f.t * 2.2) - 0.05 * crouch;
        place(body, shake - 5 * f.hurt - (rush ? 4 : 0), by, pitch, 1 + (rush ? 0.06 : 0), squash * (1 - 0.12 * f.hurt) * (dead ? 1 - 0.55 * f.dying : 1));

        // the legs: a tripod gait, near and far legs in opposite step; the front pair scrapes the floor while it winds up. The hips are in the rig's space, not the body's, so the body can pitch without dragging the feet through the floor
        const moving = speed > 0.2 || rush;
        const setLeg = (leg: Leg, i: number, far: boolean): void => {
          const hipX = HIPS[i]! + (far ? -3 : 0);
          const hipH = by - 8 - 2 * crouch; // how high the hip is above the floor
          const fc = footCycle(cycle + (i % 2 === 0 ? 0 : 0.5) + (far ? 0.5 : 0) + i * 0.08, stride, lift);
          let fx = (far ? 7 : 3) + (moving ? fc.x : 0);
          let fy = moving ? fc.y : 0;
          if (telegraph && i === 2) {
            // the scrape: the front foot drags back and up in turns, the far one half a beat behind
            const w = f.t * 16 + (far ? Math.PI : 0);
            fx += 10 + 7 * Math.sin(w);
            fy += Math.max(0, -Math.cos(w)) * 8;
          }
          if (dazed) fx += (i - 1) * 9 * dizzy;
          if (dead) {
            // the legs fold up under the body
            fx = 6 * (1 - f.dying);
            fy = 12 * easeOut(f.dying);
          }
          leg.root.position.set(hipX, -hipH);
          leg.reach(fx, -hipH + fy, i === 0 ? -1 : 1);
        };
        farLegs.forEach((l, i) => setLeg(l, i, true));
        nearLegs.forEach((l, i) => setLeg(l, i, false));

        // the crest: lies back in a charge, stands up with the warning, shakes in a daze
        crest.forEach((c, i) => {
          const [, , , lean] = CREST[i]!;
          const flutter = dazed ? 0.35 * dizzy * Math.sin(f.t * 14 + i) : 0.05 * wobble(f.t, 1.4, i);
          const ang = -lean + (i - 3.5) * -0.22 * bristle + flutter;
          place(c, CREST[i]![0], CREST[i]![1] + 1.6 * bristle, ang, 1 + 0.25 * bristle, 1 + 0.6 * bristle);
        });
        if (dead) {
          crest.forEach((c, i) => {
            c.alpha = 1 - easeIn(f.dying);
            flung(c, [CREST[i]![0], CREST[i]![1]], [(i - 3.5) * 22, 55 + 10 * (i % 3)], (i - 3.5) * 3, 150, -by + 2, f.dying);
          });
        } else crest.forEach((c) => (c.alpha = 1));

        // the head: low and forward when it charges, lifted when it is alert, down when it is dazed; the mandibles open with the warning
        const headLift = (f.anim === 'alert' ? 5 * (1 - f.p) : 0) - 5 * dizzy - (rush ? 3 : 0) + 1.2 * Math.sin(f.t * 2.2 + 1);
        place(head, 44, -1 + headLift, (dazed ? -0.35 * dizzy : 0) + (telegraph ? -0.12 * f.p : 0) + 0.04 * Math.sin(f.t * 1.6));
        place(mandA, 27, -2, 0.08 + 0.55 * mouth);
        place(mandB, 27, -6, 0, 1, -0.9);
        mandB.rotation = 0.08 + 0.55 * mouth;
        const open = dead ? 0.1 : dazed ? 0.35 : 1 - 0.85 * f.hurt;
        eyes.scale.set(1 + 0.45 * f.heat, Math.max(0.08, open) * (1 + 0.3 * f.heat));
        glow.alpha = Math.min(1, ((telegraph || rush ? 0.3 + 0.9 * f.heat : 0.22) + 0.3 * Math.sin(f.t * 3) * 0.2) * open) * (dead ? 1 - f.dying : 1);
        glow.scale.set((24 + 26 * f.heat) / glow.texture.width);

        // the tail trails behind and whips with the gait (it is part of the body, so it takes the body's pose by being in it)
        const lag = -Math.max(-1, Math.min(1, f.vx * 0.25));
        const t = tentacle([-46, 3], Math.PI + 0.25 + lag * 0.5 + (rush ? 0.2 : 0) - 0.3 * crouch, 30, 7, 0.4 * lag + 0.2 * Math.sin(f.t * 1.5), 0.18 + (speed > 0.2 ? 0.2 : 0), f.t * (speed > 0.2 ? 7 : 2.5));
        tail.setSpine(t);
        const end = t[6]!;
        const prev = t[5]!;
        place(tailThorn, end[0], end[1], Math.atan2(end[1] - prev[1], end[0] - prev[0]));
      },
    };
  },
};
