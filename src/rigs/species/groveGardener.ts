import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched, solid } from '../kit/materials';
import { easeIn, easeOut, footCycle, tentacle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE GROVE GARDENER (docs/PROMPT24-LOG.md): the keeper of a burnt garden — a great charred BULB on four thick root-legs, a face cut in the front of it (two slits of ember, a mouth of thorns), two long vine-whips for arms, six seed-pods hanging
 * round it on vines like lanterns (the spheres it tends: the wisps it calls hatch from them), and out of its crown a BLOOM: a flower the height of a man, eight petals of coal that stand shut like a tulip, a bud of flame. Shut, the bloom is the
 * armour of the head and a blow is turned away; after a leap — and only then — the petals fall open like a hand and the PISTIL shows, a heart of white ember on a crown of stamens with a light at the end of every one, and rings go out from it.
 * The leap is a crouch (the bulb squashes, the petals clench), a stretch through the air and a landing that squashes it and shakes the pods; the ring is the bulb swelling and every pod flaring, then the spores; the roots are both whips
 * raised and driven into the floor in front of it. Second and third phase: the pods swell and burn (that is the hatching), the petals' tips catch fire. Dead, the petals fall off one by one, the bulb splits, and the pods go out.
 */

const CHAR = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.28);
const CHAR_LIT = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.55);
const EMBER = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const PETAL = mix(DEEP, EMBER, 0.55);
const PISTIL: Pt = [0, 226];
const PODS: readonly Pt[] = [[-72, 108], [-92, 84], [-44, 120], [58, 116], [84, 96], [100, 70]];

