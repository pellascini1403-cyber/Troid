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
 * THE CINDER SOVEREIGN (docs/PROMPT24-LOG.md): the last king, a knight of black plate with ember in its seams — a tall helm with a visor cut in the shape of a CROSS, a crown of five horns with a flame on every tip and a plume of fire streaming from the back
 * of it, broad pauldrons with upturned spikes, a cape of ash that breaks into embers at the hem, and a GREATSWORD with a cracked blade that it holds upright before it like a king at his court. In the middle of the cuirass is a round housing,
 * and in it the CORE: an ember sphere inside three bands of armour that turn about it like a gyroscope. Shut, the bands are three circles one over another and the core is hidden behind them; when the king is spent, they swing edge-on and spin
 * apart, and the core burns in the open with rings running out from it. The cut is a vanishing in embers and a return with the sword raised behind the head, then the stroke; the geysers are the blade driven into the floor ahead of it at a slant;
 * the orbs are three spheres of fire gathered in the free hand; the rush is the sword levelled and the whole body thrown forward, the cape and the plume laid flat behind; the nova is the arms flung wide and the core blazing through the bands.
 * Dead, the plate comes off piece by piece — the helm, the pauldrons, the bands — and the core goes out last, in a flash.
 */

const PLATE = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.32);
const PLATE_LIT = mix(PALETTE.enemyInk, PALETTE.worldSlate, 0.34);
const PLATE_FAR = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.16);
const CAPE = mix(PALETTE.worldDusk, PALETTE.emberDeep, 0.3);
const EMBER = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const COLS = 5;
const ROWS = 8;
const HIP_Y = 170;
const CORE: Pt = [6, 208];
const SHOULDER_N: Pt = [40, 262];
const SHOULDER_F: Pt = [-34, 266];
const BLADE = 205;

