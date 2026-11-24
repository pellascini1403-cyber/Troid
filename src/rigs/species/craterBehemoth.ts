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
 * THE CRATER BEHEMOTH (docs/PROMPT24-LOG.md): a mountain that walks on four legs — a low, broad body of black basalt, forelegs like pillars ending in fists of rock, a short thick neck and a heavy skull with two curved tusks and a jaw that opens on
 * lava; and on its back, at the rear, a CONE: a little volcano of stacked slabs with a lid of crust on its crater. The seams between the slabs glow all the time, a little, and a great deal when it is angry. The crust is the weak point:
 * it is shut tight against everything, and it opens only when the beast comes down hard — after a stomp, or a charge that ends against the wall (the longest opening of all) — the lid heaving up on its hinge, the crater bright, embers going up out of it
 * and rings running out. Charge: it scrapes the floor with a fore-fist, lowers the head and goes; the stomp is a rearing on its hind legs and a fall that shakes the floor; the bombs are the jaw swung open on a ball of lava swelling in the throat; the rolls are the fists
 * brought down one after the other. Dead, the cone bursts and the lava runs out of it, the body slumps and goes cold — the glow dies from the seams last.
 */

const ROCK = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.22);
const ROCK_LIT = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.46);
const ROCK_FAR = mix(PALETTE.enemyInk, PALETTE.emberDeep, 0.12);
const TUSK = mix(PALETTE.worldHaze, PALETTE.emberHot, 0.3);
const EMBER = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const PIVOT: Pt = [-120, 80];
const CRATER: Pt = [-100, 322];

