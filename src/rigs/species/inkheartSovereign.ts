import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE INKHEART SOVEREIGN (docs/PROMPT24-LOG.md): a king made of the dark. It has no legs — a mantle hangs from its shoulders and hovers a hand's breadth over its own pool of ink — and a high collar of two swept horns, a smooth black mask with
 * three white slits cut one above the other for a face, a crown of seven thorns that lean back like a flame, and two long arms that end in three blades each. Its chest is OPEN: a cavity framed by three pairs of ribs of ink, and in it the HEART,
 * a violet organ that never stops beating — it is the place to hit (it takes a blow harder than the rest of it), and when the king is spent the ribs spread, the heart swells and rings run out from it. The cut is a vanishing (the mantle
 * thins to nothing) and a return behind the hero with the arm already raised, then a crescent of light hung in the air; the rain is both arms up and black drops gathering over the crown; the orbs are five spheres forming in a fan at the far hand;
 * the nova is the arms thrown wide and the chest blazing; the march is both fists driven into the floor. Dead, the mantle falls in on itself into the pool, the crown comes apart and the heart cracks and goes out.
 */

const INK = PALETTE.enemyInk;
const RIM = PALETTE.violetCore;
const GLOW = PALETTE.violetGlow;
const DEEP = PALETTE.violetDeep;
const HOT = PALETTE.whiteHot;
const MANTLE = mix(INK, DEEP, 0.34);
const COLS = 6;
const ROWS = 9;
const HEART: Pt = [8, 196];
const SHOULDER_N: Pt = [24, 214];
const SHOULDER_F: Pt = [-22, 218];

