import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE SLAG SPITTER (docs/PROMPT24-LOG.md): the second half's thrower is not a bird but a furnace with a temper — a squat, hunched gargoyle of black iron on short thick legs and knuckled arms, with a grate in its chest where the fire
 * is, two chimneys on its back, and a mouth like the door of a kiln. It still keeps its distance (it shuffles backward on its knuckles), and the aim is the furnace being fed: the chest swells like a bellows, the grate goes white,
 * the chimneys flare, the jaw drops and a bead of slag swells behind its teeth; the shot is the head thrown forward and the chest let down in one breath. Dead, the grate bursts and the fire comes out.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const IRON = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.4);

const TORSO: readonly Pt[] = [[-30, 30], [-35, 52], [-20, 74], [8, 80], [30, 66], [37, 44], [27, 26], [0, 19]];
const JAW: readonly Pt[] = [[0, 0], [20, -2], [30, -9], [16, -16], [0, -12]];
const HEAD: readonly Pt[] = [[-10, -6], [-13, 8], [0, 17], [18, 15], [32, 5], [30, -4], [12, -8]];

export const SLAG_SPITTER_RIG: RigDef = {
  id: 'slag_spitter',
  width: 1,
  height: 1.25,
  shadow: 100,
  aura: { color: RIM, at: [10, 54], size: 180, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('slag-spitter');
    const body = k.group('body');
    const skin = scorched(IRON, RIM, { gloss: lens([-8, 58], 12, 3.6, -0.4, HOT, 0.16), width: 2.4 });
    const limb = scorched(IRON, RIM, { width: 1.8 });
    const farLimb = scorched(mix(IRON, PALETTE.enemyInk, 0.45), mix(RIM, PALETTE.enemyInk, 0.55), { width: 1.2 });
    const fist = (pen: Pen, l2: number): void => {
      pen.shape([[l2 - 3, 8], [l2 + 10, 7], [l2 + 12, -7], [l2 - 3, -8]], scorched(mix(IRON, DEEP, 0.2), RIM, { width: 1.2 }), { round: 0.5 });
    };
    const legFar = new Leg(k, 'leg-far', { l1: 17, l2: 18, w0: 20, w1: 16, w2: 13, mat: farLimb, foot: fist });
    const legNear = new Leg(k, 'leg-near', { l1: 18, l2: 19, w0: 22, w1: 17, w2: 14, mat: limb, foot: fist });
    const armFar = new Leg(k, 'arm-far', { l1: 24, l2: 26, w0: 17, w1: 14, w2: 12, mat: farLimb, foot: fist });
    const armNear = new Leg(k, 'arm-near', { l1: 25, l2: 27, w0: 19, w1: 15, w2: 12, mat: limb, foot: fist });

    const torso = k.part('torso', (pen) => pen.shape(TORSO, skin, { round: 1 }, (p) => {
      // plates of riveted iron across the back
      p.contour([[-32, 50], [-18, 66], [0, 72]], { closed: false }).stroke(PALETTE.enemyInk, 1.8, 0.8);
      p.contour([[-34, 38], [-16, 52], [8, 60]], { closed: false }).stroke(PALETTE.enemyInk, 1.8, 0.8);
      for (const [x, y] of [[-24, 62], [-12, 70], [-28, 46], [-14, 56]] as const) p.circle(x, y, 1.6).fill(DEEP);
    }));
    // the grate in its chest, with the fire behind it
    const fire = k.part('fire', (pen) => pen.shape([[0, 0], [2, 20], [14, 26], [26, 20], [26, 0], [12, -3]], { fill: HOT, ramp: 'sphere', rims: [] }, { round: 0.6 }));
    const grate = k.part('grate', (pen) => {
      pen.shape([[0, 0], [2, 20], [14, 26], [26, 20], [26, 0], [12, -3]], { fill: PALETTE.enemyInk, alpha: 0.0, rims: [], edge: { color: PALETTE.enemyInk, width: 2.4 } }, { round: 0.6 });
      for (const x of [5, 10, 15, 20]) pen.line([x, -1], [x, 24]).stroke(PALETTE.enemyInk, 2.2, 1);
      pen.line([2, 8], [26, 8]).stroke(PALETTE.enemyInk, 2, 1);
      pen.line([3, 16], [25, 16]).stroke(PALETTE.enemyInk, 2, 1);
    });
    const fireGlow = k.glow(HOT, 70, 0);
    const chimney = (key: string) => k.part(key, (pen) => pen.shape([[-8, 0], [-9, 15], [-6, 22], [6, 22], [9, 15], [8, 0]], scorched(mix(IRON, PALETTE.worldSlate, 0.2), RIM, { width: 1.6 }), { round: 0.3 }, (p) => {
      p.line([-8, 9], [8, 9]).stroke(PALETTE.enemyInk, 1.6, 0.8);
      p.ellipse(0, 22, 7, 2.6).fill(PALETTE.enemyInk);
    }));
    const stackA = chimney('stack-a');
    const stackB = chimney('stack-b');
    const flameA = k.glow(HOT, 26, 0);
    const flameB = k.glow(HOT, 22, 0);
    const smoke = new Motes(k, 12, mix(PALETTE.worldMist, PALETTE.worldNight, 0.5), 20, 0.2);
    const head = k.group('head');
    const skull = k.part('skull', (pen) => pen.shape(HEAD, skin, { round: 1 }, (p) => {
      // a heavy brow over the eyes
      p.hard([[-4, 12], [14, 15], [30, 5], [14, 8]]).fill(PALETTE.enemyInk, 0.8);
    }));
    const jaw = k.part('jaw', (pen) => pen.shape(JAW, scorched(IRON, RIM, { width: 1.6 }), { round: 0.6 }, (p) => {
      for (const x of [6, 13, 20]) p.hard([[x, -1], [x + 3, 0], [x + 1.5, 6]]).fill(PALETTE.whiteHot, 0.9);
    }));
    const maw = k.part('maw', (pen) => pen.shape([[0, 0], [22, 1], [30, -6], [14, -13], [0, -9]], { fill: DEEP, ramp: 'sphere', rims: [] }, { round: 0.6 }));
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 3.4, 2.2).fill(HOT);
      pen.ellipse(0.8, 0, 1.4, 2).fill(PALETTE.enemyInk);
    });
    const eyeGlow = k.glow(HOT, 30, 0);
    const bead = k.glow(HOT, 18, 0);
    const beadCore = k.glow(PALETTE.whiteHot, 9, 0);
    const burst = k.glow(HOT, 90, 0);
    const embers = new Motes(k, 12, HOT, 8, 0.6);
    const bits = [0, 1, 2, 3].map((i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [14 + i * 2, 5], [18, 18], [4, 14]], skin, { round: 0.3 })));
    for (const b of bits) b.visible = false;

    head.addChild(maw, skull, jaw, eye, eyeGlow);
    body.addChild(stackA, stackB, torso, fire, grate, fireGlow, flameA, flameB, smoke, head, bead, beadCore, burst, embers, ...bits);
    root.addChild(legFar.root, armFar.root, body, legNear.root, armNear.root);
    place(skull, 0, 0);
    place(maw, 4, -2);
    place(eye, 18, 6);
    eyeGlow.position.set(18, -6);

    let walk = k.seed * 3;
    let fed = 0;
    let gape = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const aim = f.anim === 'telegraph';
        const fireS = f.anim === 'attack';
        const spent = f.phase === 'recovery';
        const moving = Math.abs(f.vx) > 0.25 && !aim && !fireS && !dead;

        fed = dt > 0 ? damp(fed, aim ? easeIn(f.p) : fireS ? 1 : spent ? 0.2 : 0.18 + 0.1 * Math.sin(f.t * 1.6), fireS ? 40 : 10, dt) : fed;
        gape = dt > 0 ? damp(gape, fireS ? 1 : aim ? 0.4 + 0.5 * f.p : spent ? 0.35 + 0.1 * Math.sin(f.t * 7) : 0.04, fireS ? 40 : 12, dt) : gape;
        if (moving) walk += dt * (0.6 + Math.abs(f.vx) * 0.55) * Math.sign(f.vx || 1);

        // the body: crouched and heavy, it lurches as it shuffles, leans back to aim and is thrown back by the shot
        const kick = fireS ? -9 : 0;
        const swell = 1 + 0.17 * fed * (fireS ? 0.4 : 1) - (spent ? 0.04 : 0);
        const lurch = moving ? 3 * Math.abs(Math.sin(walk * Math.PI)) : 1 * Math.sin(f.t * 1.7);
        const bY = 14 + lurch - (dead ? 18 * easeOut(f.dying) : 0);
        place(body, kick - 3 * f.hurt, bY, (aim ? 0.1 * f.p : 0) + (fireS ? -0.1 : 0) + 0.22 * f.hurt + (dead ? 0.4 * f.dying : 0), swell, swell * (dead ? 1 - 0.35 * f.dying : 1));

        // the chest: a window of fire in a grate, white when it is fed
        place(fire, 6, 38, 0);
        place(grate, 6, 38, 0);
        fire.alpha = 0.55 + 0.45 * fed;
        fireGlow.position.set(19, -50);
        fireGlow.alpha = Math.min(1, 0.25 + 0.85 * fed) * (dead ? 0 : 1);
        fireGlow.scale.set((50 + 70 * fed) / fireGlow.texture.width);
        // the exhausts point back and out, like a furnace's flues, not up like ears
        place(stackA, -26, 66, 1.05);
        place(stackB, -12, 74, 0.85);
        flameA.position.set(-26 - 19, -(66 + 11));
        flameB.position.set(-12 - 15, -(74 + 14));
        const fl = 0.3 + 0.6 * fed + 0.15 * Math.sin(f.t * 17);
        flameA.alpha = flameB.alpha = Math.min(1, fl) * (dead ? 0 : 1);
        flameA.scale.set((18 + 22 * fed) / flameA.texture.width);
        flameB.scale.set((16 + 20 * fed) / flameB.texture.width);
        smoke.position.set(-44, -(86));
        smoke.show(f.t, 0, 0, 40, 70, 0.45, dead ? 0.9 : 0.35 + 0.5 * fed + (spent ? 0.3 : 0));

        // the head: low and forward at rest, back to aim, thrown out to spit; the jaw drops with the feeding
        const hx = 46 - (aim ? 10 * f.p : 0) + (fireS ? 14 : 0) + (f.anim === 'alert' ? 2 : 0);
        const hy = 62 + (f.anim === 'alert' ? 6 * (1 - f.p) : 0) + (aim ? 6 * f.p : 0) - (spent ? 6 : 0) + 1.4 * Math.sin(f.t * 2 + 1);
        place(head, hx, hy, (aim ? 0.28 * f.p : 0) + (fireS ? -0.2 : 0) + (spent ? -0.3 : 0) + (dead ? -0.6 * f.dying : 0));
        place(jaw, 4, -4, -0.7 * gape);
        place(eye, 18, 6, 0, 1 + 0.4 * f.heat, Math.max(0.1, 1 - 0.85 * f.hurt) * (dead ? 0.2 : 1));
        eyeGlow.alpha = Math.min(1, (0.25 + 0.8 * f.heat) * (1 - 0.85 * f.hurt)) * (dead ? 0 : 1);
        eyeGlow.scale.set((24 + 24 * f.heat) / eyeGlow.texture.width);
        maw.alpha = 0.35 + 0.65 * gape;

        // the bead of slag behind its teeth, swelling with the aim; gone with the shot, in a flash
        const swellB = aim ? easeIn(f.p) : 0;
        const mouthX = hx + 28 * Math.cos(0.0) - 2;
        bead.position.set(mouthX, -(hy - 4));
        beadCore.position.set(mouthX, -(hy - 4));
        bead.alpha = swellB;
        bead.scale.set((12 + 36 * swellB) / bead.texture.width);
        beadCore.alpha = swellB;
        beadCore.scale.set((6 + 16 * swellB) / beadCore.texture.width);
        burst.position.set(mouthX + 14, -(hy - 4));
        burst.alpha = fireS ? Math.max(0, 1 - f.p * 1.6) * 0.9 : 0;
        burst.scale.set((50 + 80 * f.p) / burst.texture.width);

        // legs and arms: shuffling backward on the knuckles
        const hips = [-16, 6] as const;
        [legFar, legNear].forEach((leg, i) => {
          const c = footCycle(walk + (i ? 0.5 : 0), 12, 6);
          const hipH = bY + 28;
          leg.root.position.set(hips[i]! + (i ? 0 : -3), -hipH);
          leg.reach(2 + (moving ? c.x : 0) + (dead ? -6 * f.dying : 0), -hipH + 8 + (moving ? c.y : 0), 1);
        });
        [armFar, armNear].forEach((arm, i) => {
          const c = footCycle(walk + (i ? 0 : 0.5) + 0.25, 14, 8);
          const shY = bY + 60;
          arm.root.position.set(18 - (i ? 0 : 3), -shY);
          const reach = (aim ? 10 : fireS ? 16 : 22) + (moving ? c.x : 0);
          arm.reach(reach + (i ? 0 : -6), -shY + 9 + (moving ? c.y : 0) + (dead ? 22 * easeOut(f.dying) : 0), -1);
        });

        // dead: the grate bursts and the fire comes out; the iron falls in plates
        embers.position.set(14, -(bY + 52));
        embers.show(f.t, 0, 0, 70, 80, 1.1, dead ? Math.min(1, f.dying * 4) * (1 - f.dying * 0.8) * 1.6 : fireS ? 0.8 : aim ? 0.4 * f.p : 0.1);
        bits.forEach((b, i) => {
          b.visible = dead && f.dying > 0.1;
          if (b.visible) {
            flung(b, [(i - 1.5) * 16, 52], [(i - 1.5) * 40, 40 + i * 8], (i - 1.5) * 3, 180, -bY + 2, Math.min(1, (f.dying - 0.1) * 1.4));
            b.alpha = 1 - Math.max(0, (f.dying - 0.7) / 0.3);
          }
        });
        void TAU;
      },
    };
  },
};