export const CRATER_BEHEMOTH_RIG: RigDef = {
  id: 'boss_behemoth',
  width: 4.4,
  height: 3.8,
  shadow: 420,
  aura: { color: EMBER, at: [-30, 180], size: 620, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('crater-behemoth');
    const hull = k.group('hull');
    const head = k.group('head');
    const rock = scorched(ROCK, EMBER, { width: 2.6 });
    const rockLit = scorched(ROCK_LIT, EMBER, { width: 2.6 });
    const rockFar = scorched(ROCK_FAR, mix(EMBER, DEEP, 0.5), { width: 1.4 });
    const claws = (pen: Pen, l2: number, big: number): void => {
      pen.shape([[l2 - 22, 36 * big], [l2 + 36 * big, 32 * big], [l2 + 56 * big, -4], [l2 + 40 * big, -30 * big], [l2 - 22, -34 * big]], rockLit, { round: 0.35 }, (p) => {
        for (const y of [-14, 2, 18]) p.hard([[l2 + 36 * big, y * big], [l2 + 66 * big, y * big - 6], [l2 + 40 * big, y * big - 12]]).fill(TUSK);
      });
    };
    const mkLeg = (key: string, l1: number, l2: number, w: number, far: boolean, big: number) => new Leg(k, key, { l1, l2, w0: w, w1: w * 0.84, w2: w * 0.7, mat: far ? rockFar : rock, foot: (pen, ll) => claws(pen, ll, big), round: 0.5 });
    const legs = [mkLeg('hind-far', 66, 70, 58, true, 0.85), mkLeg('front-far', 74, 80, 60, true, 1), mkLeg('hind-near', 66, 70, 66, false, 0.95), mkLeg('front-near', 74, 80, 72, false, 1.15)];
    const tail = k.ribbon({ n: 6, width: (u) => 54 * (1 - u * 0.7) + 8, color: ROCK, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 1.6 }, rim: { color: EMBER, width: 1.8, alpha: 0.85 } }, 'tail');
    const tailGlow = k.glow(EMBER, 60, 0);

    const torso = k.part('torso', (pen) =>
      pen.shape([[-196, 106], [-206, 168], [-180, 230], [-110, 256], [-20, 262], [64, 252], [120, 226], [156, 180], [158, 122], [128, 82], [40, 68], [-100, 70]], { ...rock, gloss: lens([-60, 238], 90, 6, 0.04, HOT, 0.22) }, { round: 0.9 }, (p) => {
        // the belly is lighter and the underside is lit by what is under it; slabs of the hide, and the cracks between them
        p.hard([[-150, 80], [60, 72], [120, 90], [100, 118], [-130, 120]]).fill(DEEP, 0.28);
        for (const c of [[[-150, 126], [-100, 160], [-120, 214]], [[-30, 110], [10, 170], [-6, 240]], [[70, 120], [100, 170], [86, 224]]] as Pt[][]) p.contour(c, { closed: false, round: 0.6 }).stroke(PALETTE.enemyInk, 3.4, 0.55);
      }),
    );
    const seams = k.part('seams', (pen) => {
      for (const c of [[[-150, 126], [-100, 160], [-120, 214]], [[-30, 110], [10, 170], [-6, 240]], [[70, 120], [100, 170], [86, 224]], [[-186, 200], [-150, 232], [-120, 252]]] as Pt[][]) {
        pen.contour(c, { closed: false, round: 0.6 }).stroke(EMBER, 6, 0.55);
        pen.contour(c, { closed: false, round: 0.6 }).stroke(HOT, 2, 0.95);
      }
    });
    const mound = k.part('mound', (pen) =>
      pen.shape([[-196, 214], [-182, 268], [-150, 306], [-122, 326], [-78, 326], [-52, 302], [-22, 260], [-8, 232]], { ...rockLit, gloss: lens([-150, 290], 5, 24, 0.5, HOT, 0.22) }, { round: 0.45, sharp: [3, 4] }, (p) => {
        // stacked slabs: the courses of the cone, a lit seam under each
        for (const [y, x0, x1] of [[236, -192, -12], [262, -176, -28], [288, -158, -46], [310, -136, -66]] as const) {
          p.contour([[x0, y], [(x0 + x1) / 2, y + 6], [x1, y]], { closed: false }).stroke(PALETTE.enemyInk, 4, 0.7);
          p.contour([[x0 + 6, y - 2], [(x0 + x1) / 2, y + 3], [x1 - 6, y - 2]], { closed: false }).stroke(EMBER, 1.8, 0.7);
        }
      }),
    );
    const craterHole = k.part('crater', (pen) => {
      pen.ellipse(0, 0, 40, 10).fill(PALETTE.enemyInk);
      pen.ellipse(0, -1, 34, 7).fill(mix(DEEP, EMBER, 0.7));
      pen.ellipse(0, -1, 18, 4).fill(HOT);
    });
    const craterGlow = k.glow(EMBER, 200, 0);
    const lid = k.part('lid', (pen) => pen.shape([[0, -8], [4, 8], [40, 12], [76, 6], [80, -8], [40, -14]], { ...rockLit, gloss: lens([30, 6], 18, 3, 0, HOT, 0.3) }, { round: 0.3, sharp: [0, 4] }, (p) => {
      p.contour([[6, -6], [40, -2], [74, -6]], { closed: false }).stroke(EMBER, 1.8, 0.7);
    }));
    const beacon = new Beacon(k, EMBER, 220, mix(EMBER, PALETTE.whiteHot, 0.3));

    // the head, in its own group at the end of the neck: skull, brow, tusks, jaw, eyes, the glow of the throat
    const neck = k.part('neck', (pen) => pen.shape([[-44, -40], [-50, 20], [-30, 64], [20, 70], [34, 30], [30, -34]], rock, { round: 0.8 }));
    const skull = k.part('skull', (pen) =>
      pen.shape([[-30, -6], [-44, 22], [-26, 56], [26, 70], [74, 52], [118, 20], [126, -4], [100, -16], [40, -16], [-4, -22]], { ...rockLit, gloss: lens([-4, 52], 40, 4, 0.1, HOT, 0.25) }, { round: 0.7, sharp: [6] }, (p) => {
        p.hard([[0, 42], [50, 54], [92, 30], [60, 32], [10, 28]]).fill(PALETTE.enemyInk, 0.55);
        p.contour([[84, 14], [100, 6], [118, 4]], { closed: false }).stroke(PALETTE.enemyInk, 3, 0.8);
        p.circle(104, 18, 3.4).fill(PALETTE.enemyInk, 0.9);
      }),
    );
    const jaw = k.part('jaw', (pen) => pen.shape([[0, 8], [-6, -10], [20, -28], [76, -26], [112, -8], [118, 6], [78, 0], [30, 2]], rock, { round: 0.5, sharp: [5] }, (p) => {
      for (const x of [58, 76, 94]) p.hard([[x - 5, 0], [x, 12], [x + 5, 0]]).fill(TUSK);
    }));
    const mouthGlow = k.part('mouth', (pen) => {
      pen.hard([[-6, 2], [110, 2], [120, -8], [-2, -10]]).fill(mix(DEEP, EMBER, 0.75));
    });
    const throatGlow = k.glow(HOT, 90, 0);
    const tusks = [0, 1].map((i) => k.part(`tusk${i}`, (pen) => pen.shape([[0, 0], [10, 22], [42, 44], [86, 36], [50, 26], [26, 6], [18, -8]], { ...solidTusk(i) }, { round: 0.6, sharp: [3] })));
    const brow = k.part('brow', (pen) => pen.shape([[-12, 0], [-6, 14], [40, 22], [84, 10], [60, 0], [30, 4]], rock, { round: 0.4, sharp: [4] }));
    const eyeGlow = k.glow(HOT, 54, 0);
    const eye = k.part('eye', (pen) => pen.hard([[-10, 0], [2, 6], [16, 1], [2, -4]]).fill(PALETTE.whiteHot));
    head.addChild(neck, jaw, mouthGlow, throatGlow, skull, ...tusks, brow, eye, eyeGlow);

    // the plates down the back, between the cone and the neck: slabs that lift a little with the breath
    const plates = [0, 1, 2, 3].map((i) => k.part(`plate${i}`, (pen) => pen.shape([[-26, 0], [-24, 22 + (i % 2) * 6], [0, 34], [26, 22], [28, 0]], rockLit, { round: 0.3, sharp: [2] }, (p) => p.line([-20, 2], [22, 2]).stroke(EMBER, 2, 0.8))));
    const ring = k.part('ring', (pen) => {
      pen.ellipse(0, 0, 130, 14).stroke(EMBER, 6, 0.95);
      pen.ellipse(0, 0, 110, 10).stroke(HOT, 2, 0.8);
    });
    ring.blendMode = 'add';
    const dust = new Motes(k, 16, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 34, 0.3);
    const embers = new Motes(k, 20, EMBER, 14, 0.8);
    const craterEmbers = new Motes(k, 16, HOT, 12, 0.5);
    const bombs = [0, 1, 2, 3].map(() => k.glow(HOT, 40, 0));
    const bits = Array.from({ length: 10 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [30 + (i % 3) * 8, 10], [40, 44 + (i % 3) * 12], [8, 52]], rockLit, { round: 0.2, sharp: [0, 1, 2, 3] })));
    for (const b of bits) b.visible = false;

    hull.addChild(torso, seams, ...plates, mound, craterHole, craterGlow, beacon, lid, head);
    root.addChild(legs[0]!.root, legs[1]!.root, tail, tailGlow, hull, legs[2]!.root, legs[3]!.root, ring, dust, embers, craterEmbers, ...bombs, ...bits);
    hull.pivot.set(PIVOT[0], -PIVOT[1]);
    place(craterHole, CRATER[0], CRATER[1] - 2);
    place(torso, 0, 0);
    plates.forEach((pl, i) => place(pl, -2 + i * 40, 250 + Math.max(0, 16 - i * 4) - i * 6, -0.1 + i * 0.07));

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let walk = k.seed * 2;
    let scattered = false;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const charge = key === 'charge';
        const stomp = key === 'stomp';
        const bombAtk = key === 'bombs';
        const rolls = key === 'rolls';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const third = f.hpFrac < 0.3 ? 1 : 0;
        const fall = dead ? easeIn(f.dying) : 0;
        const moving = Math.abs(f.vx) > 0.25 && !dead;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.3 * second + 0.2 * third, roar), 10, dt) : heat;
        if (moving) walk += dt * (0.34 + Math.abs(f.vx) * 0.32);

        // the hull: heaves with every stride, rears onto its hind legs for the stomp, goes down at the head for the charge, rocks back for the bombs, sags when it is spent
        let pitch = (moving ? 0.014 * Math.sin(walk * TAU * 2) : 0.008 * Math.sin(f.t * 1.1)) - 0.02 * open;
        if (stomp) pitch += wind ? 0.3 * easeOut(f.p) : strike ? 0.3 * Math.max(0, 1 - f.p * 5) - 0.05 * Math.min(1, f.p * 6) * (1 - f.p) : 0;
        if (charge) pitch += wind ? 0.04 * f.p : strike ? -0.06 : 0;
        if (bombAtk) pitch += wind ? 0.14 * easeOut(f.p) : strike ? 0.14 * Math.max(0, 1 - f.p * 3) - 0.04 : 0;
        if (rolls && (wind || strike)) pitch += 0.05 * Math.sin(f.t * 14);
        const bounce = (moving ? -5 * Math.abs(Math.sin(walk * Math.PI * 2)) : 2 * Math.sin(f.t * 1.2)) - 10 * (1 - awake) - 18 * open - 120 * fall * fall;
        const shake = (roar * 7 + 6 * f.hurt) * Math.sin(f.t * 58) * 0.4;
        place(hull, PIVOT[0] + shake, PIVOT[1] + bounce, -(dead ? 0 : pitch));
        // a point of the hull as the heave and the rearing have put it, for the legs that hang from it
        const at = (x: number, y: number): Pt => {
          const a = dead ? 0 : pitch;
          const dx = x - PIVOT[0];
          const dy = y - PIVOT[1];
          return [PIVOT[0] + dx * Math.cos(a) - dy * Math.sin(a) + shake, PIVOT[1] + dy * Math.cos(a) + dx * Math.sin(a) + bounce];
        };

        // the legs: the front pair are the heavy ones; walking, galloping in the charge; the forelegs lifted and folded in the rearing, driven down with the fall; fists brought down in the rolls
        const hips: Pt[] = [at(-150, 126), at(10, 128), at(-98, 120), at(62, 124)];
        const plant = [-176, 40, -120, 118];
        legs.forEach((leg, i) => {
          const front = i % 2 === 1;
          const near = i >= 2;
          const c = footCycle(walk + (front ? 0.5 : 0) + (near ? 0.25 : 0), charge && strike ? 90 : 46, charge && strike ? 38 : 22);
          const h = hips[i]!;
          leg.root.position.set(h[0], -h[1]);
          let fx = plant[i]! + (moving ? c.x : 0);
          let fy = moving ? c.y : 0;
          if (front && stomp && (wind || strike)) {
            fy = wind ? 120 * easeOut(f.p) : 120 * Math.max(0, 1 - f.p * 6);
            fx += wind ? -30 * f.p : 30 * Math.min(1, f.p * 4);
          }
          if (front && rolls && (wind || strike)) {
            const beat = Math.sin(f.t * 18 + (near ? 0 : Math.PI));
            fy = Math.max(0, beat) * 70;
            fx += 30 * Math.max(0, beat);
          }
          if (front && charge && wind) {
            // the scrape: the near fist drags back along the floor, twice
            fy = near ? Math.max(0, Math.sin(f.p * TAU * 2)) * 36 : 0;
            fx += near ? -50 * Math.max(0, Math.sin(f.p * TAU * 2)) : 0;
          }
          if (dead) fx += (i - 1.5) * 26 * f.dying;
          leg.reach(fx - h[0], -h[1] + 12 + fy, front ? 1 : -1);
        });

        // the head: low on the neck for the charge, rearing back with the jaw open for the bombs, slammed down at the stomp; the eyes
        const hb = at(100, 170);
        const aim = (charge && wind ? -0.18 * f.p : charge && strike ? -0.3 : 0) + (bombAtk ? (wind ? 0.42 * easeOut(f.p) : strike ? 0.42 * Math.max(0, 1 - f.p * 3) - 0.18 : 0) : 0) + (stomp && wind ? 0.2 * f.p : 0) - (stomp && strike ? 0.2 : 0) + 0.04 * Math.sin(f.t * 1.3) - 0.2 * (1 - awake) + 0.2 * open - 0.5 * fall + 0.3 * roar;
        const jawOpen = Math.max(bombAtk ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0, roar, open * 0.25, charge && strike ? 0.2 : 0, 0.05 * Math.sin(f.t * 1.4));
        place(head, hb[0], hb[1] + (charge && strike ? -30 : 0) - 20 * (1 - awake), -(dead ? 0 : pitch) + aim, 1, 1);
        place(jaw, 24, 4, -0.5 * jawOpen - 0.2 * fall, 1, 1);
        place(skull, 0, 0);
        place(mouthGlow, 24, 4, -0.5 * jawOpen, 1, 1);
        mouthGlow.alpha = jawOpen * 0.95;
        place(tusks[1]!, 70, -8, 0.12, 0.85, 0.85);
        place(tusks[0]!, 80, -6, 0, 1, 1);
        place(brow, 36, 42);
        place(eye, 94 + 4 * heat, 36, -0.1, 1 + 0.4 * heat, 0.8 + 0.5 * heat);
        eye.alpha = (0.4 + 0.6 * awake) * (dead ? 1 - f.dying : 1);
        eyeGlow.position.set(100, -36);
        eyeGlow.alpha = Math.min(1, awake * (0.25 + 0.75 * heat) + 0.3 * second + roar) * (dead ? 0 : 1);
        eyeGlow.scale.set((50 + 50 * heat) / eyeGlow.texture.width);
        const bombT = bombAtk ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0;
        throatGlow.position.set(70, 0);
        throatGlow.alpha = Math.min(1, bombT * 0.9 + 0.15 * heat + 0.4 * roar) * (dead ? 0 : 1);
        throatGlow.scale.set((60 + 80 * bombT) / throatGlow.texture.width);
        place(neck, -36, 12);

        // the cone: its seams glow a little all the time and a great deal in anger; the lid heaves up on its hinge when it is spent, and the crater shows
        const glowTo = Math.min(1, 0.32 + 0.6 * heat + 0.4 * second + 0.5 * roar + 0.4 * open + 0.25 * third);
        seams.alpha = glowTo * (dead ? Math.max(0, 1 - Math.max(0, f.dying - 0.45) * 2) : 1);
        place(lid, CRATER[0] - 40, CRATER[1] + 2, 1.0 * open + 0.06 * Math.sin(f.t * 3) * open, 1, 1);
        craterHole.alpha = Math.min(1, open * 1.4);
        craterGlow.position.set(CRATER[0], -CRATER[1]);
        craterGlow.alpha = Math.min(0.85, open * 0.8 + 0.12 * awake * heat + (dead ? Math.max(0, 1 - Math.abs(f.dying - 0.3) * 4) : 0));
        craterGlow.scale.set((130 + 100 * open + 40 * Math.sin(f.t * 5) * open) / craterGlow.texture.width);
        beacon.show(f.t, CRATER, open, 0);
        craterEmbers.position.set(CRATER[0], -CRATER[1]);
        craterEmbers.show(f.t, 0, 0, 90, 260, 0.7, open * 0.95 + (dead && f.dying > 0.2 && f.dying < 0.8 ? 0.9 : 0));
        plates.forEach((pl, i) => { pl.alpha = dead ? 1 - Math.min(1, f.dying * 1.8) : 1; place(pl, -2 + i * 40, 250 + Math.max(0, 16 - i * 4) - i * 6 + 3 * Math.sin(f.t * 1.3 + i) + 4 * heat, -0.1 + i * 0.07); });

        // the tail: a stump that drags and lashes a little with the charge
        const th = at(-196, 150);
        const tpts = tentacle(th, Math.PI + 0.2 + 0.2 * Math.sin(f.t * 1.2) + (charge && strike ? 0.15 : 0), 110, 6, 0.2, 0.08, f.t * 1.5);
        tail.setSpine(tpts);
        tailGlow.position.set(tpts[5]![0], -tpts[5]![1]);
        tailGlow.alpha = glowTo * 0.5 * (dead ? 0 : 1);
        tailGlow.scale.set(54 / tailGlow.texture.width);

        // lava bombs rising in the jaw and going out in an arc; the shock of the stomp and the rolls; dust under the feet; embers off the seams
        bombs.forEach((b, i) => {
          const on = bombAtk && (wind || strike) && !dead;
          b.alpha = 0;
          if (!on) return;
          const u = wind ? easeIn(f.p) * 0.3 : 0.3 + 0.7 * f.p;
          const x = hb[0] + 120 + 220 * u * (0.6 + 0.2 * i);
          const y = hb[1] + 20 + 160 * Math.sin(u * Math.PI * 0.9) * (0.5 + 0.2 * i) - 40 * u;
          b.position.set(x, -y);
          b.alpha = strike ? Math.max(0, 1 - f.p * 0.9) : 0.8 * u * 3;
          b.scale.set((30 + 26 * (strike ? 1 : u * 3)) / b.texture.width);
        });
        ring.visible = (stomp && strike && f.p < 0.6) || (rolls && strike && f.p < 0.9);
        if (ring.visible) {
          const u = Math.min(1, stomp ? f.p / 0.6 : f.p / 0.9);
          place(ring, 130, 4, 0, 0.3 + 2.8 * easeOut(u), 1);
          ring.alpha = (1 - u) * 0.9;
        }
        dust.position.set(0, -2);
        dust.show(f.t, 20, 12, 420, 50, 0.6, (charge && strike ? 0.9 : 0) + (stomp && strike ? 1 - f.p : 0) + (moving ? 0.25 : 0) + (rolls && strike ? 0.5 : 0) + (dead && f.dying > 0.3 ? 0.8 : 0));
        embers.position.set(0, -(hb[1] + 40));
        embers.show(f.t, -40, 60, 380, 260, 0.5, (0.05 + 0.4 * second + 0.7 * roar + 0.3 * heat) * awake + (dead ? 0.9 * (1 - fall * 0.5) : 0));

        // the death: the cone bursts, the lava runs out, the whole of it goes cold
        if (dead) {
          scattered = true;
          const g = Math.min(1, Math.max(0, (f.dying - 0.2) / 0.8) * 1.1);
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [-130 + (i - 5) * 12, 330], [(i - 5) * 52, 160 + (i % 4) * 46], (i - 5) * 1.6, 560, 6, g);
              b.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
            }
          });
          const fade = 1 - Math.max(0, (f.dying - 0.6) / 0.4);
          torso.alpha = mound.alpha = lid.alpha = head.alpha = tail.alpha = fade;
          for (const l of legs) l.root.alpha = fade;
        } else {
          if (scattered) scattered = false;
          for (const b of bits) b.visible = false;
          torso.alpha = mound.alpha = lid.alpha = head.alpha = tail.alpha = 1;
          for (const l of legs) l.root.alpha = 1;
        }
      },
    };
  },
};

/** The two tusks: bone-pale, lit from above. */
function solidTusk(i: number) {
  return scorched(i ? mix(TUSK, ROCK, 0.5) : TUSK, HOT, { width: 2 });
}
