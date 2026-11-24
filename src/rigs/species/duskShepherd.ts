import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeOut, footCycle, tentacle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE DUSK SHEPHERD (docs/PROMPT24-LOG.md): a tree burnt down to its bones that walks as a man would on stilts — two long root-legs, a trunk that is a CAGE of ribs of charred wood around a spine, a neck that leans out, and a ram's
 * skull for a head, with a pair of great curled horns and two ember eyes in the sockets. A ragged cloak of ash hangs from its shoulders, and in its hand it carries a CROOK: a long staff with a hooked top and a lantern of embers swinging from the hook.
 * It is a shepherd: it herds fire. Its heart is a SPHERE of ember held in the cage of its ribs, a dull coal while it waits; for the volley it rises out of the cage, held up in front of the raised arm, and swells, and is thrown in five;
 * and when the volley is spent the ribs are spread wide and the sphere hangs in the open, burning white, with rings running out from it — that is the only time it can be hurt. The sweep is the crook drawn back over the shoulder and
 * brought round through the whole of its reach; the stamp is the crook held high and driven butt-first into the floor, the waves running out along the ground from it. Dead, it burns down: the cloak goes first, then the ribs, the horns fall off the skull,
 * the sphere goes out, and the crook is left standing in the ash for a moment before it falls.
 */

const CHAR = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.3);
const CHAR_LIT = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.6);
const EMBER = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const ASH = mix(PALETTE.worldDusk, PALETTE.emberDeep, 0.34);
const BONE = mix(PALETTE.worldHaze, PALETTE.emberHot, 0.25);
const COLS = 4;
const ROWS = 7;
const HIP_Y = 182;
const SHOULDER: Pt = [6, 332];
const ORB_HOME: Pt = [2, 248];