export const CINDER_SOVEREIGN_RIG: RigDef = {
  id: 'boss_cinder_sovereign',
  width: 2.8,
  height: 4.2,
  shadow: 230,
  aura: { color: EMBER, at: [0, 210], size: 520, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('cinder-sovereign');
    const body = k.group('body');
    const armor = scorched(PLATE, EMBER, { width: 2.4 });
    const armorLit = scorched(PLATE_LIT, EMBER, { width: 2.4 });
    const armorFar = scorched(PLATE_FAR, mix(EMBER, DEEP, 0.5), { width: 1.4 });
    const seam = (p: Pen, pts: Pt[], w = 1.6): void => {
      p.contour(pts, { closed: false, round: 0.3 }).stroke(EMBER, w + 2, 0.5);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(HOT, w * 0.5, 0.85);
    };
    const greave = (far: boolean) => (p: Pen, len: number, wa: number, wb: number, upper: boolean): void => {
      p.hard([[len * 0.1, wa * 0.46], [len * 0.88, wb * 0.46], [len * 0.88, wb * 0.1], [len * 0.1, wa * 0.12]]).fill(HOT, far ? 0.04 : 0.1);
      p.line([len * 0.5, wa * 0.45], [len * 0.5, -wa * 0.45]).stroke(PALETTE.enemyInk, 3.4, 0.6);
      if (!upper && !far) seam(p, [[len * 0.12, 0], [len * 0.6, 0]], 1);
    };
    const sabaton = (pen: Pen, l2: number): void => {
      pen.shape([[l2 - 16, 24], [l2 + 40, 16], [l2 + 62, -10], [l2 + 50, -26], [l2 - 16, -26]], armorLit, { round: 0.25, sharp: [2] }, (p) => p.line([l2 + 20, 14], [l2 + 24, -24]).stroke(PALETTE.enemyInk, 3, 0.6));
    };
    const legs = [new Leg(k, 'leg-far', { l1: 86, l2: 90, w0: 40, w1: 32, w2: 24, mat: armorFar, foot: sabaton, round: 0.4, detail: greave(true) }), new Leg(k, 'leg-near', { l1: 86, l2: 90, w0: 46, w1: 36, w2: 26, mat: armor, foot: sabaton, round: 0.4, detail: greave(false) })];
    const hand = (pen: Pen, l2: number): void => {
      pen.circle(l2 + 4, 0, 17).fill(PALETTE.enemyInk);
      pen.circle(l2 + 4, 0, 14).fill(PLATE_LIT);
      pen.circle(l2 + 4, 0, 14).stroke(EMBER, 1.6, 0.8);
    };
    const armFar = new Leg(k, 'arm-far', { l1: 80, l2: 84, w0: 30, w1: 24, w2: 18, mat: armorFar, foot: hand, round: 0.4, detail: greave(true) });
    const armNear = new Leg(k, 'arm-near', { l1: 80, l2: 84, w0: 34, w1: 27, w2: 20, mat: armor, foot: hand, round: 0.4, detail: greave(false) });

    const cape = k.cloth({ cols: COLS, rows: ROWS, color: CAPE, ramp: 'soft', alpha: 0.96 }, 'cape');
    const capeEdge = k.ribbon({ n: ROWS + 1, width: (u) => 3 * (1 - u * 0.6) + 0.5, color: EMBER, ramp: 'flat', alpha: 0.8 }, 'cape-edge');
    const skirt = k.part('skirt', (pen) => {
      for (let i = 0; i < 5; i++) {
        const x = -52 + i * 26;
        pen.shape([[x - 16, 0], [x - 14, -34 - (i % 2) * 8], [x, -52 - (i % 2) * 8], [x + 14, -34 - (i % 2) * 8], [x + 16, 0]], i % 2 ? armorLit : armor, { round: 0.2, sharp: [2] }, (p) => p.line([x, -8], [x, -38]).stroke(EMBER, 1.6, 0.7));
      }
    });
    const torso = k.part('torso', (pen) =>
      pen.shape([[-52, 168], [-60, 206], [-54, 250], [-34, 282], [0, 290], [36, 282], [56, 250], [62, 206], [52, 168], [0, 160]], { ...armorLit, gloss: lens([-26, 262], 6, 20, 0.5, HOT, 0.25) }, { round: 0.45 }, (p) => {
        p.hard([[-50, 172], [-58, 210], [-30, 240], [-20, 190]]).fill(PALETTE.enemyInk, 0.28);
        p.hard([[26, 270], [54, 246], [40, 214], [12, 250]]).fill(HOT, 0.08);
        seam(p, [[-56, 246], [-22, 262], [0, 288]], 1.8);
        seam(p, [[58, 246], [26, 262], [0, 288]], 1.8);
        seam(p, [[-50, 176], [-40, 210], [-54, 244]], 1.4);
        seam(p, [[52, 176], [44, 210], [56, 244]], 1.4);
      }),
    );
    const housing = k.part('housing', (pen) => {
      pen.circle(0, 0, 40).fill(PALETTE.enemyInk);
      pen.circle(0, 0, 40).stroke(EMBER, 3, 0.9);
      pen.circle(0, 0, 33).stroke(HOT, 1.4, 0.6);
    });
    const core = k.part('core', (pen) => {
      pen.shape([[0, 30], [20, 20], [26, 0], [20, -20], [0, -30], [-20, -20], [-26, 0], [-20, 20]], { fill: mix(DEEP, EMBER, 0.65), ramp: 'sphere', rims: [{ color: HOT, width: 2.6, alpha: 0.9 }], gloss: lens([-8, 12], 6, 9, 0.4, HOT, 0.5) }, { round: 1 }, (p) => {
        p.circle(2, -2, 14).fill(HOT, 0.9);
        p.circle(2, -2, 7).fill(PALETTE.whiteHot);
      });
    });
    const coreGlow = k.glow(EMBER, 190, 0);
    const bands = [0, 1, 2].map((i) => k.part(`band${i}`, (pen) => {
      const r = 38 - i * 5;
      pen.circle(0, 0, r).stroke(PALETTE.enemyInk, 9, 1);
      pen.circle(0, 0, r).stroke(i === 1 ? PLATE_LIT : PLATE, 6, 1);
      pen.arc(0, 0, r, 0.4, 2.4).stroke(HOT, 1.8, 0.8);
      for (let j = 0; j < 4; j++) pen.circle(Math.cos((j / 4) * TAU + i) * r, Math.sin((j / 4) * TAU + i) * r, 3.2).fill(EMBER);
    }));
    const beacon = new Beacon(k, EMBER, 190, mix(EMBER, PALETTE.whiteHot, 0.3));
    const pauldron = (key: string, far: boolean) => k.part(key, (pen) => pen.shape([[-46, -4], [-52, 28], [-30, 54], [6, 58], [44, 40], [52, 8], [36, -14], [0, -18]], far ? armorFar : armorLit, { round: 0.35 }, (p) => {
      p.hard([[-18, 34], [-8, 84], [6, 44]]).fill(far ? PLATE_FAR : PLATE_LIT);
      p.hard([[14, 40], [32, 78], [38, 36]]).fill(far ? PLATE_FAR : PLATE_LIT);
      p.contour([[-40, 20], [0, 36], [40, 24]], { closed: false }).stroke(EMBER, 1.6, far ? 0.4 : 0.8);
    }));
    const pauldronN = pauldron('pauldron-near', false);
    const pauldronF = pauldron('pauldron-far', true);
    const helm = k.part('helm', (pen) => pen.shape([[-24, 0], [-30, 30], [-22, 64], [0, 78], [24, 64], [32, 30], [26, 0], [0, -10]], { ...armorLit, gloss: lens([-10, 52], 3, 16, 0.12, HOT, 0.3) }, { round: 0.4, sharp: [3] }, (p) => {
      p.line([0, 78], [0, 10]).stroke(PALETTE.enemyInk, 2.6, 0.7);
      p.hard([[-24, 4], [-28, 30], [-16, 30]]).fill(PALETTE.enemyInk, 0.3);
    }));
    const visor = k.part('visor', (pen) => {
      pen.hard([[-17, 33], [23, 33], [23, 40], [-17, 40]]).fill(HOT);
      pen.hard([[0, 34], [8, 34], [8, 6], [0, 6]]).fill(HOT);
    });
    const visorGlow = k.glow(EMBER, 100, 0);
    const horns = [0, 1, 2, 3, 4].map((i) => k.part(`horn${i}`, (pen) => pen.shape([[-7, 0], [-10, 34], [-3, 66 + (i % 2) * 14], [3, 86 + (i % 3) * 8], [9, 48], [8, 0]], armorLit, { round: 0.5, sharp: [3] })));
    const flames = [0, 1, 2, 3, 4].map(() => k.glow(HOT, 54, 0));
    const plume = k.ribbon({ n: 8, count: 3, width: (u, line) => (20 - line * 4) * (1 - u * 0.85) + 2, color: mix(EMBER, HOT, 0.25), ramp: 'fade', alpha: 0.9 }, 'plume');

    const swordG = k.group('sword');
    const blade = k.part('blade', (pen) => pen.shape([[-12, 20], [-15, 60], [-12, BLADE - 30], [0, BLADE + 18], [12, BLADE - 30], [15, 60], [12, 20]], { ...scorched(mix(PLATE_LIT, PALETTE.enemyInk, 0.3), HOT, { width: 2.4 }) }, { round: 0.12, sharp: [3] }, (p) => {
      p.line([0, 30], [0, BLADE]).stroke(PALETTE.enemyInk, 2.6, 0.6);
      for (const c of [[[-6, 70], [4, 110], [-2, 150]], [[8, 92], [0, 130]]] as Pt[][]) seam(p, c, 1.4);
      p.contour([[-13, 30], [-14, 90], [-11, BLADE - 30]], { closed: false }).stroke(HOT, 1.4, 0.8);
    }));
    const guard = k.part('guard', (pen) => {
      pen.shape([[-52, 6], [-58, 26], [-30, 18], [0, 22], [30, 18], [58, 26], [52, 6], [24, 0], [-24, 0]], armorLit, { round: 0.3, sharp: [1, 5] }, (p) => p.circle(0, 10, 5).fill(EMBER));
      pen.shape([[-8, 0], [-8, -34], [8, -34], [8, 0]], armor, { round: 0.2 });
      pen.circle(0, -40, 10).fill(PALETTE.enemyInk);
      pen.circle(0, -40, 7).fill(PLATE_LIT);
    });
    const bladeGlow = k.glow(EMBER, 120, 0);
    swordG.addChild(blade, guard, bladeGlow);

    const orbs = [0, 1, 2].map(() => k.part('orb', (pen) => {
      pen.circle(0, 0, 15).fill(mix(DEEP, EMBER, 0.7));
      pen.circle(0, 0, 15).stroke(HOT, 2, 0.9);
      pen.circle(-3, 3, 6).fill(PALETTE.whiteHot, 0.9);
    }));
    const orbGlow = orbs.map(() => k.glow(EMBER, 70, 0));
    const slash = k.part('slash', (pen) => {
      const out: Pt[] = [];
      const inn: Pt[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (150 - i * 18) * (Math.PI / 180);
        out.push([Math.cos(a) * 250, Math.sin(a) * 250]);
        inn.push([Math.cos(a) * (212 - Math.sin((i / 10) * Math.PI) * 16), Math.sin(a) * (212 - Math.sin((i / 10) * Math.PI) * 16)]);
      }
      pen.hard([...out, ...inn.reverse()]).fill(EMBER, 0.5);
      pen.contour(out, { closed: false, round: 0.5 }).stroke(HOT, 3.4, 0.95);
    });
    slash.blendMode = 'add';
    const ring = k.part('ring', (pen) => {
      pen.ellipse(0, 0, 100, 100).stroke(EMBER, 5.4, 0.95);
      pen.ellipse(0, 0, 90, 90).stroke(HOT, 2, 0.85);
    });
    ring.blendMode = 'add';
    const shock = k.part('shock', (pen) => {
      pen.ellipse(0, 0, 120, 12).stroke(EMBER, 5, 0.95);
      pen.ellipse(0, 0, 100, 9).stroke(HOT, 2, 0.8);
    });
    shock.blendMode = 'add';
    const embers = new Motes(k, 18, EMBER, 13, 0.7);
    const vanish = new Motes(k, 18, HOT, 18, 0.4);
    const burst = k.glow(PALETTE.whiteHot, 380, 0);
    const bits = Array.from({ length: 10 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [20 + (i % 3) * 6, 6], [26, 34 + (i % 4) * 8], [5, 38]], armorLit, { round: 0.2, sharp: [0, 1, 2, 3] })));
    for (const b of bits) b.visible = false;

    body.addChild(armFar.root, skirt, torso, housing, coreGlow, core, ...bands, beacon, pauldronF, plume, helm, visor, visorGlow, ...horns, ...flames, pauldronN);
    root.addChild(legs[0]!.root, cape, capeEdge, body, legs[1]!.root, armNear.root, swordG, ...orbGlow, ...orbs, slash, ring, shock, embers, vanish, burst, ...bits);
    body.pivot.set(0, -HIP_Y);
    place(housing, CORE[0], CORE[1]);
    place(torso, 0, 0);

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let walk = k.seed * 2;
    let trail = 0;
    let scattered = false;
    const hemTooth = [0, 12, 3, 16, 5, 10];

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const cut = key === 'cut';
        const geysers = key === 'geysers';
        const orbsAtk = key === 'orbs';
        const rush = key === 'rush';
        const nova = key === 'nova';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const third = f.hpFrac < 0.38 ? 1 : 0;
        const fall = dead ? easeIn(f.dying) : 0;
        const moving = Math.abs(f.vx) > 0.25 && !wind && !dead;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.3 * second + 0.2 * third, roar), 10, dt) : heat;
        trail = dt > 0 ? damp(trail, -f.vx * 8, 6, dt) : trail;
        if (moving) walk += dt * (0.3 + Math.abs(f.vx) * 0.26);

        // the body: it stands straight, a slow breath; leans back to wind up the cut, throws itself forward in the rush, crouches to drive the sword down, sags when spent, kneels in the death
        const bob = (moving ? -4 * Math.abs(Math.sin(walk * Math.PI * 2)) : 1.4 * Math.sin(f.t * 1.2)) - 8 * (1 - awake) - 10 * open - (geysers && (wind || strike) ? 30 * (wind ? f.p : 1) : 0) - 100 * fall * fall;
        const lean = (cut && wind ? -0.08 * f.p : 0) + (cut && strike ? 0.1 : 0) + (rush ? (wind ? -0.05 * f.p : 0.2) : 0) + (geysers && strike ? 0.1 : 0) + 0.05 * open + 0.02 * f.hurt - 0.04 * (1 - awake) + (dead ? 0.4 * fall : 0);
        const shake = (roar * 6 + 5 * f.hurt) * Math.sin(f.t * 62) * 0.4;
        const hipY = HIP_Y + bob;
        place(body, shake, hipY, -lean);
        const at = (x: number, y: number): Pt => {
          const a = -lean;
          const dx = x;
          const dy = y - HIP_Y;
          return [dx * Math.cos(a) - dy * Math.sin(a) + shake, hipY + dy * Math.cos(a) + dx * Math.sin(a)];
        };
        place(skirt, 0, 176);
        skirt.rotation = 0.03 * Math.sin(f.t * 1.3) + (moving ? 0.05 * Math.sin(walk * TAU) : 0);

        // the legs: a king's walk, slow and weighty; the rush is a run; both braced for the cut and the stab
        legs.forEach((leg, i) => {
          const c = footCycle(walk + (i ? 0.5 : 0), rush && strike ? 110 : 56, rush && strike ? 48 : 24);
          leg.root.position.set(i ? 16 : -14, -(hipY - 4));
          const brace = (cut || geysers) && (wind || strike) ? (i ? 36 : -36) : 0;
          const fx = (i ? 28 : -26) + (moving ? c.x : 0) + brace + (dead ? (i ? 30 : -30) * f.dying : 0);
          const fy = moving ? c.y : 0;
          leg.reach(fx - (i ? 16 : -14), -(hipY - 4) + 8 + fy, 1);
        });

        // the core: three bands that turn like a gyroscope — shut, they are three circles over the core; spent, they swing edge-on and spin apart
        const burn = Math.max(open, nova ? (wind ? easeIn(f.p) : strike ? 1 : 0) : 0, heat * 0.5, roar);
        const spin = f.t * (0.6 + 4 * burn);
        const turn = Math.max(open, nova ? (wind ? easeIn(f.p) * 0.8 : strike ? 1 : 0) : 0, roar * 0.6);
        bands.forEach((b, i) => {
          const sxv = Math.max(0.08, 1 - 0.92 * turn);
          place(b, CORE[0], CORE[1], spin * (i % 2 ? -1 : 1) * (0.3 + 0.7 * turn) + i * 1.05 * turn, sxv, 1 + 0.06 * turn * (i - 1));
          b.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.3 - i * 0.1) / 0.3)) : 1;
        });
        housing.alpha = dead ? Math.max(0, 1 - Math.max(0, (f.dying - 0.5) / 0.3)) : 1;
        const pulse = Math.sin(f.t * (3 + 6 * burn));
        const cs = (0.55 + 0.4 * burn + 0.2 * open) * (1 + 0.06 * pulse) * (dead ? Math.max(0, 1 - f.dying * 1.5) : 1);
        place(core, CORE[0], CORE[1], f.t * 0.7, cs, cs);
        core.alpha = 0.5 + 0.5 * Math.max(awake * 0.7, burn);
        coreGlow.position.set(CORE[0], -CORE[1]);
        coreGlow.alpha = Math.min(0.8, (0.15 + 0.6 * burn + 0.06 * pulse) * awake) * (dead ? Math.max(0, 1 - f.dying * 1.4) : 1);
        coreGlow.scale.set((100 + 90 * burn) / coreGlow.texture.width);
        beacon.show(f.t, CORE, open, 0.04 * awake);

        // the pauldrons, the helm, the crown and the plume
        place(pauldronN, 46, 272 + (dead ? -30 * fall : 0), -0.24 + 0.2 * (cut && wind ? f.p : 0), 1, 1);
        place(pauldronF, -44, 276, 0.24, -1, 1);
        const hy = 286 + (dead ? -40 * fall : 0);
        const hx = 8 + 6 * (rush ? 1 : 0) - 14 * fall;
        place(helm, hx, hy, -0.04 * Math.sin(f.t * 1.1) + (cut && wind ? 0.12 * f.p : 0) - (rush && strike ? 0.12 : 0) + 0.12 * open - 0.5 * fall + (roar ? 0.2 * roar : 0));
        place(visor, hx, hy, -0.04 * Math.sin(f.t * 1.1) + (cut && wind ? 0.12 * f.p : 0) - (rush && strike ? 0.12 : 0) + 0.12 * open - 0.5 * fall + (roar ? 0.2 * roar : 0));
        visor.alpha = (0.3 + 0.7 * awake) * (1 - 0.6 * open) * (dead ? 1 - f.dying : 1);
        visorGlow.position.set(hx + 4, -(hy + 36));
        visorGlow.alpha = Math.min(1, awake * (0.2 + 0.8 * heat) + 0.3 * second + roar) * (dead ? 0 : 1) * (1 - 0.5 * open);
        visorGlow.scale.set((80 + 60 * heat + 30 * second) / visorGlow.texture.width);
        horns.forEach((h, i) => {
          const a = 0.3 + i * 0.22 + 0.04 * Math.sin(f.t * 2 + i) + 0.05 * roar + (rush && strike ? 0.25 : 0);
          const grow = 1 + 0.3 * second + 0.25 * roar + 0.1 * heat;
          place(h, hx - 14 + i * 6, hy + 66, -a, 0.9 * grow, grow * (0.9 + 0.15 * (i % 3) / 2));
          h.alpha = dead ? Math.max(0, 1 - f.dying * 2) : 1;
          const tipX = hx - 14 + i * 6 - Math.sin(a) * 86 * grow * 0.9;
          const tipY = hy + 66 + Math.cos(a) * 84 * grow;
          const g = flames[i]!;
          g.position.set(tipX, -tipY);
          g.alpha = Math.min(0.95, awake * (0.35 + 0.4 * heat + 0.2 * Math.sin(f.t * 9 + i * 1.7)) + 0.3 * second + 0.4 * roar) * (dead ? 0 : 1);
          g.scale.set((40 + 30 * second + 20 * heat + 8 * Math.sin(f.t * 11 + i)) / g.texture.width);
        });
        const plumeAngle = Math.PI - 0.5 + 0.1 * Math.sin(f.t * 1.4) + (rush ? -0.4 : 0) - trail * 0.01;
        for (let i = 0; i < 3; i++) plume.setLine(i, tentacle([hx - 16 + i * 3, hy + 58 + i * 4], plumeAngle + (i - 1) * 0.28, (120 + 40 * second + 30 * heat + (rush ? 40 : 0)) * (1 - i * 0.16), 8, 0.4 + i * 0.12, 0.22, f.t * 3.4 + i * 1.7));
        plume.commit();
        plume.alpha = awake * 0.4 + 0.6 - (dead ? f.dying * 1.5 : 0);

        // the cape: hangs from the pauldrons, streams back with the rush, burns at the hem
        const cy = (j: number): number => hipY + 124 - ((hipY + 124 - (hipY - 100)) * j) / ROWS * (1 - 0.4 * fall);
        cape.setPoints((i, j) => {
          const u = j / ROWS;
          const w = 30 + 36 * u;
          const cx = -22 * u - (trail + 5 * Math.sin(f.t * 1.2)) * u * u * 1.2 - (rush ? 40 * u : 0);
          const tooth = j === ROWS ? hemTooth[i % hemTooth.length]! * (1 + 0.4 * Math.sin(f.t * 3 + i)) : 0;
          return [cx - w * 0.7 + ((w * 1.5) * i) / COLS + 3 * Math.sin(f.t * 1.4 + j * 0.8 + i) * u, cy(j) - tooth] as Pt;
        });
        const edge: Pt[] = [];
        for (let j = 0; j <= ROWS; j++) {
          const u = j / ROWS;
          const w = 30 + 36 * u;
          edge.push([-22 * u - (trail + 5 * Math.sin(f.t * 1.2)) * u * u * 1.2 - (rush ? 40 * u : 0) - w * 0.7, cy(j)]);
        }
        capeEdge.setSpine(edge);
        cape.alpha = (dead ? Math.max(0, 1 - f.dying * 1.6) : 1) * (0.4 + 0.6 * awake);
        capeEdge.alpha = cape.alpha * (0.5 + 0.5 * second + 0.4 * heat);

        // the arms and the sword. Idle: the blade upright before it. Cut: raised behind the head, then through to the floor. Geysers: raised, then driven into the floor ahead at a slant.
        // Rush: levelled. Orbs: the free hand gathers fire. Nova: both arms wide.
        const shN = at(SHOULDER_N[0], SHOULDER_N[1]);
        const shF = at(SHOULDER_F[0], SHOULDER_F[1]);
        armNear.root.position.set(shN[0], -shN[1]);
        armFar.root.position.set(shF[0], -shF[1]);
        let nx = 40 + 4 * Math.sin(f.t * 1.2);
        let ny = -76 + 3 * Math.sin(f.t * 1.5);
        let theta = 80 + 2 * Math.sin(f.t * 1.1) - 6 * (1 - awake);
        let fx = -36 + 6 * Math.sin(f.t * 1.1 + 1);
        let fy = -128 + 6 * Math.sin(f.t * 1.4) - 16 * (1 - awake);
        if (cut && (wind || strike)) {
          const s = strike ? easeOut(Math.min(1, f.p * 1.6)) : 0;
          const th = (150 - 170 * s) * (Math.PI / 180);
          nx = -20 + 90 * s;
          ny = 40 - 130 * s;
          theta = 150 - 170 * s;
          if (wind) { nx += 4 * Math.sin(f.t * 40); ny += 4 * Math.cos(f.t * 37); }
          void th;
          fx = -50;
          fy = -80;
        } else if (geysers && (wind || strike)) {
          const s = strike ? easeIn(Math.min(1, f.p * 3)) : 0;
          nx = 24 + 20 * s;
          ny = 90 - 200 * s;
          theta = 92 - 144 * s;
          fx = -10 + 40 * s;
          fy = 40 - 150 * s;
        } else if (rush && (wind || strike)) {
          nx = 100;
          ny = -64;
          theta = 4;
          fx = -64;
          fy = -50;
        } else if (orbsAtk && (wind || strike)) {
          fx = 100 + 30 * (strike ? f.p : 0);
          fy = -20;
        } else if (nova && (wind || strike)) {
          const o = wind ? easeOut(f.p) : 1;
          nx = 140 * o;
          ny = 10 * o;
          theta = 80 - 76 * o;
          fx = -140 * o;
          fy = 10 * o;
        } else if (roar > 0.01) {
          nx = 40;
          ny = 90 * roar;
          theta = 90;
          fx = -40;
          fy = 90 * roar;
        } else if (open > 0.3) {
          nx = 50;
          ny = -100;
          theta = 60;
          fx = -50;
          fy = -120;
        } else if (dead) {
          nx = 40 + 30 * fall;
          ny = -140;
          theta = 80 - 90 * fall;
          fx = -50;
          fy = -140;
        }
        const clampReach = (x: number, y: number): Pt => {
          const d = Math.hypot(x, y);
          const m = 158;
          return d > m ? [(x / d) * m, (y / d) * m] : [x, y];
        };
        const nt = clampReach(nx, ny);
        const ft = clampReach(fx, fy);
        armNear.reach(nt[0], nt[1], -1);
        armFar.reach(ft[0], ft[1], -1);
        const grip: Pt = [shN[0] + nt[0], shN[1] + nt[1]];
        const drop = dead ? Math.min(1, Math.max(0, (f.dying - 0.4) / 0.4)) : 0;
        place(swordG, grip[0] + 30 * drop, grip[1] - 120 * drop * drop, theta * (Math.PI / 180) - Math.PI / 2 + drop * 1.2, 1, 1);
        bladeGlow.position.set(0, -(BLADE * 0.55));
        bladeGlow.alpha = Math.min(1, awake * (0.15 + 0.5 * heat) + 0.3 * second + 0.5 * (cut && strike ? 1 : 0)) * (dead ? Math.max(0, 1 - f.dying * 1.5) : 1);
        bladeGlow.scale.set((90 + 40 * heat) / bladeGlow.texture.width, (BLADE * 1.2) / bladeGlow.texture.width);
        void SHOULDER_F;

        // the three orbs in the free hand; the crescent of the cut; the ring of the nova; the shock where the blade strikes the floor
        orbs.forEach((o, i) => {
          const on = orbsAtk && (wind || strike) && !dead;
          o.visible = on;
          orbGlow[i]!.alpha = 0;
          if (!on) return;
          const u = wind ? easeOut(f.p) : 1;
          const ang = (i - 1) * 0.5;
          const out = strike ? 30 + 240 * f.p * f.p : 26;
          const ox = shF[0] + ft[0] + 20 + Math.cos(ang) * out;
          const oy = shF[1] + ft[1] + Math.sin(ang) * out * 0.7 + (strike ? 0 : 5 * Math.sin(f.t * 6 + i));
          place(o, ox, oy, f.t * 2, 0.2 + 0.9 * u, 0.2 + 0.9 * u);
          o.alpha = strike ? Math.max(0, 1 - f.p * 1.2) : u;
          const g = orbGlow[i]!;
          g.position.set(ox, -oy);
          g.alpha = o.alpha * 0.8;
          g.scale.set((50 + 50 * u) / g.texture.width);
        });
        slash.visible = cut && strike && !dead;
        if (slash.visible) {
          place(slash, shN[0] - 10, shN[1] - 10, 0, 1, 1);
          slash.alpha = Math.max(0, 0.9 - f.p * 0.9);
        }
        ring.visible = nova && strike && !dead;
        if (ring.visible) {
          place(ring, CORE[0], CORE[1] + bob, 0, 0.3 + 3.4 * easeOut(f.p), 0.3 + 3.4 * easeOut(f.p));
          ring.alpha = Math.max(0, 1 - f.p);
        }
        shock.visible = geysers && strike && f.p > 0.3 && f.p < 0.9 && !dead;
        if (shock.visible) {
          const u = (f.p - 0.3) / 0.6;
          place(shock, grip[0] + 120, 4, 0, 0.3 + 2.4 * easeOut(u), 1);
          shock.alpha = 1 - u;
        }
        vanish.position.set(0, -170);
        vanish.show(f.t, 0, 0, 220, 300, 0.9, (cut && wind ? 0.9 * (1 - f.p) : 0) + (cut && strike ? 0.6 : 0) + roar * 0.4);
        embers.position.set(0, -(hipY + 40));
        embers.show(f.t, 0, 100, 160, 300, 0.5, (0.12 + 0.5 * second + 0.7 * roar + 0.4 * heat + 0.3 * third) * awake + (dead ? 0.9 * (1 - fall * 0.5) : 0) + 0.2 * open);
        burst.position.set(CORE[0], -CORE[1]);
        burst.alpha = dead ? Math.max(0, 1 - Math.abs(f.dying - 0.62) * 6) : 0;
        burst.scale.set((120 + 360 * Math.min(1, Math.max(0, f.dying - 0.5) * 4)) / burst.texture.width);

        // the death: the plate comes off in pieces, the bands fly out, the core goes in a flash
        if (dead) {
          scattered = true;
          const g = Math.min(1, Math.max(0, (f.dying - 0.2) / 0.8) * 1.1);
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [(i - 5) * 12, 210 + (i % 4) * 22], [(i - 5) * 50, 120 + (i % 3) * 50], (i - 5) * 1.7, 560, 4, g);
              b.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
            }
          });
          const fade = 1 - Math.max(0, (f.dying - 0.55) / 0.45);
          torso.alpha = skirt.alpha = helm.alpha = pauldronN.alpha = pauldronF.alpha = fade;
          legs[0]!.root.alpha = legs[1]!.root.alpha = armFar.root.alpha = armNear.root.alpha = fade;
          swordG.alpha = 1 - Math.max(0, (f.dying - 0.85) / 0.15);
        } else {
          if (scattered) scattered = false;
          for (const b of bits) b.visible = false;
          torso.alpha = skirt.alpha = helm.alpha = pauldronN.alpha = pauldronF.alpha = 1;
          legs[0]!.root.alpha = legs[1]!.root.alpha = armFar.root.alpha = armNear.root.alpha = 1;
          swordG.alpha = 1;
        }
      },
    };
  },
};

