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
 * THE CINDER WEAVER (docs/PROMPT24-LOG.md): the second half's maker does not spin — it fires. A hermit crab that carries a KILN on its back: a tall conical shell of black clay, with a firebox door that glows, a chimney that smokes and
 * rows of tiles that crack with the heat; underneath it a low crab body on seven jointed legs, two eyes on stalks and two great claws. It keeps its distance, scuttling backward; and the casting is drawn: the claws rise and trace a ring of
 * embers on the floor in front of it, a little more of it every moment, a spark running ahead, while the kiln roars — the firebox white, the chimney belching — and when the ring is closed the thing it made stands in it. Dead, the kiln comes apart.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const CLAY = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.45);
const RING_X = 150;

const SHELL: readonly Pt[] = ([[-36, 36], [-44, 66], [-38, 104], [-24, 134], [-12, 154], [-6, 168], [8, 168], [12, 152], [20, 124], [26, 92], [28, 62], [22, 38], [0, 30]] as const).map(([x, y]) => [x * 0.95, 34 + (y - 34) * 0.72] as Pt);

export const CINDER_WEAVER_RIG: RigDef = {
  id: 'cinder_weaver',
  width: 1.05,
  height: 1.65,
  shadow: 110,
  aura: { color: RIM, at: [-8, 80], size: 230, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('cinder-weaver');
    const body = k.group('body');
    const shellMat = scorched(CLAY, RIM, { gloss: lens([-22, 100], 6, 36, 0.12, HOT, 0.12), width: 2.6 });
    const shell = scorched(CLAY, RIM, { width: 2.2 });
    const limb = scorched(CLAY, RIM, { width: 1.6 });
    const farLimb = scorched(mix(CLAY, PALETTE.enemyInk, 0.5), mix(RIM, PALETTE.enemyInk, 0.6), { width: 1.1 });
    const crack = (p: Pt[], pen: Pen, w = 1.8): void => {
      pen.contour(p, { closed: false, round: 0.3 }).stroke(DEEP, w + 1.2, 0.95);
      pen.contour(p, { closed: false, round: 0.3 }).stroke(RIM, w, 0.95);
    };

    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 2], [l2 + 8, 0], [l2 - 1, -2]]).fill(DEEP);
    };
    const mkLeg = (i: number, far: boolean) => new Leg(k, `leg${i}-${far ? 'far' : 'near'}`, { l1: 19, l2: 24, w0: 7, w1: 5, w2: 2.6, mat: far ? farLimb : limb, foot });
    const farLegs = [0, 1, 2].map((i) => mkLeg(i, true));
    const nearLegs = [0, 1, 2, 3].map((i) => mkLeg(i, false));

    const claw = (key: string, far: boolean) => new Leg(k, key, { l1: 24, l2: 28, w0: 9, w1: 7, w2: 6, mat: far ? farLimb : limb, foot: undefined });
    const armNear = claw('arm-near', false);
    const armFar = claw('arm-far', true);
    const pincer = (key: string, far: boolean) => ({
      upper: k.part(`${key}-up`, (pen) => pen.shape([[0, 4], [14, 9], [28, 5], [32, -2], [20, 1], [8, -2]], far ? farLimb : shell, { sharp: [3], round: 0.5 })),
      lower: k.part(`${key}-low`, (pen) => pen.shape([[0, -4], [14, -9], [26, -6], [30, 1], [18, -1], [6, 1]], far ? farLimb : shell, { sharp: [3], round: 0.5 })),
    });
    const pinNear = pincer('pin-near', false);
    const pinFar = pincer('pin-far', true);

    const carapace = k.part('carapace', (pen) => pen.shape([[-26, 0], [-28, 10], [-12, 20], [14, 20], [30, 10], [28, 0], [10, -6], [-12, -6]], scorched(mix(CLAY, DEEP, 0.2), RIM, { gloss: lens([-6, 12], 12, 2.6, -0.05, HOT, 0.2), width: 2 }), { round: 1 }));
    const stalks = [0, 1].map((i) => k.ribbon({ n: 4, width: () => 3.2, color: mix(CLAY, DEEP, 0.3), ramp: 'tube', rim: { color: RIM, width: 0.8, alpha: 0.9 } }, `stalk${i}`));
    const eyes = [0, 1].map(() => k.part('eye', (pen) => {
      pen.circle(0, 0, 4.6).fill(DEEP);
      pen.circle(0, 0, 3.4).fill(HOT);
      pen.circle(0.6, 0, 1.6).fill(PALETTE.enemyInk);
    }));
    const eyeGlow = k.glow(HOT, 34, 0);

    const shellPart = k.part('kiln', (pen) =>
      pen.shape(SHELL, shellMat, { round: 0.7 }, (p) => {
        // the courses of tiles, a spiral ridge, and the cracks the heat has made
        for (const y of [50, 70, 90, 110, 128]) p.contour([[-38 + (y - 40) * 0.08, y], [-4, y + 3], [24 - (y - 40) * 0.1, y]], { closed: false }).stroke(PALETTE.enemyInk, 1.5, 0.75);
        crack([[-28, 62], [-24, 74], [-30, 86]], p, 1.4);
        crack([[14, 92], [18, 106], [12, 116]], p, 1.4);
        // the firebox: a door in an arch of brick
        p.shape([[-24, 48], [-24, 64], [-14, 73], [-4, 64], [-4, 48]], { fill: PALETTE.enemyInk, edge: { color: RIM, width: 1.6 }, rims: [] }, { round: 0.8 });
      }),
    );
    const chimney = k.part('chimney', (pen) =>
      pen.shape([[-9, 0], [-10, 24], [-7, 32], [7, 32], [10, 24], [9, 0]], shell, { round: 0.3 }, (p) => {
        p.line([-9, 12], [9, 12]).stroke(PALETTE.enemyInk, 1.6, 0.8);
        p.ellipse(0, 33, 8, 3).fill(PALETTE.enemyInk);
      }),
    );
    const door = k.part('door', (pen) => {
      pen.shape([[-21, 50], [-21, 63], [-14, 71], [-7, 63], [-7, 50]], { fill: HOT, ramp: 'sphere', rims: [] }, { round: 0.8 });
    });
    const fireGlow = k.glow(HOT, 120, 0);
    const smoke = new Motes(k, 12, mix(PALETTE.worldMist, PALETTE.worldNight, 0.5), 22, 0.2);
    const sparks = new Motes(k, 10, HOT, 7, 0.6);

    const ringArcs = Array.from({ length: 12 }, (_, i) => k.part(`arc${i}`, (pen) => pen.arc(0, 0, 1, (i / 12) * TAU, ((i + 1.15) / 12) * TAU).stroke(HOT, 0.06, 1)));
    for (const a of ringArcs) a.blendMode = 'add';
    const spark = k.glow(PALETTE.whiteHot, 30, 0);
    const line = k.ribbon({ n: 4, width: () => 1.8, color: HOT, ramp: 'flat', alpha: 0.9 }, 'thread');
    line.blendMode = 'add';
    const bricks = [0, 1, 2, 3, 4].map((i) => k.part(`brick${i}`, (pen) => pen.shape([[0, 0], [20 + i * 2, 5], [22, 20], [4, 16]], shell, { round: 0.2 })));
    for (const b of bricks) b.visible = false;

    body.addChild(shellPart, door, chimney, fireGlow, carapace, ...stalks, ...eyes, eyeGlow, smoke, sparks, ...bricks);
    root.addChild(farLegs[0]!.root, farLegs[1]!.root, farLegs[2]!.root, armFar.root, pinFar.upper, pinFar.lower, body, nearLegs[0]!.root, nearLegs[1]!.root, nearLegs[2]!.root, nearLegs[3]!.root, armNear.root, pinNear.upper, pinNear.lower, ...ringArcs, line, spark);

    let walk = k.seed * 3;
    let fire = 0;
    let raise = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const casting = f.anim === 'telegraph';
        const spent = f.phase === 'recovery';
        const moving = Math.abs(f.vx) > 0.25 && !casting && !dead;

        fire = dt > 0 ? damp(fire, casting ? easeIn(f.p) : spent ? 0.3 * (1 - f.p) : 0.14 + 0.06 * Math.sin(f.t * 2.2), 10, dt) : fire;
        raise = dt > 0 ? damp(raise, casting ? 1 : f.anim === 'alert' ? 0.7 : spent ? 0.2 : 0.1, 9, dt) : raise;
        if (moving) walk += dt * (0.7 + Math.abs(f.vx) * 0.5) * Math.sign(f.vx || 1);

        // the body: low, wide and heavy under the tall kiln; the whole of it sways a little with the weight, and sinks into the cast
        const bob = moving ? 2.4 * Math.abs(Math.sin(walk * Math.PI)) : 0.9 * Math.sin(f.t * 1.6);
        const by = 34 + bob - (casting ? 3 * f.p : 0) - (spent ? 3 : 0) - (dead ? 20 * easeOut(f.dying) : 0);
        place(body, -3 * f.hurt, by, 0.16 * f.hurt - (casting ? 0.04 * f.p : 0) + (dead ? 0.5 * f.dying : 0) + 0.008 * Math.sin(f.t * 1.2), 1, dead ? 1 - 0.4 * f.dying : 1);
        place(carapace, 4, 4);
        // (the kiln stands on the crab: its foot is on the carapace)
        place(shellPart, -4, -17);
        place(door, -4, -17);
        place(chimney, -3, -17 + 130);
        // the kiln: a firebox that glows, a chimney that smokes, a belch of sparks through the cast
        door.alpha = Math.min(1, 0.35 + 0.8 * fire);
        place(door, -4, -17, 0, 1 + 0.06 * fire, 1);
        fireGlow.position.set(-18, -(-17 + 58));
        fireGlow.alpha = Math.min(1, 0.15 + 0.85 * fire) * (dead ? 0 : 1);
        fireGlow.scale.set((90 + 110 * fire) / fireGlow.texture.width);
        smoke.position.set(-3, -(by - 17 + 135));
        smoke.show(f.t, 0, 0, 36, 70, 0.4, dead ? 0.9 : 0.35 + 0.65 * fire + (spent ? 0.2 : 0));
        sparks.position.set(-3, -(by - 17 + 140));
        sparks.show(f.t, 0, 0, 40, 60, 1.2, casting ? 0.5 + 0.5 * f.p : 0.1);

        // the eyes on their stalks: they look at what they are making, and shrink back when it hurts
        stalks.forEach((s, i) => {
          const base: Pt = [26 + i * 6, 12];
          const tipP: Pt = [base[0] + 14 + i * 4 + (casting ? 8 : 0), base[1] + 14 + 6 * Math.sin(f.t * 1.8 + i) - 12 * f.hurt + 4 * (casting ? 1 : 0)];
          s.setSpine([base, [base[0] + 7 + i, base[1] + 10], [tipP[0] - 3, tipP[1] - 4], tipP]);
          place(eyes[i]!, tipP[0] + 1, tipP[1] + 3, 0, 1 + 0.3 * f.heat, Math.max(0.1, dead ? 0.1 : 1 - 0.85 * f.hurt));
        });
        eyeGlow.position.set(48, -(by * 0 + 30));
        eyeGlow.alpha = Math.min(1, (0.15 + 0.8 * f.heat) * (dead ? 0 : 1));
        eyeGlow.scale.set((28 + 24 * f.heat) / eyeGlow.texture.width);

        // seven legs: a crab's, to the side of the body but seen from it, so the strides are short and quick
        const hips = [-20, 0, 18, 30] as const;
        const stride = 13;
        nearLegs.forEach((leg, i) => {
          const c = footCycle(walk + (i % 2 ? 0.5 : 0), stride, 8);
          const hipH = by + 4;
          leg.root.position.set(hips[i]! + 2, -hipH);
          leg.reach((moving ? c.x : 0) + [-12, -2, 8, 20][i]! - (dead ? 6 * f.dying : 0), -hipH + 3 + (moving ? c.y : 0) + (dead ? 10 * f.dying : 0), i < 2 ? -1 : 1);
        });
        farLegs.forEach((leg, i) => {
          const c = footCycle(walk + (i % 2 ? 0 : 0.5) + 0.25, stride, 8);
          const hipH = by + 6;
          leg.root.position.set([-16, 4, 22][i]!, -hipH);
          leg.reach((moving ? c.x : 0) + [-8, 2, 14][i]! - (dead ? 6 * f.dying : 0), -hipH + 3 + (moving ? c.y : 0) + (dead ? 10 * f.dying : 0), i < 1 ? -1 : 1);
        });

        // the claws: held up, and, through the casting, tracing the ring on the floor in front of it
        const ringR = 48;
        const drawn = casting ? Math.min(1, f.p * 1.05) : 0;
        const a = -Math.PI / 2 - drawn * TAU;
        const px = RING_X + Math.cos(a) * ringR;
        const py = 2 + Math.sin(a) * ringR * 0.16;
        const shoulders: Pt[] = [[30, by + 14], [24, by + 16]];
        [armNear, armFar].forEach((arm, i) => {
          const far = i === 1;
          arm.root.position.set(shoulders[i]![0], -shoulders[i]![1]);
          let tx = 34 + 12 * raise + (far ? -6 : 0);
          let ty = 2 + 28 * raise + 3 * Math.sin(f.t * 2 + i);
          if (casting) {
            const k2 = far ? 0.55 : 1;
            tx = (px - shoulders[i]![0]) * k2 + 14 * (1 - k2);
            ty = (py - shoulders[i]![1]) * k2 + 8 * (1 - k2);
          }
          if (dead) {
            tx = 14 + 10 * f.dying;
            ty = -16 * f.dying;
          }
          const ang = arm.reach(tx, ty, far ? 1 : -1);
          const pin = far ? pinFar : pinNear;
          const ex = shoulders[i]![0] + tx;
          const ey = shoulders[i]![1] + ty;
          const open = casting ? 0.6 : 0.25 + 0.2 * Math.sin(f.t * 1.5 + i) + (f.anim === 'alert' ? 0.3 : 0);
          place(pin.upper, ex, ey, ang + open);
          place(pin.lower, ex, ey, ang - open);
        });
        const n = Math.floor(drawn * 12 + 0.0001);
        ringArcs.forEach((arc, i) => {
          arc.visible = casting && i < n + 1;
          if (arc.visible) {
            place(arc, RING_X, 2, 0, ringR, ringR * 0.16);
            arc.alpha = i < n ? 0.9 : drawn * 12 - n;
          }
        });
        spark.visible = casting && drawn < 1;
        spark.position.set(px, -py);
        spark.alpha = casting ? 0.9 : 0;
        spark.scale.set((24 + 8 * Math.sin(f.t * 30)) / spark.texture.width);
        line.visible = casting;
        if (casting) {
          const hx = shoulders[0]![0] + 34 + 12;
          const hy = shoulders[0]![1] + 28;
          line.setSpine([[hx, hy], [(hx + px) / 2, (hy + py) / 2 + 10], [(hx + px * 3) / 4, py + 20], [px, py]]);
          line.alpha = 0.9;
        }
        bricks.forEach((b, i) => {
          b.visible = dead && f.dying > 0.1;
          if (b.visible) {
            flung(b, [-10 + (i - 2) * 10, 100 + i * 12], [(i - 2) * 42, 30 + i * 8], (i - 2) * 2.4, 190, -by + 2, Math.min(1, (f.dying - 0.1) * 1.4));
            b.alpha = 1 - Math.max(0, (f.dying - 0.65) / 0.35);
          }
        });
        shellPart.alpha = door.alpha = chimney.alpha = dead ? 1 - Math.min(1, f.dying * 1.6) * 0.95 : 1;
      },
    };
  },
};