export const DUSK_SHEPHERD_RIG: RigDef = {
  id: 'boss_shepherd',
  width: 2.8,
  height: 4.7,
  shadow: 210,
  aura: { color: EMBER, at: [0, 250], size: 540, base: 0.045 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('dusk-shepherd');
    const body = k.group('body');
    const wood = scorched(CHAR, EMBER, { width: 2.2 });
    const woodFar = { ...scorched(mix(CHAR, PALETTE.enemyInk, 0.4), mix(EMBER, DEEP, 0.5), { width: 1.4 }) };
    const root2 = (pen: Pen, l2: number): void => {
      // a foot of roots: three toes gripping the floor
      for (const [dy, len] of [[10, 44], [0, 54], [-9, 40]] as const) {
        pen.contour([[l2 - 4, dy * 0.4], [l2 + len * 0.5, dy + 3], [l2 + len, dy - 4]], { closed: false }).stroke(PALETTE.enemyInk, 9, 1);
        pen.contour([[l2 - 4, dy * 0.4], [l2 + len * 0.5, dy + 3], [l2 + len, dy - 4]], { closed: false }).stroke(CHAR_LIT, 4.4, 1);
      }
    };
    const twigs = (pen: Pen, l2: number): void => {
      for (const [dy, len, bend] of [[9, 52, 10], [3, 62, 6], [-4, 58, -2], [-10, 44, -12]] as const) {
        pen.contour([[l2 - 2, dy * 0.5], [l2 + len * 0.55, dy + bend * 0.4], [l2 + len, dy + bend]], { closed: false }).stroke(PALETTE.enemyInk, 6.4, 1);
        pen.contour([[l2 - 2, dy * 0.5], [l2 + len * 0.55, dy + bend * 0.4], [l2 + len, dy + bend]], { closed: false }).stroke(CHAR_LIT, 2.6, 1);
      }
      pen.circle(l2 - 2, 0, 10).fill(PALETTE.enemyInk);
      pen.circle(l2 - 2, 0, 7).fill(CHAR_LIT);
    };
    const legs = [new Leg(k, 'leg-far', { l1: 98, l2: 96, w0: 34, w1: 25, w2: 16, mat: woodFar, foot: root2 }), new Leg(k, 'leg-near', { l1: 98, l2: 96, w0: 40, w1: 29, w2: 18, mat: wood, foot: root2 })];
    const armFar = new Leg(k, 'arm-far', { l1: 106, l2: 112, w0: 28, w1: 20, w2: 13, mat: woodFar, foot: twigs });
    const armNear = new Leg(k, 'arm-near', { l1: 106, l2: 112, w0: 31, w1: 22, w2: 14, mat: wood, foot: twigs });

    const cloak = k.cloth({ cols: COLS, rows: ROWS, color: ASH, ramp: 'soft', alpha: 0.96 }, 'cloak');
    const hemEdge = k.ribbon({ n: COLS + 1, width: () => 2.6, color: EMBER, ramp: 'flat', alpha: 0.7 }, 'hem-edge');
    const spine = k.part('spine', (pen) => pen.shape([[-12, 0], [-14, 60], [-10, 130], [-12, 160], [6, 160], [10, 130], [14, 60], [12, 0]], wood, { round: 0.7 }, (p) => {
      for (let i = 0; i < 6; i++) p.circle(0, 14 + i * 24, 4).fill(CHAR_LIT, 0.8);
    }));
    const hips = k.part('hips', (pen) => pen.shape([[-34, 0], [-40, 18], [-18, 34], [18, 34], [40, 18], [34, 0], [0, -10]], wood, { round: 0.8 }));
    const ribs = [0, 1, 2, 3, 4].map((i) => k.part(`rib${i}`, (pen) => {
      const w = 40 - Math.abs(i - 1.6) * 5;
      pen.contour([[0, 0], [w * 0.7, 6], [w, -6], [w * 0.74, -26]], { closed: false }).stroke(PALETTE.enemyInk, 12, 1);
      pen.contour([[0, 0], [w * 0.7, 6], [w, -6], [w * 0.74, -26]], { closed: false }).stroke(CHAR_LIT, 5.6, 1);
      pen.contour([[0, 2], [w * 0.7, 8], [w, -4]], { closed: false }).stroke(EMBER, 1.6, 0.7);
    }));
    const ribsBack = [0, 1, 2, 3, 4].map((i) => k.part(`rib-back${i}`, (pen) => {
      const w = 36 - Math.abs(i - 1.6) * 5;
      pen.contour([[0, 0], [-w * 0.7, 6], [-w, -6], [-w * 0.74, -26]], { closed: false }).stroke(PALETTE.enemyInk, 11, 1);
      pen.contour([[0, 0], [-w * 0.7, 6], [-w, -6], [-w * 0.74, -26]], { closed: false }).stroke(mix(CHAR, DEEP, 0.2), 4.6, 1);
    }));
    const cracks = k.part('cracks', (pen) => {
      for (const c of [[[-10, 190], [6, 230], [-4, 270], [10, 318]], [[8, 200], [-6, 244]]] as Pt[][]) {
        pen.contour(c, { closed: false, round: 0 }).stroke(EMBER, 5, 0.55);
        pen.contour(c, { closed: false, round: 0 }).stroke(HOT, 1.6, 0.9);
      }
    });
    const neck = k.ribbon({ n: 6, width: (u) => 17 - 5 * u, color: CHAR, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 1 }, rim: { color: EMBER, width: 1.6, alpha: 0.85 } }, 'neck');
    const skull = k.part('skull', (pen) => pen.shape([[-16, 4], [-22, 26], [-12, 48], [10, 56], [38, 44], [64, 24], [68, 8], [52, 0], [30, 2], [8, -8]], { ...scorched(mix(CHAR, BONE, 0.38), HOT, { width: 2.4, gloss: lens([6, 40], 3, 14, 0.2, HOT, 0.25) }) }, { round: 0.7, sharp: [6] }, (p) => {
      p.ellipse(18, 30, 10, 9).fill(PALETTE.enemyInk);
      p.hard([[42, 22], [60, 14], [56, 22]]).fill(PALETTE.enemyInk, 0.9);
      p.contour([[50, 4], [40, 6], [28, 6]], { closed: false }).stroke(PALETTE.enemyInk, 2.6, 0.85);
      for (const x of [30, 38, 46]) p.line([x, 4], [x - 1, 11]).stroke(PALETTE.enemyInk, 1.6, 0.8);
    }));
    const eyeGlow = k.glow(EMBER, 60, 0);
    const eyeCore = k.glow(HOT, 26, 0);
    const horn = (far: boolean) => k.part(far ? 'horn-far' : 'horn-near', (pen) => {
      const path: Pt[] = [[0, 0], [-22, 26], [-50, 34], [-72, 12], [-66, -22], [-38, -34], [-20, -14], [-30, 6]];
      const widths = far ? [12, 9, 6.4] : [16, 12, 8];
      const cuts: Pt[][] = [path.slice(0, 4), path.slice(3, 6), path.slice(5)];
      cuts.forEach((c, i) => {
        pen.contour(c, { closed: false }).stroke(PALETTE.enemyInk, widths[i]! + 3, 1);
        pen.contour(c, { closed: false }).stroke(far ? mix(CHAR, BONE, 0.15) : mix(CHAR, BONE, 0.32), widths[i]!, 1);
        if (!far) pen.contour(c, { closed: false }).stroke(HOT, 1.6, 0.6);
      });
    });
    const hornNear = horn(false);
    const hornFar = horn(true);
    const sphere = k.part('sphere', (pen) => {
      pen.shape([[0, 34], [24, 24], [32, 0], [24, -24], [0, -34], [-24, -24], [-32, 0], [-24, 24]], { fill: mix(DEEP, EMBER, 0.6), ramp: 'sphere', rims: [{ color: HOT, width: 3, alpha: 0.9 }], gloss: lens([-10, 14], 8, 11, 0.4, HOT, 0.5) }, { round: 1 }, (p) => {
        p.circle(2, -2, 16).fill(HOT, 0.85);
        p.circle(2, -2, 8).fill(PALETTE.whiteHot, 0.9);
      });
    });
    const sphereGlow = k.glow(EMBER, 200, 0);
    const beacon = new Beacon(k, EMBER, 210, mix(EMBER, PALETTE.whiteHot, 0.35));

    const staffG = k.group('staff');
    const shaft = k.part('shaft', (pen) => {
      pen.shape([[-5, -92], [-7, 40], [-5, 180], [-4, 290], [4, 290], [5, 180], [7, 40], [5, -92]], wood, { round: 0.3 }, (p) => {
        for (const y of [-30, 60, 150, 240]) p.ellipse(0, y, 8, 3.6).fill(CHAR_LIT, 0.9);
      });
      // the hook at the top, curling forward and down
      pen.contour([[0, 286], [4, 316], [26, 332], [48, 322], [56, 298]], { closed: false }).stroke(PALETTE.enemyInk, 14, 1);
      pen.contour([[0, 286], [4, 316], [26, 332], [48, 322], [56, 298]], { closed: false }).stroke(CHAR_LIT, 8, 1);
      pen.contour([[0, 286], [4, 316], [26, 332], [48, 322], [56, 298]], { closed: false }).stroke(EMBER, 1.6, 0.6);
    });
    const lantern = k.part('lantern', (pen) => {
      pen.line([56, 298], [56, 280]).stroke(PALETTE.enemyInk, 3, 1);
      pen.shape([[-10, 0], [-13, -12], [-9, -26], [0, -30], [9, -26], [13, -12], [10, 0]], { fill: mix(DEEP, EMBER, 0.55), ramp: 'sphere', edge: { color: PALETTE.enemyInk, width: 3 }, rims: [{ color: HOT, width: 1.8, alpha: 0.9 }] }, { round: 0.8 });
      pen.circle(0, -14, 5.6).fill(HOT);
    });
    const lanternGlow = k.glow(EMBER, 120, 0);
    staffG.addChild(shaft, lantern, lanternGlow);

    const dust = new Motes(k, 12, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 26, 0.3);
    const embers = new Motes(k, 18, EMBER, 14, 0.7);
    const ash = new Motes(k, 12, mix(PALETTE.worldHaze, PALETTE.emberHot, 0.3), 16, 0.2);
    const bits = Array.from({ length: 9 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [10 + (i % 3) * 4, 4], [14, 40 + (i % 4) * 12], [3, 46]], wood, { round: 0.25, sharp: [0, 1, 2, 3] })));
    for (const b of bits) b.visible = false;

    body.addChild(hornFar, ...ribsBack, spine, ...ribs, cracks, sphereGlow, sphere, beacon, neck, skull, eyeGlow, eyeCore, hornNear);
    root.addChild(legs[0]!.root, armFar.root, cloak, hemEdge, hips, legs[1]!.root, body, armNear.root, staffG, dust, embers, ash, ...bits);

    body.pivot.set(0, -HIP_Y);
    place(spine, 0, HIP_Y + 6);
    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let walk = k.seed * 2;
    let scattered = false;
    const hemTooth = [0, 14, 3, 18, 6];

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const sweep = key === 'sweep';
        const volley = key === 'volley';
        const stamp = key === 'stamp';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const fall = dead ? easeIn(f.dying) : 0;
        const moving = Math.abs(f.vx) > 0.25 && !wind && !strike && !dead;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.35 * second, roar), 10, dt) : heat;
        if (moving) walk += dt * (0.32 + Math.abs(f.vx) * 0.22);

        // the body: it stands stooped, a slow sway; leans back to wind up the sweep, rises on its toes for the stamp, comes down with the blow, sags when it is spent
        const bob = (moving ? -4 * Math.abs(Math.sin(walk * Math.PI * 2)) : 1.6 * Math.sin(f.t * 1.2)) - 14 * (1 - awake) - 10 * open - 150 * fall * fall;
        const rise = stamp ? (wind ? 22 * easeOut(f.p) : strike ? 22 * Math.max(0, 1 - f.p * 4) - 6 : 0) : 0;
        const lean = -0.06 + (sweep && wind ? -0.1 * f.p : 0) + (sweep && strike ? 0.14 * Math.min(1, f.p * 3) : 0) + (stamp && wind ? -0.04 * f.p : 0) + (stamp && strike ? 0.08 : 0) + 0.06 * open + 0.03 * f.hurt - 0.06 * (1 - awake) + (dead ? 0.5 * fall : 0);
        const shake = (roar * 5 + 5 * f.hurt) * Math.sin(f.t * 62) * 0.4;
        const hipY = HIP_Y + bob + rise;
        place(body, shake, hipY, -lean);
        place(hips, 0, hipY - 4);
        // a point of the body (authored standing at HIP_Y) as the lean and the bob have put it, for what hangs from it but is not part of it: the roots of the arms
        const at = (x: number, y: number): Pt => {
          const a = -lean;
          const dx = x;
          const dy = y - HIP_Y;
          return [dx * Math.cos(a) - dy * Math.sin(a) + shake, hipY + dy * Math.cos(a) + dx * Math.sin(a)];
        };

        // the legs: long stilts that step slowly; both planted for the blows
        const hipX = [-10, 12] as const;
        legs.forEach((leg, i) => {
          const c = footCycle(walk + (i ? 0.5 : 0), 54, 26);
          leg.root.position.set(hipX[i]!, -(hipY - 4));
          const fx = (i ? 30 : -24) + (moving ? c.x : 0) + (sweep && strike ? (i ? 22 : -10) : 0);
          const fy = moving ? c.y : 0;
          leg.reach(fx, -(hipY - 4) + 7 + fy, 1);
        });

        // the cage: five ribs a side, spread wide when it is spent; the sphere rises out of it for the volley and hangs in the open after
        const ribOpen = Math.max(open, volley ? (wind ? easeIn(f.p) * 0.55 : strike ? 0.55 : 0) : 0, roar * 0.4);
        ribs.forEach((r, i) => {
          place(r, 0, HIP_Y + 44 + i * 25, -0.1 - 0.5 * ribOpen + 0.05 * Math.sin(f.t * 1.3 + i), 1 + 0.18 * ribOpen, 1);
          r.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.2 - i * 0.07) / 0.3)) : 1;
        });
        ribsBack.forEach((r, i) => {
          place(r, 0, HIP_Y + 44 + i * 25, 0.1 + 0.4 * ribOpen, 1 + 0.12 * ribOpen, 1);
          r.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.2 - i * 0.07) / 0.3)) : 1;
        });
        cracks.alpha = Math.min(1, 0.75 * second + 0.6 * heat * second + 0.5 * roar + 0.1) * (dead ? 1 - f.dying : 1);

        // the sphere
        const out = volley ? (wind ? easeOut(f.p) : strike ? 1 : 0) : 0;
        const orbX = ORB_HOME[0] + 70 * out + 26 * open;
        const orbY = ORB_HOME[1] + 60 * out;
        const burn = Math.max(open, volley ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0, roar, 0.3 * second);
        const pulse = Math.sin(f.t * (2.6 + 5 * burn));
        const orbScale = (0.5 + 0.35 * burn + 0.55 * out + 0.25 * open) * (1 + 0.06 * pulse) * (dead ? Math.max(0, 1 - f.dying * 1.6) : 1);
        place(sphere, orbX, orbY, f.t * 0.6, orbScale, orbScale);
        sphere.alpha = 0.55 + 0.45 * awake;
        sphereGlow.position.set(orbX, -orbY);
        sphereGlow.alpha = Math.min(0.85, (0.2 + 0.6 * burn + 0.06 * pulse) * awake) * (dead ? Math.max(0, 1 - f.dying * 1.4) : 1);
        sphereGlow.scale.set((130 + 120 * burn + 20 * pulse) * (0.7 + 0.4 * orbScale) / sphereGlow.texture.width);
        beacon.show(f.t, [orbX, orbY], open, 0);

        // the head: on a neck that leans out, lowered to the hero in the fight, thrown back in the roar; the horns, the eyes
        const reach = 0.5 + 0.4 * heat - 0.3 * (1 - awake) + 0.2 * open;
        const headX = 30 + 14 * reach + (sweep && strike ? 18 : 0) - (sweep && wind ? 12 * f.p : 0) - 30 * fall;
        const headY = HIP_Y + 214 + 12 * Math.sin(f.t * 1.1) - 24 * (1 - awake) - 22 * open + (roar ? 22 * roar : 0) + (sweep && wind ? 14 * f.p : 0) - (stamp && strike ? 4 : 0);
        const base: Pt = [SHOULDER[0] - 2, HIP_Y + 148];
        neck.setSpine(tentacle(base, 1.2 - 0.3 * reach, Math.hypot(headX - base[0], headY - base[1]) * 1.02, 6, 0.14, 0.02, f.t));
        const nk = Math.atan2(headY - base[1], headX - base[0]);
        void nk;
        const tilt = -0.2 - 0.18 * reach + 0.12 * open - (sweep && strike ? 0.1 : 0) + (roar ? 0.4 * roar : 0) + 0.7 * fall;
        place(skull, headX, headY, tilt);
        place(hornNear, headX - 8, headY + 38, tilt, 1, 1);
        place(hornFar, headX - 12, headY + 36, tilt, 0.9, 0.9);
        const eyeAt = (a: number): Pt => [headX + Math.cos(tilt) * 18 - Math.sin(tilt) * 30 + a, headY + Math.sin(tilt) * 18 + Math.cos(tilt) * 30];
        const ep = eyeAt(0);
        eyeGlow.position.set(ep[0], -ep[1]);
        eyeGlow.alpha = Math.min(1, awake * (0.35 + 0.65 * heat) + 0.3 * second + roar) * (dead ? 0 : 1);
        eyeGlow.scale.set((54 + 50 * heat + 26 * second) / eyeGlow.texture.width);
        eyeCore.position.set(ep[0], -ep[1]);
        eyeCore.alpha = eyeGlow.alpha;
        eyeCore.scale.set((22 + 14 * heat) / eyeCore.texture.width);

        // the cloak: hangs from the shoulders, sways with the walk, streams back with the swing, burns from the hem up in the death
        const cy = (j: number): number => hipY + 150 - ((hipY + 150 - (hipY - 70)) * j) / ROWS * (1 - 0.5 * fall);
        const drift = (moving ? -f.vx * 5 : 0) + (sweep && strike ? -26 : 0) + 6 * Math.sin(f.t * 1.1);
        cloak.setPoints((i, j) => {
          const u = j / ROWS;
          const w = 26 + 46 * u;
          const cx = -10 * u + drift * u * u - 6;
          const tooth = j === ROWS ? hemTooth[i % hemTooth.length]! * (1 + 0.3 * Math.sin(f.t * 2.5 + i)) : 0;
          const hemRise = dead ? Math.max(0, f.dying * 1.5 - (1 - u) * 0.6) * 220 : 0;
          return [cx - w + ((2 * w * 0.9) * i) / COLS + 3 * Math.sin(f.t * 1.5 + j + i) * u, cy(j) - tooth + Math.min(hemRise, (cy(j) - hipY + 60))] as Pt;
        });
        const hem: Pt[] = [];
        for (let i = 0; i <= COLS; i++) {
          const w = 72;
          hem.push([-10 + drift - 6 - w + ((2 * w * 0.9) * i) / COLS, cy(ROWS) - hemTooth[i % hemTooth.length]! * (1 + 0.3 * Math.sin(f.t * 2.5 + i))]);
        }
        hemEdge.setSpine(hem);
        cloak.alpha = (dead ? Math.max(0, 1 - f.dying * 1.6) : 1) * (0.45 + 0.55 * awake);
        hemEdge.alpha = cloak.alpha * (0.5 + 0.5 * second + 0.4 * heat);

        // the arms and the crook. Idle: the crook upright in the near hand, the far arm hanging. Sweep: the crook drawn back over the shoulder and brought round. Stamp: held high, driven down. Volley: both arms raised.
        const shN = at(SHOULDER[0] + 8, HIP_Y + 150);
        const shF = at(SHOULDER[0] - 12, HIP_Y + 152);
        armNear.root.position.set(shN[0], -shN[1]);
        armFar.root.position.set(shF[0], -shF[1]);
        let nx = 62 + 5 * Math.sin(f.t * 1.2);
        let ny = -128 + 4 * Math.sin(f.t * 1.5);
        let fx = -6 + 10 * Math.sin(f.t * 1.1 + 1);
        let fy = -168 + 8 * Math.sin(f.t * 1.4) - 20 * (1 - awake);
        let theta = 82 + 3 * Math.sin(f.t * 1.1) + (moving ? 6 * Math.sin(walk * TAU) : 0) - 10 * (1 - awake);
        if (sweep && (wind || strike)) {
          const a = wind ? easeOut(f.p) : 1;
          const s = strike ? easeOut(Math.min(1, f.p * 1.5)) : 0;
          nx = (-40 + 150 * s) * 1 + 20 * (1 - a) * 0;
          ny = (60 - 150 * (a * 0.3 + s * 0.7)) + 20 * a * (1 - s);
          theta = 82 + 66 * a - 160 * s;
          fx = 40 * s;
          fy = -110;
        } else if (stamp && (wind || strike)) {
          const up = wind ? easeOut(f.p) : Math.max(0, 1 - f.p * 4);
          nx = 80 + 10 * up;
          ny = -120 + 250 * up;
          theta = 90 - 10 * (1 - up);
          fx = 40;
          fy = -60 + 150 * up;
        } else if (volley && (wind || strike)) {
          const up = wind ? easeOut(f.p) : 1;
          nx = 50;
          ny = -60 + 90 * up;
          theta = 84;
          fx = 40 + 70 * up;
          fy = -60 + 150 * up;
        } else if (roar > 0.01) {
          nx = 90;
          ny = 90 * roar - 20;
          fx = -70;
          fy = 90 * roar - 20;
          theta = 70;
        } else if (open > 0.3) {
          nx = 60;
          ny = -150;
          fx = -30;
          fy = -150;
          theta = 80;
        } else if (dead) {
          nx = 60 - 20 * fall;
          ny = -150 + 20 * fall;
          fx = -30;
          fy = -160;
          theta = 82 - 70 * fall;
        }
        const clampReach = (x: number, y: number): Pt => {
          const d = Math.hypot(x, y);
          const m = 212;
          return d > m ? [(x / d) * m, (y / d) * m] : [x, y];
        };
        const nt = clampReach(nx, ny);
        const ft = clampReach(fx, fy);
        armNear.reach(nt[0], nt[1], -1);
        armFar.reach(ft[0], ft[1], -1);
        const grip: Pt = [shN[0] + nt[0], shN[1] + nt[1]];
        const stand = dead ? Math.min(1, Math.max(0, (f.dying - 0.45) / 0.55)) : 0;
        place(staffG, grip[0] - 40 * stand, grip[1] - 40 * stand - 160 * stand * stand, theta * (Math.PI / 180) - Math.PI / 2 - 1.4 * stand, 1, 1);
        lanternGlow.position.set(56, -(298 - 16));
        lanternGlow.alpha = Math.min(1, awake * (0.4 + 0.3 * heat) + 0.3 * second + 0.4 * (stamp && wind ? f.p : 0)) * (dead ? Math.max(0, 1 - f.dying * 1.2) : 1);
        lanternGlow.scale.set((90 + 40 * Math.sin(f.t * 5) * 0.4 + 40 * heat) / lanternGlow.texture.width);
        place(lantern, 56, 296, 0.12 * Math.sin(f.t * 2.2) - 0.1 * (sweep && strike ? 1 : 0), 1, 1);

        // dust at the foot of the crook on the stamp, embers off the body in the fight and the roar, ash and a rain of coals in the death
        dust.position.set(grip[0] + 12, -2);
        dust.show(f.t, 0, 12, 260, 40, 0.5, (stamp && strike ? 1 : 0) * (1 - f.p * 0.6));
        embers.position.set(0, -(hipY + 40));
        embers.show(f.t, 0, 120, 190, 300, 0.5, (0.1 + 0.6 * second + 0.7 * roar + 0.5 * heat) * awake + (dead ? 0.9 * (1 - fall * 0.5) : 0) + 0.25 * open);
        ash.position.set(0, -(hipY + 60));
        ash.show(f.t, 0, 110, 150, 260, 0.35, (dead ? 0.8 : 0.1 * awake));

        // the death: it burns down; the horns fall off the skull
        if (dead) {
          scattered = true;
          const g = Math.min(1, Math.max(0, (f.dying - 0.3) / 0.7) * 1.1);
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [headX - 20 + i * 5, headY + (i % 3) * 10], [(i - 4) * 36, 40 + (i % 4) * 30], (i - 4) * 1.8, 560, 4, g);
              b.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
            }
          });
          const fade = 1 - Math.max(0, (f.dying - 0.55) / 0.45);
          skull.alpha = hornNear.alpha = hornFar.alpha = neck.alpha = spine.alpha = hips.alpha = fade;
          legs[0]!.root.alpha = legs[1]!.root.alpha = armFar.root.alpha = armNear.root.alpha = fade;
          staffG.alpha = 1 - Math.max(0, (f.dying - 0.85) / 0.15);
        } else {
          if (scattered) scattered = false;
          for (const b of bits) b.visible = false;
          skull.alpha = hornNear.alpha = hornFar.alpha = neck.alpha = spine.alpha = hips.alpha = 1;
          legs[0]!.root.alpha = legs[1]!.root.alpha = armFar.root.alpha = armNear.root.alpha = 1;
          staffG.alpha = 1;
        }
      },
    };
  },
};