export const GROVE_GARDENER_RIG: RigDef = {
  id: 'boss_gardener',
  width: 2.8,
  height: 3.6,
  shadow: 260,
  aura: { color: EMBER, at: [0, 200], size: 520, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('grove-gardener');
    const body = k.group('body');
    const wood = scorched(CHAR, EMBER, { width: 2.2 });
    const woodFar = scorched(mix(CHAR, PALETTE.enemyInk, 0.4), mix(EMBER, DEEP, 0.5), { width: 1.4 });
    const toes = (pen: Pen, l2: number): void => {
      for (const [dy, len] of [[12, 40], [0, 48], [-11, 36]] as const) {
        pen.contour([[l2 - 6, dy * 0.4], [l2 + len * 0.5, dy + 3], [l2 + len, dy - 5]], { closed: false }).stroke(PALETTE.enemyInk, 12, 1);
        pen.contour([[l2 - 6, dy * 0.4], [l2 + len * 0.5, dy + 3], [l2 + len, dy - 5]], { closed: false }).stroke(CHAR_LIT, 6, 1);
      }
    };
    const legs = [0, 1, 2, 3].map((i) => new Leg(k, `leg${i}`, { l1: 58, l2: 64, w0: i < 2 ? 34 : 40, w1: i < 2 ? 25 : 29, w2: i < 2 ? 16 : 19, mat: i < 2 ? woodFar : wood, foot: toes }));
    const bulb = k.part('bulb', (pen) =>
      pen.shape([[-98, 0], [-108, 40], [-90, 92], [-44, 124], [0, 130], [46, 122], [92, 90], [108, 40], [96, 0], [0, -10]], { ...scorched(CHAR, EMBER, { width: 2.6, gloss: lens([-52, 96], 14, 6, 0.5, HOT, 0.3) }) }, { round: 0.9 }, (p) => {
        // the ridges of the bulb and the cracks the ember shows through
        for (const x of [-70, -36, 0, 36, 70]) p.contour([[x * 0.8, 0], [x * 1.05, 50], [x * 0.9, 100]], { closed: false }).stroke(PALETTE.enemyInk, 3, 0.55);
        for (const c of [[[-60, 20], [-40, 50], [-56, 80]], [[30, 12], [44, 46], [30, 84]]] as Pt[][]) {
          p.contour(c, { closed: false, round: 0 }).stroke(EMBER, 4, 0.5);
          p.contour(c, { closed: false, round: 0 }).stroke(HOT, 1.4, 0.8);
        }
      }),
    );
    const stalk = k.part('stalk', (pen) => pen.shape([[-26, 0], [-20, 34], [-18, 52], [18, 52], [20, 34], [26, 0]], wood, { round: 0.6 }));
    const eyes = [0, 1].map((i) => k.part(`eye${i}`, (pen) => pen.hard([[-10, 0], [0, 7 - i * 2], [14 - i * 3, 2], [0, -4]]).fill(HOT)));
    const eyeGlow = k.glow(EMBER, 70, 0);
    const mouth = k.part('mouth', (pen) => {
      pen.contour([[0, 4], [14, -2], [26, 4], [40, -4], [48, 2]], { closed: false, round: 0 }).stroke(PALETTE.enemyInk, 7, 1);
      for (const x of [8, 20, 32, 44]) pen.hard([[x - 4, 3], [x, -9], [x + 4, 1]]).fill(HOT, 0.9);
    });
    const petal = (key: string, far: boolean) => k.part(key, (pen) => pen.shape([[-17, 0], [-26, 34], [-20, 92], [-6, 138], [0, 152], [8, 134], [22, 90], [28, 34], [17, 0]], far ? solid(mix(PETAL, PALETTE.enemyInk, 0.35), mix(EMBER, DEEP, 0.4), { ramp: 'vert', edge: PALETTE.enemyInk, width: 1.8 }) : solid(PETAL, HOT, { ramp: 'vert', edge: PALETTE.enemyInk, width: 2.6, gloss: lens([-6, 84], 3, 26, 0.04, HOT, 0.3) }), { round: 0.7, sharp: [4] }, (p) => {
      p.contour([[0, 10], [2, 70], [0, 140]], { closed: false }).stroke(far ? DEEP : EMBER, 2.4, 0.7);
      p.hard([[-4, 118], [0, 152], [6, 126]]).fill(HOT, far ? 0.25 : 0.7);
    }));
    const petalsBack = [0, 1, 2, 3].map((i) => petal(`petal-back${i}`, true));
    const petalsFront = [0, 1, 2, 3].map((i) => petal(`petal-front${i}`, false));
    const pistil = k.part('pistil', (pen) => {
      for (let i = 0; i < 7; i++) {
        const a = (-0.9 + i * 0.3);
        const len = 52 + (i % 3) * 14;
        pen.line([0, 0], [Math.sin(a) * len, Math.cos(a) * len]).stroke(CHAR, 3.4, 1);
        pen.circle(Math.sin(a) * len, Math.cos(a) * len, 5).fill(HOT);
      }
      pen.circle(0, 0, 24).fill(mix(DEEP, EMBER, 0.7));
      pen.circle(0, 0, 24).stroke(HOT, 2.6, 0.9);
      pen.circle(0, 2, 12).fill(PALETTE.whiteHot, 0.95);
    });
    const bloomGlow = k.glow(EMBER, 190, 0);
    const beacon = new Beacon(k, EMBER, 200, mix(EMBER, PALETTE.whiteHot, 0.3));
    const vines = k.ribbon({ n: 5, count: PODS.length, width: (u) => 4.6 * (1 - u * 0.4), color: CHAR, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.8 }, rim: { color: EMBER, width: 1.2, alpha: 0.7 } }, 'vines');
    const pods = PODS.map((_, i) => k.part(`pod${i}`, (pen) => {
      pen.shape([[0, 22], [16, 12], [19, -4], [11, -20], [0, -24], [-11, -20], [-19, -4], [-16, 12]], { fill: mix(DEEP, EMBER, 0.45), ramp: 'sphere', edge: { color: PALETTE.enemyInk, width: 2.4 }, rims: [{ color: HOT, width: 2, alpha: 0.9 }], gloss: lens([-6, 8], 4, 7, 0.4, HOT, 0.4) }, { round: 1 });
      pen.circle(0, -2, 8).fill(HOT, 0.8);
    }));
    const podGlow = pods.map(() => k.glow(EMBER, 80, 0));
    const whips = k.ribbon({ n: 9, count: 2, width: (u) => 30 * (1 - u * 0.72) + 5, color: CHAR, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 1.6 }, rim: { color: EMBER, width: 1.6, alpha: 0.85 } }, 'whips');
    const thorns = [0, 1].map(() => k.part('thorn', (pen) => pen.hard([[-8, 0], [0, 26], [8, 0]]).fill(HOT)));
    const ring = k.part('ring', (pen) => {
      pen.ellipse(0, 0, 110, 12).stroke(EMBER, 5, 0.95);
      pen.ellipse(0, 0, 96, 9).stroke(HOT, 2, 0.8);
    });
    ring.blendMode = 'add';
    const dust = new Motes(k, 12, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 26, 0.3);
    const embers = new Motes(k, 18, EMBER, 13, 0.7);
    const spores = new Motes(k, 12, HOT, 10, 0.4);
    const bits = Array.from({ length: 8 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [26 + (i % 3) * 6, 8], [34, 40 + (i % 3) * 10], [8, 46]], wood, { round: 0.25, sharp: [0, 1, 2, 3] })));
    for (const b of bits) b.visible = false;

    body.addChild(bulb, ...eyes, eyeGlow, mouth);
    root.addChild(legs[0]!.root, legs[1]!.root, ...petalsBack, stalk, bloomGlow, pistil, beacon, ...petalsFront, body, legs[2]!.root, legs[3]!.root, vines, ...podGlow, ...pods, whips, ...thorns, ring, dust, embers, spores, ...bits);

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let walk = k.seed * 2;
    let scattered = false;
    let squash = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const leap = key === 'leap';
        const ringAtk = key === 'ring';
        const rootsAtk = key === 'roots';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const third = f.hpFrac < 0.33 ? 1 : 0;
        const fall = dead ? easeIn(f.dying) : 0;
        const moving = Math.abs(f.vx) > 0.25 && !wind && !strike && !dead && Math.abs(f.vy) < 1;
        const air = !dead && Math.abs(f.vy) > 1;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.3 * second + 0.2 * third, roar), 10, dt) : heat;
        if (moving) walk += dt * (0.4 + Math.abs(f.vx) * 0.3);
        // squash and stretch: down in the crouch of the leap, long in the air, flat at the landing (the sim says it landed; the view eases off from there)
        const wantSquash = (leap && wind ? 0.28 * easeOut(f.p) : 0) + (f.anim === 'land' ? 0.3 * Math.max(0, 1 - f.since * 5) : 0) + (ringAtk && wind ? -0.12 * f.p : 0) - (air ? 0.1 : 0) - 0.04 * roar;
        squash = dt > 0 ? damp(squash, wantSquash, 22, dt) : wantSquash;
        const sy = 1 - squash;
        const sx = 1 + squash * 0.55;

        // the body: the bulb sits on four root-legs that bend with the crouch; a slow breath; sinks when it is spent; the whole of it sags and splits in the death
        const hipY = 86 - 30 * squash * (leap ? 1.5 : 1) - 6 * open - 6 * (1 - awake) - 60 * fall + (moving ? -3 * Math.abs(Math.sin(walk * Math.PI * 2)) : 1.4 * Math.sin(f.t * 1.3));
        // the bulb sits on the legs: its base is a little below the hips, and the squash is about that base
        const by = hipY - 86 + 62;
        place(body, 0, by, 0, sx, sy);
        place(bulb, 0, 0);
        const top = by + 130 * sy;
        place(stalk, 0, top - 14, 0, 1, 1);
        const hipX = [-70, 40, -52, 68] as const;
        legs.forEach((leg, i) => {
          const far = i < 2;
          const front = i % 2 === 1;
          const c = footCycle(walk + (front ? 0.5 : 0) + (far ? 0.25 : 0), 44, 18);
          leg.root.position.set(hipX[i]!, -(hipY - 4));
          const fx = (front ? 62 : -52) + (far ? -6 : 8) + (moving ? c.x : 0) + (dead ? (i - 1.5) * 24 * f.dying : 0) + (squash > 0.1 ? (front ? 22 : -22) * squash : 0);
          leg.reach(fx - hipX[i]!, -(hipY - 4) + 8 + (moving ? c.y : 0), front ? 1 : -1);
        });

        // the face: two slits of ember that narrow with the warning and flare in the roar, the mouth of thorns
        eyes.forEach((e, i) => {
          place(e, 62 + i * 26, 84 - i * 6, -0.2 + i * 0.2, 1 + 0.3 * heat, 0.8 + 0.5 * heat);
          e.alpha = (0.4 + 0.6 * awake) * (dead ? 1 - f.dying : 1);
        });
        eyeGlow.position.set(76, -80);
        eyeGlow.alpha = Math.min(1, awake * (0.2 + 0.8 * heat) + 0.3 * second + roar) * (dead ? 0 : 1);
        eyeGlow.scale.set((60 + 50 * heat) / eyeGlow.texture.width);
        place(mouth, 66, 42, -0.08, 1 + 0.15 * heat, 1 + 0.6 * (heat * 0.7 + roar));
        mouth.alpha = dead ? 1 - f.dying : 1;

        // the bloom: shut like a tulip, it falls open like a hand when it is spent; the petals' tips catch fire in the second phase; the pistil and its stamens show between
        const clench = (leap && wind ? easeOut(f.p) : 0) * 0.5;
        const bloomY = top + 10;
        const spread = Math.max(open, roar * 0.35, strike && ringAtk ? 0.18 : 0);
        const flick = 0.03 * Math.sin(f.t * 2.2);
        const angles = [-1.5, -0.5, 0.5, 1.5];
        petalsBack.forEach((p, i) => {
          const a = angles[i]! * (0.17 * (1 - clench) + 0.64 * spread) + flick + 0.06 * (i - 1.5);
          place(p, 3 + (i - 1.5) * 4, bloomY, -a, 0.9 + 0.1 * spread, (0.92 - 0.1 * spread) * (1 + 0.1 * second));
          p.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.1 - i * 0.06) / 0.25)) : awake * 0.2 + 0.8;
        });
        petalsFront.forEach((p, i) => {
          const a = angles[i]! * (0.15 * (1 - clench) + 0.7 * spread) + flick * 1.2 - 0.03 + 0.04 * (i - 1.5);
          const fallOff = dead ? Math.min(1, Math.max(0, (f.dying - 0.05 - i * 0.07) / 0.35)) : 0;
          place(p, (i - 1.5) * 5 - fallOff * (i - 1.5) * 70, bloomY - fallOff * fallOff * 240, -a - fallOff * (i - 1.5) * 1.8, 1 + 0.06 * second, (1 - 0.08 * spread) * (1 + 0.1 * second));
          p.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.45) / 0.3)) : awake * 0.2 + 0.8;
        });
        place(pistil, PISTIL[0], bloomY + 26, 0.04 * Math.sin(f.t * 1.5), 0.5 + 0.6 * open, 0.5 + 0.6 * open);
        pistil.alpha = Math.max(0.0, open) * (dead ? Math.max(0, 1 - f.dying * 2) : 1);
        bloomGlow.position.set(PISTIL[0], -(bloomY + 34));
        bloomGlow.alpha = Math.min(0.8, (0.08 * awake + 0.7 * open + 0.15 * heat) * (dead ? Math.max(0, 1 - f.dying * 2) : 1));
        bloomGlow.scale.set((120 + 90 * open + 10 * Math.sin(f.t * 6) * open) / bloomGlow.texture.width);
        beacon.show(f.t, [PISTIL[0], bloomY + 30], open, 0);

        // the pods: lanterns on vines that swing; swollen and burning for the ring and the hatching; every one flares when it lands
        const burn = Math.max(ringAtk ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0, roar, 0.35 * second + 0.2 * third, leap && f.anim === 'land' ? 0.7 : 0);
        PODS.forEach((anchor, i) => {
          const side = anchor[0] < 0 ? -1 : 1;
          const ax = anchor[0] * sx;
          const ay = by + anchor[1] * sy;
          const sway = Math.sin(f.t * 1.3 + i * 1.7) * 6 + (moving ? -f.vx * 3 * side : 0);
          const len = 56 + 12 * (i % 3) - 18 * squash * 2 + (air ? 10 : 0);
          const pts = tentacle([ax, ay], -Math.PI / 2 + side * 0.5 + sway * 0.01 - (strike && leap ? side * 0.3 : 0), len, 5, side * 0.25, 0.05, f.t * 1.4 + i);
          vines.setLine(i, pts);
          const end = pts[4]!;
          const sc = (0.7 + 0.4 * burn + 0.15 * third) * (dead ? Math.max(0, 1 - f.dying * 1.5) : 1);
          place(pods[i]!, end[0], end[1] - 16 * sc, 0.1 * Math.sin(f.t * 1.7 + i), sc, sc);
          pods[i]!.alpha = awake * 0.25 + 0.75;
          const g = podGlow[i]!;
          g.position.set(end[0], -(end[1] - 16 * sc));
          g.alpha = Math.min(0.6, (0.1 + 0.55 * burn) * awake) * (dead ? 0 : 1);
          g.scale.set((44 + 38 * burn) / g.texture.width);
        });
        vines.commit();
        vines.alpha = dead ? Math.max(0, 1 - f.dying * 1.4) : 1;

        // the whips: curled at its sides; raised and driven down in front for the roots; flung out for the ring
        const sh: Pt[] = [[-60, by + 100 * sy], [66, by + 96 * sy]];
        for (let i = 0; i < 2; i++) {
          const near = i === 1 ? 1 : 0;
          const raise = rootsAtk ? (wind ? easeOut(f.p) : strike ? Math.max(0, 1 - f.p * 4) : 0) : 0;
          const slam = rootsAtk && strike ? Math.min(1, f.p * 5) : 0;
          const base = near ? 0.4 : 2.7;
          const ang = rootsAtk && (wind || strike) ? (near ? 1.35 - 1.1 * slam + 0.3 * (1 - raise) : 1.9 - 0.2 * slam) : base + 0.15 * Math.sin(f.t * 1.2 + i) + (ringAtk && (wind || strike) ? (near ? 0.5 : -0.5) * 0.4 : 0);
          const reachL = 190 + (rootsAtk && (wind || strike) ? 120 : 0) + (ringAtk && strike ? 30 : 0) - 40 * (1 - awake) - 60 * fall;
          const curl = rootsAtk && wind ? 1.4 * (1 - f.p) : 0.7 * Math.sin(f.t * 1.5 + i) * (1 - 0.6 * awake) - 0.5 + 0.2 * i;
          const pts = tentacle(sh[i]!, ang, reachL, 9, curl, 0.12 + 0.1 * heat, f.t * 2 + i * 2);
          whips.setLine(i, pts);
          const tip = pts[8]!;
          const prev = pts[7]!;
          place(thorns[i]!, tip[0], tip[1], Math.atan2(tip[1] - prev[1], tip[0] - prev[0]) - Math.PI / 2, 1, 1);
          thorns[i]!.alpha = dead ? Math.max(0, 1 - f.dying * 1.4) : 1;
        }
        whips.commit();
        whips.alpha = dead ? Math.max(0, 1 - f.dying * 1.4) : 0.3 * awake + 0.7;

        // the landing and the ring: the shock runs out along the floor; dust at the feet; embers off the pods; spores in the ring
        ring.visible = leap && f.anim === 'land' && f.since < 0.35;
        if (ring.visible) {
          const u = f.since / 0.35;
          place(ring, 0, 4, 0, 0.4 + 2.6 * easeOut(u), 1);
          ring.alpha = 1 - u;
        }
        dust.position.set(0, -2);
        dust.show(f.t, 0, 12, 280, 40, 0.5, (f.anim === 'land' ? 1 : 0) * Math.max(0, 1 - f.since * 2.5) + (rootsAtk && strike ? 0.8 : 0) + (dead && f.dying > 0.4 ? 0.7 : 0));
        embers.position.set(0, -(hipY + 80));
        embers.show(f.t, 0, 60, 260, 240, 0.5, (0.05 + 0.5 * second + 0.7 * roar + 0.4 * burn) * awake + (dead ? 0.8 * (1 - fall * 0.5) : 0) + 0.25 * open);
        spores.position.set(70, -(by + 100));
        spores.show(f.t, 0, 30, 120, 160, 1.2, ringAtk && strike ? 1 : 0);

        // the death: the petals fall one by one, the bulb splits and sinks, the pods go out
        if (dead) {
          scattered = true;
          const g = Math.min(1, Math.max(0, (f.dying - 0.3) / 0.7) * 1.1);
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [(i - 3.5) * 24, hipY + 80], [(i - 3.5) * 46, 90 + (i % 3) * 40], (i - 3.5) * 2, 560, 4, g);
              b.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
            }
          });
          bulb.alpha = stalk.alpha = body.alpha = 1 - Math.max(0, (f.dying - 0.55) / 0.45);
          for (const l of legs) l.root.alpha = bulb.alpha;
          for (const p of [...eyes, mouth]) p.alpha = Math.min(p.alpha, bulb.alpha);
        } else {
          if (scattered) scattered = false;
          for (const b of bits) b.visible = false;
          bulb.alpha = stalk.alpha = body.alpha = 1;
          for (const l of legs) l.root.alpha = 1;
        }
        void TAU;
      },
    };
  },
};