export const INKHEART_SOVEREIGN_RIG: RigDef = {
  id: 'boss_sovereign',
  width: 2.4,
  height: 3.4,
  shadow: 260,
  aura: { color: RIM, at: [0, 190], size: 480, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('inkheart-sovereign');
    const body = k.group('body');
    const blades = (pen: Pen, l2: number): void => {
      for (const [dy, len, a] of [[8, 78, 0.1], [0, 96, 0], [-8, 70, -0.12]] as const) {
        pen.shape([[l2 - 4, dy + 7], [l2 + len * 0.55, dy + 5 + a * 40], [l2 + len, dy + a * 70], [l2 + len * 0.5, dy - 4], [l2 - 4, dy - 6]], ink(GLOW, { width: 1.8 }), { round: 0.2, sharp: [2] });
      }
      pen.circle(l2 - 2, 0, 11).fill(INK);
      pen.circle(l2 - 2, 0, 11).stroke(RIM, 1.8, 0.8);
    };
    const armSpec = { l1: 80, l2: 88, w0: 30, w1: 22, w2: 14, mat: ink(RIM, { width: 2 }), foot: blades };
    const armFar = new Leg(k, 'arm-far', { ...armSpec, mat: { ...ink(RIM, { width: 1.4 }), fill: mix(INK, DEEP, 0.2) } });
    const armNear = new Leg(k, 'arm-near', armSpec);

    const pool = k.dark(230, 34, 0.55);
    const poolRim = k.part('pool-rim', (pen) => {
      pen.ellipse(0, 0, 88, 11).stroke(RIM, 3, 0.75);
      pen.ellipse(0, 0, 54, 6.5).stroke(GLOW, 2, 0.5);
    });
    poolRim.blendMode = 'add';
    const mantle = k.cloth({ cols: COLS, rows: ROWS, color: MANTLE, ramp: 'soft', alpha: 0.98 }, 'mantle');
    const lining = k.cloth({ cols: COLS, rows: ROWS, color: mix(DEEP, INK, 0.55), ramp: 'soft', alpha: 0.9 }, 'lining');
    const edgeBack = k.ribbon({ n: ROWS + 1, width: (u) => 3.4 * (1 - u * 0.7) + 0.4, color: GLOW, ramp: 'flat', alpha: 0.85 }, 'edge-back');
    const edgeHem = k.ribbon({ n: COLS + 1, width: () => 2.2, color: RIM, ramp: 'flat', alpha: 0.7 }, 'edge-hem');
    const torso = k.part('torso', (pen) => pen.shape([[-30, 128], [-38, 176], [-34, 232], [-16, 258], [18, 258], [36, 232], [40, 176], [32, 128], [0, 118]], { ...ink(RIM, { width: 2.4 }), ramp: 'sphere' }, { round: 0.9 }));
    const cavity = k.part('cavity', (pen) => {
      pen.shape([[-1, -42], [-24, -22], [-28, 8], [-16, 40], [4, 48], [24, 38], [30, 8], [22, -24]], { fill: mix(INK, DEEP, 0.55), edge: { color: GLOW, width: 2.4, alpha: 0.9 }, rims: [] }, { round: 1 });
    });
    const ribs = [0, 1, 2].map((i) => k.part(`rib${i}`, (pen) => {
      const w = 34 - i * 5;
      pen.contour([[-w, 0], [-w * 0.4, 7 + i], [0, 9 + i], [w * 0.4, 7 + i], [w, 0]], { closed: false }).stroke(INK, 9, 1);
      pen.contour([[-w, 0], [-w * 0.4, 7 + i], [0, 9 + i], [w * 0.4, 7 + i], [w, 0]], { closed: false }).stroke(RIM, 2.2, 0.9);
    }));
    const heart = k.part('heart', (pen) => {
      pen.shape([[0, 34], [20, 20], [26, -4], [12, -28], [0, -34], [-12, -28], [-26, -4], [-20, 20]], { fill: mix(DEEP, GLOW, 0.5), ramp: 'sphere', rims: [{ color: HOT, width: 2.6, alpha: 0.9 }], gloss: lens([-8, 18], 6, 9, 0.3, HOT, 0.5) }, { round: 1 }, (p) => {
        p.contour([[0, 30], [-4, 8], [6, -10], [0, -28]], { closed: false }).stroke(HOT, 1.6, 0.6);
        p.contour([[14, 14], [8, 0], [14, -14]], { closed: false }).stroke(HOT, 1.2, 0.45);
      });
    });
    const heartGlow = k.glow(GLOW, 150, 0);
    const beacon = new Beacon(k, GLOW, 140, mix(RIM, GLOW, 0.6));
    const collar = k.part('collar', (pen) => {
      for (const s of [1, -1]) pen.shape([[0, 0], [s * 8 - 12, 30], [s * 30 - 22, 66], [s * 54 - 30, 84], [s * 36 - 14, 50], [s * 24, 14], [s * 20, 0]], ink(GLOW, { width: 1.8 }), { round: 0.6, sharp: [3] });
    });
    const head = k.part('head', (pen) => pen.shape([[-17, 0], [-22, 24], [-15, 50], [1, 62], [16, 50], [22, 24], [17, 0], [0, -9]], { ...ink(GLOW, { gloss: lens([-8, 36], 3, 14, 0.12, HOT, 0.3), width: 2.6 }), ramp: 'sphere' }, { sharp: [3], round: 0.9 }));
    const eyes = [0, 1, 2].map((i) => k.part(`eye${i}`, (pen) => pen.hard([[0, 0], [5 - i, 5 + i], [11 - i * 2, 0], [5 - i, -5 - i]]).fill(HOT)));
    const eyeGlow = k.glow(GLOW, 90, 0);
    const spikes = [0, 1, 2, 3, 4, 5, 6].map((i) => k.part(`spike${i}`, (pen) => pen.shape([[-6, 0], [-10, 30 + (i % 3) * 8], [-4, 62 + (i % 2) * 18], [-2, 70 + (i % 4) * 14], [8, 38], [7, 0]], ink(GLOW, { width: 1.8 }), { round: 0.5, sharp: [3] })));
    const orbs = [0, 1, 2, 3, 4].map(() => k.part('orb', (pen) => {
      pen.circle(0, 0, 15).fill(mix(DEEP, GLOW, 0.4));
      pen.circle(0, 0, 15).stroke(HOT, 2.2, 0.9);
      pen.circle(-4, 4, 5).fill(HOT, 0.85);
    }));
    const orbGlow = orbs.map(() => k.glow(GLOW, 70, 0));
    const drops = [0, 1, 2].map(() => k.part('drop', (pen) => pen.shape([[0, 34], [11, 10], [14, -8], [0, -20], [-14, -8], [-11, 10]], { ...ink(GLOW, { width: 2.2 }), ramp: 'sphere' }, { round: 1, sharp: [0] })));
    const dropGlow = drops.map(() => k.glow(RIM, 90, 0));
    const slash = k.part('slash', (pen) => {
      const out: Pt[] = [];
      const inn: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (130 - i * 16.5) * (Math.PI / 180);
        out.push([Math.cos(a) * 196, Math.sin(a) * 196]);
        inn.push([Math.cos(a) * (150 - Math.sin((i / 10) * Math.PI) * 14), Math.sin(a) * (150 - Math.sin((i / 10) * Math.PI) * 14)]);
      }
      pen.hard([...out, ...inn.reverse()]).fill(GLOW, 0.5);
      pen.hard([...out.map((p): Pt => [p[0] * 0.97, p[1] * 0.97])]).fill(HOT, 0);
      pen.contour(out, { closed: false, round: 0.5 }).stroke(HOT, 3, 0.95);
    });
    slash.blendMode = 'add';
    const ring = k.part('ring', (pen) => {
      pen.ellipse(0, 0, 100, 100).stroke(GLOW, 5, 0.95);
      pen.ellipse(0, 0, 90, 90).stroke(HOT, 2, 0.8);
    });
    ring.blendMode = 'add';
    const splash = new Motes(k, 16, GLOW, 22, 0.5);
    const bits = Array.from({ length: 9 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [14 + (i % 3) * 6, 5], [20, 34 + (i % 4) * 10], [4, 38]], ink(GLOW, { width: 1.6 }), { round: 0.3, sharp: [0, 1, 2, 3] })));
    for (const b of bits) b.visible = false;

    body.addChild(armFar.root, torso, cavity, ...ribs, heart, heartGlow, beacon, collar, head, ...eyes, eyeGlow, ...spikes, armNear.root);
    root.addChild(pool, poolRim, mantle, lining, edgeBack, edgeHem, body, ...orbGlow, ...orbs, ...dropGlow, ...drops, slash, ring, splash, ...bits);
    place(torso, 0, 0);
    place(heart, HEART[0], HEART[1]);
    place(cavity, HEART[0], HEART[1] + 4);

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let trail = 0;
    let scattered = false;
    const hemTooth = [0, 9, 2, 12, 4, 10, 1];

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const cut = key === 'cut';
        const rain = key === 'rain';
        const orbsAtk = key === 'orbs';
        const nova = key === 'nova';
        const march = key === 'march';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const third = f.hpFrac < 0.33 ? 1 : 0;
        const fall = dead ? easeIn(f.dying) : 0;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.3 * second + 0.2 * third, roar), 10, dt) : heat;
        trail = dt > 0 ? damp(trail, -f.vx * 9, 5, dt) : trail;

        // the body hovers: a slow bob, a lean back to wind up, forward into the blow, the whole of it sagging when it is spent
        const bob = 8 + 6 * Math.sin(f.t * 1.5) - 10 * open - 8 * (1 - awake) - 90 * fall;
        const lean = (wind && cut ? -0.07 * f.p : 0) + (strike && cut ? 0.09 : 0) + (wind && rain ? -0.04 * f.p : 0) + 0.04 * open + 0.02 * f.hurt;
        const shake = (roar * 5 + 5 * f.hurt) * Math.sin(f.t * 62) * 0.4;
        place(body, shake, bob, -lean);
        pool.position.set(0, -2);
        pool.alpha = (0.55 - 0.15 * (bob > 20 ? 1 : 0)) * (dead ? 1 - f.dying * 0.6 : 1);
        place(poolRim, 0, 2, 0, 1 + 0.06 * Math.sin(f.t * 2) + 0.25 * roar + (strike && march ? 0.3 * f.p : 0), 1);
        poolRim.alpha = awake * (0.5 + 0.4 * heat) * (dead ? 1 - f.dying : 1);

        // the mantle: it hangs from the shoulders, streams behind when it moves and flares with the blow, falls in on itself in the end
        const flare = 1 + 0.5 * Math.max(roar, nova ? (wind ? easeOut(f.p) : strike ? 1 : 0) : 0) + 0.16 * second;
        const yAt = (j: number): number => 252 + bob - ((252 + bob - (36 + bob * 0.4)) * j) / ROWS * (1 - 0.8 * fall);
        const x0 = (j: number): number => -14 * (j / ROWS) - (trail + 7 * Math.sin(f.t * 1.2)) * (j / ROWS) ** 2;
        const halfW = (j: number): number => (40 + 70 * (j / ROWS)) * flare * (1 - 0.5 * fall);
        const edgeX = (j: number, back: boolean): number => (back ? x0(j) - halfW(j) : x0(j) + halfW(j) * 0.5 + 10);
        mantle.setPoints((i, j) => {
          const back = edgeX(j, true);
          const front = edgeX(j, false);
          const tooth = j === ROWS ? (hemTooth[i % hemTooth.length]! * (1 + 0.4 * Math.sin(f.t * 3 + i))) * (1 - fall) : 0;
          return [back + ((front - back) * i) / COLS + 3 * Math.sin(f.t * 1.4 + j * 0.8 + i) * (j / ROWS), yAt(j) - tooth] as Pt;
        });
        lining.setPoints((i, j) => {
          const back = edgeX(j, true) * 0.86 + 4;
          const front = edgeX(j, false) * 0.9 - 2;
          return [back + ((front - back) * i) / COLS, yAt(j) - 2 + (j === ROWS ? hemTooth[i % hemTooth.length]! * 0.6 : 0)] as Pt;
        });
        const backEdge: Pt[] = [];
        for (let j = 0; j <= ROWS; j++) backEdge.push([edgeX(j, true), yAt(j)]);
        edgeBack.setSpine(backEdge);
        const hem: Pt[] = [];
        for (let i = 0; i <= COLS; i++) {
          const back = edgeX(ROWS, true);
          const front = edgeX(ROWS, false);
          hem.push([back + ((front - back) * i) / COLS, yAt(ROWS) - (hemTooth[i % hemTooth.length]! * (1 + 0.4 * Math.sin(f.t * 3 + i))) * (1 - fall)]);
        }
        edgeHem.setSpine(hem);
        const cloakAlpha = (dead ? 1 - Math.max(0, (f.dying - 0.6) / 0.4) : 1) * (0.35 + 0.65 * awake);
        mantle.alpha = lining.alpha = cloakAlpha;
        edgeBack.alpha = edgeHem.alpha = cloakAlpha * 0.9;

        // the chest: the ribs spread, the heart swells and beats faster when it is spent; it burns through the warning and the nova
        const burn = Math.max(open, nova ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0, heat * 0.6, roar);
        const beat = Math.sin(f.t * (3.2 + 5 * burn));
        place(heart, HEART[0], HEART[1], 0, (0.9 + 0.3 * open + 0.12 * burn) * (1 + 0.06 * beat), (0.9 + 0.3 * open + 0.12 * burn) * (1 + 0.06 * beat));
        heart.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.7) / 0.2)) : 1;
        heartGlow.position.set(HEART[0], -HEART[1]);
        heartGlow.alpha = Math.min(0.7, (0.2 + 0.5 * burn + 0.08 * beat) * awake) * (dead ? Math.max(0, 1 - f.dying * 1.4) : 1);
        heartGlow.scale.set((100 + 70 * burn + 10 * beat) / heartGlow.texture.width);
        place(cavity, HEART[0], HEART[1] + 4, 0, 1 + 0.3 * open + 0.2 * burn, 1 + 0.35 * open + 0.2 * burn);
        ribs.forEach((r, i) => place(r, HEART[0], HEART[1] + 20 - i * 22, 0, 1 + 0.5 * open + 0.2 * burn, 1 + 0.4 * open));
        beacon.show(f.t, HEART, open, 0.06 * awake);

        // the face and the crown: three slits that widen with the warning, a flame of thorns that stands up with the second phase and the roar
        const hy = 262 + 0.6 * bob + (dead ? -30 * fall : 0);
        place(collar, 0, 232 + bob * 0.9);
        place(head, 4, hy - 10, 0.05 * Math.sin(f.t * 1.1) - (wind && cut ? 0.12 * f.p : 0) + 0.14 * open - 0.1 * fall, 1, 1);
        eyes.forEach((e, i) => {
          place(e, 7 + i, hy - 10 + 14 + i * 15, 0, 1 + 0.25 * heat, 0.8 + 0.7 * heat + 0.2 * second);
          e.alpha = awake * (0.5 + 0.5 * Math.max(heat, 0.6)) * (1 - 0.7 * open) * (dead ? 1 - f.dying : 1);
        });
        eyeGlow.position.set(12, -(hy - 10 + 34));
        eyeGlow.alpha = Math.min(1, awake * (0.15 + 0.85 * heat) + 0.3 * second + roar) * (dead ? 0 : 1);
        eyeGlow.scale.set((70 + 60 * heat + 20 * second) / eyeGlow.texture.width);
        spikes.forEach((s, i) => {
          const grow = 1 + 0.35 * second + 0.25 * roar + 0.15 * heat;
          const a = 0.25 + i * 0.13 + 0.05 * Math.sin(f.t * 2 + i);
          place(s, -8 + i * 6 - 4, hy + 34 + (i % 2) * 4, -a * 1.1 - 0.15 * (wind ? f.p : 0) + 0.05 * f.hurt, 0.9 * grow, grow * (0.85 + 0.2 * (i % 3) / 2));
          s.alpha = dead ? 0 : 1;
        });
        void SHOULDER_F;

        // the arms: hanging, raised behind and swung through an arc for the cut, up for the rain, out for the orbs, wide for the nova, driven down for the march
        const arms: Array<[Leg, Pt, number]> = [[armFar, [SHOULDER_F[0], SHOULDER_F[1] + bob], 0], [armNear, [SHOULDER_N[0], SHOULDER_N[1] + bob], 1]];
        const slashT = cut && strike ? f.p : 0;
        for (const [arm, sh, near] of arms) {
          arm.root.position.set(sh[0], -sh[1]);
          let tx = (near ? 34 : -26) + 8 * Math.sin(f.t * 1.3 + near * 2);
          let ty = -150 + 6 * Math.sin(f.t * 1.7 + near) - 24 * (1 - awake);
          if (cut && (wind || strike)) {
            if (near) {
              const th = (130 - (strike ? 165 * easeOut(Math.min(1, slashT * 1.6)) : 0)) * (Math.PI / 180);
              tx = Math.cos(th) * 150;
              ty = Math.sin(th) * 150;
              if (wind) { tx += 5 * Math.sin(f.t * 40); ty += 5 * Math.cos(f.t * 37); }
            } else {
              tx = -70;
              ty = -70;
            }
          } else if (rain && (wind || strike)) {
            const up = wind ? easeOut(f.p) : Math.max(0, 1 - f.p * 3);
            tx = (near ? 40 : -40) * (1 - up * 0.3);
            ty = -150 + 330 * up;
          } else if (orbsAtk && (wind || strike)) {
            if (near) { tx = 60; ty = -110; } else { tx = 150; ty = -10 + 24 * (strike ? f.p : 0); }
          } else if (nova && (wind || strike)) {
            const out = wind ? easeOut(f.p) : 1;
            tx = (near ? 1 : -1) * 150 * out;
            ty = -20 * out;
          } else if (march && (wind || strike)) {
            const up = wind ? easeOut(f.p) : Math.max(0, 1 - f.p * 4);
            tx = near ? 70 : 20;
            ty = -190 + 320 * up;
          } else if (open > 0.3) {
            tx = (near ? 1 : -1) * 70;
            ty = -130;
          } else if (dead) {
            tx = (near ? 1 : -1) * 90;
            ty = -120 - 60 * fall;
          }
          arm.reach(tx, ty, -1);
        }

        // the orbs: five spheres forming in a fan at the far hand, going out with the blow; the drops of the rain gathering over the crown, then falling
        orbs.forEach((o, i) => {
          const show = orbsAtk && (wind || strike) && !dead;
          o.visible = show;
          orbGlow[i]!.alpha = 0;
          if (!show) return;
          const u = wind ? easeOut(f.p) : 1;
          const fan = (i - 2) * 0.34;
          const out = strike ? 60 + 220 * f.p * f.p : 40;
          const ox = SHOULDER_F[0] + 150 + Math.cos(fan) * out;
          const oy = SHOULDER_F[1] + bob - 10 + Math.sin(fan) * out * 0.6 + (strike ? 0 : 6 * Math.sin(f.t * 5 + i));
          place(o, ox, oy, f.t * 2, 0.2 + 0.9 * u, 0.2 + 0.9 * u);
          o.alpha = strike ? Math.max(0, 1 - f.p * 1.2) : u;
          const g = orbGlow[i]!;
          g.position.set(ox, -oy);
          g.alpha = o.alpha * 0.8;
          g.scale.set((40 + 50 * u) / g.texture.width);
        });
        drops.forEach((d, i) => {
          const show = rain && (wind || strike) && !dead;
          d.visible = show;
          dropGlow[i]!.alpha = 0;
          if (!show) return;
          const u = wind ? easeOut(f.p) : 1;
          const x = (i - 1) * 70 + 8 * Math.sin(f.t * 3 + i);
          const y = hy + 120 + 14 * Math.sin(f.t * 4 + i) - (strike ? 260 * f.p * f.p : 0);
          place(d, x, y, Math.PI * (strike ? 1 : 0) * 0, 0.3 + 1.1 * u, (0.3 + 1.1 * u) * (strike ? 1.4 : 1));
          d.alpha = strike ? Math.max(0, 1 - f.p * 1.4) : u;
          const g = dropGlow[i]!;
          g.position.set(x, -y);
          g.alpha = d.alpha * 0.7;
          g.scale.set((60 + 50 * u) / g.texture.width);
        });

        // the crescent of the cut and the ring of the nova
        slash.visible = cut && strike && !dead;
        if (slash.visible) {
          place(slash, SHOULDER_N[0], SHOULDER_N[1] + bob, 0, 1, 1);
          slash.alpha = Math.max(0, 0.85 - f.p * 0.85);
        }
        ring.visible = nova && strike && !dead;
        if (ring.visible) {
          place(ring, HEART[0], HEART[1] + bob, 0, 0.3 + 3.2 * easeOut(f.p), 0.3 + 3.2 * easeOut(f.p));
          ring.alpha = Math.max(0, 1 - f.p);
        }
        splash.position.set(0, -130);
        splash.show(f.t, 0, 0, 200, 220, 0.9, (cut && wind ? 0.9 * (1 - f.p) : 0) + (cut && strike ? 0.6 : 0) + roar * 0.5 + (dead && f.dying > 0.3 ? 0.9 : 0));

        // the death: the crown comes apart, the heart cracks and goes out, the king goes down into the pool
        if (dead) {
          scattered = true;
          const g = Math.min(1, Math.max(0, (f.dying - 0.2) / 0.8) * 1.1);
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [(i - 4) * 10, hy + 40 + (i % 3) * 14], [(i - 4) * 52, 130 + (i % 4) * 36], (i - 4) * 1.9, 520, 4, g);
              b.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
            }
          });
          torso.alpha = head.alpha = collar.alpha = cavity.alpha = 1 - Math.max(0, (f.dying - 0.5) / 0.5);
          for (const r of ribs) r.alpha = torso.alpha;
          armFar.root.alpha = armNear.root.alpha = torso.alpha;
        } else {
          if (scattered) scattered = false;
          for (const b of bits) b.visible = false;
          torso.alpha = head.alpha = collar.alpha = cavity.alpha = 1;
          for (const r of ribs) r.alpha = 1;
          armFar.root.alpha = armNear.root.alpha = 1;
        }
        void TAU;
      },
    };
  },
};
