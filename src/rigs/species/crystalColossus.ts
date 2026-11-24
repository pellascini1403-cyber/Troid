import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { solid } from '../kit/materials';
import { easeIn, easeOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE CRYSTAL COLOSSUS (docs/PROMPT24-LOG.md): a giant cut from one crystal and put together in blocks — two pillars for legs, a tall chest of facets, shoulders that end in spires, a small angular head with a single visor of light, and two
 * fists of crystal as big as a hero. In the middle of its chest is a hexagonal WINDOW covered by four shutters of facet; shut, the chest is a wall of crystal and every blow is turned away; open — which is only when it is spent after a blow —
 * the shutters turn edge-on and the CORE shows, a second crystal burning white inside the first, and it beats. The stomp is a leg raised high and brought down; the rockfall is both fists raised, crystals gathering above it; the burst is the
 * shutters opening for a moment and the core throwing shards. Second phase: the facets crack and the light inside runs through them, the spires grow. Dead, it comes apart along its facets and the pieces fall in order, from the head down.
 */

const CRYSTAL = mix(PALETTE.worldHaze, PALETTE.worldGlow, 0.25);
const DEEP = mix(PALETTE.worldSlate, PALETTE.violetDeep, 0.45);
const RIM = PALETTE.whiteHot;
const CORE = PALETTE.violetGlow;
const WIN: Pt = [0, 262];

const TORSO: readonly Pt[] = [[-92, 200], [-108, 250], [-96, 310], [-62, 360], [-30, 376], [30, 376], [62, 360], [96, 310], [108, 250], [92, 200], [60, 182], [-60, 182]];
const HEAD: readonly Pt[] = [[-24, 0], [-30, 22], [-16, 44], [18, 46], [34, 22], [28, 0], [0, -6]];

export const CRYSTAL_COLOSSUS_RIG: RigDef = {
  id: 'boss_colossus',
  width: 3.2,
  height: 4.6,
  shadow: 380,
  aura: { color: CORE, at: [0, 250], size: 560, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('crystal-colossus');
    const body = k.group('body');
    const facet = solid(CRYSTAL, RIM, { ramp: 'vert', edge: mix(PALETTE.worldSlate, PALETTE.enemyInk, 0.6), width: 4 });
    const farFacet = solid(mix(CRYSTAL, PALETTE.worldSlate, 0.55), mix(RIM, PALETTE.worldSlate, 0.5), { ramp: 'vert', edge: PALETTE.enemyInk, width: 2.4 });
    const seam = (p: Pen, pts: Pt[], w = 2): void => {
      p.contour(pts, { closed: false, round: 0 }).stroke(CORE, w + 1.4, 0.55);
      p.contour(pts, { closed: false, round: 0 }).stroke(RIM, w * 0.5, 0.8);
    };
    const boot = (pen: Pen, l2: number): void => {
      pen.shape([[l2 - 14, 22], [l2 + 40, 18], [l2 + 52, -20], [l2 - 14, -24]], solid(mix(CRYSTAL, DEEP, 0.3), RIM, { ramp: 'vert', edge: PALETTE.enemyInk, width: 2.6 }), { round: 0.1 }, (p) => p.hard([[l2 - 6, 16], [l2 + 30, 12], [l2 + 6, -4]]).fill(RIM, 0.25));
    };
    // a limb of the colossus is a cut prism: hard corners, a bright facet along its lit edge, a dark one along its belly and a seam of light across the joint
    const cut = (far: boolean) => (p: Pen, len: number, wa: number, wb: number, upper: boolean): void => {
      const a = wa / 2;
      const b = wb / 2;
      p.hard([[len * 0.08, a * 0.92], [len * 0.9, b * 0.9], [len * 0.9, b * 0.2], [len * 0.08, a * 0.25]]).fill(RIM, far ? 0.07 : 0.2);
      p.hard([[len * 0.1, -a * 0.2], [len * 0.9, -b * 0.2], [len * 0.84, -b * 0.92], [len * 0.1, -a * 0.9]]).fill(DEEP, far ? 0.25 : 0.4);
      if (!far) p.hard([[len * 0.34, a * 0.78], [len * 0.52, a * 0.5], [len * 0.4, a * 0.15]]).fill(CORE, 0.35);
      if (upper) seam(p, [[len * 0.06, a * 0.1], [len * 0.4, -a * 0.1], [len * 0.7, -b * 0.4]], 1.4);
    };
    const legs = [0, 1, 2, 3].map((i) => new Leg(k, `leg${i}`, { l1: 98, l2: 104, w0: i < 2 ? 66 : 74, w1: i < 2 ? 58 : 64, w2: i < 2 ? 50 : 56, mat: i < 2 ? farFacet : facet, foot: boot, round: 0.04, detail: cut(i < 2) }));
    const pelvis = k.part('pelvis', (pen) => pen.shape([[-70, 0], [-80, 30], [-50, 56], [50, 56], [80, 30], [70, 0], [0, -14]], facet, { round: 0.2 }, (p) => seam(p, [[-30, 4], [-24, 40]], 1.6)));
    const torso = k.part('torso', (pen) =>
      pen.shape(TORSO, facet, { round: 0.03 }, (p) => {
        // the facets of the chest, the light that runs through the seams between them
        p.hard([[-60, 190], [-96, 252], [-40, 290]]).fill(RIM, 0.2);
        p.hard([[60, 190], [100, 262], [34, 300]]).fill(DEEP, 0.4);
        p.hard([[-28, 376], [-70, 330], [-10, 322]]).fill(RIM, 0.3);
        p.hard([[-96, 250], [-62, 360], [-40, 292]]).fill(CORE, 0.16);
        p.hard([[96, 250], [62, 360], [40, 292]]).fill(DEEP, 0.34);
        p.hard([[-40, 292], [0, 380], [40, 292], [0, 330]]).fill(RIM, 0.12);
        p.hard([[-60, 186], [60, 186], [44, 250], [-44, 250]]).fill(DEEP, 0.22);
        seam(p, [[-96, 250], [-40, 292], [0, 380]], 2.4);
        seam(p, [[96, 250], [40, 292], [0, 380]], 2.4);
        seam(p, [[-60, 186], [-44, 250], [-96, 252]], 1.8);
        seam(p, [[60, 186], [44, 250], [96, 252]], 1.8);
      }),
    );
    const window = k.part('window', (pen) => {
      pen.shape([[-48, 0], [-24, 42], [24, 42], [48, 0], [24, -42], [-24, -42]], { fill: PALETTE.enemyInk, edge: { color: RIM, width: 3 }, rims: [] }, { round: 0 });
    });
    const core = k.part('core', (pen) => {
      pen.shape([[0, 36], [24, 12], [18, -26], [0, -38], [-18, -26], [-24, 12]], { fill: mix(PALETTE.violetDeep, CORE, 0.5), rims: [{ color: RIM, width: 3, alpha: 0.9 }] }, { sharp: [0, 1, 2, 3, 4, 5], round: 0 });
      pen.hard([[0, 30], [14, 10], [0, -10], [-12, 10]]).fill(PALETTE.whiteHot, 0.9);
    });
    const coreGlow = k.glow(CORE, 200, 0);
    const shutter = (i: number) =>
      k.part(`shutter${i}`, (pen) => pen.shape(i % 2 ? [[0, 0], [44, 8], [48, 40], [0, 44]] : [[0, 0], [44, -8], [48, -40], [0, -44]], facet, { round: 0 }, (p) => p.hard([[2, 2], [30, 8], [4, 30]]).fill(RIM, 0.3)));
    const shutters = [0, 1, 2, 3].map(shutter);
    const beacon = new Beacon(k, CORE, 170, mix(CORE, PALETTE.whiteHot, 0.45));
    const head = k.part('head', (pen) => pen.shape(HEAD, facet, { round: 0.1 }, (p) => {
      p.hard([[-18, 22], [24, 24], [26, 14], [-20, 12]]).fill(PALETTE.enemyInk, 0.9);
      p.hard([[-6, 46], [0, 86], [8, 46]]).fill(mix(CRYSTAL, RIM, 0.4));
    }));
    const visor = k.part('visor', (pen) => pen.shape([[-19, 12], [25, 14], [27, 22], [-19, 22]], { fill: CORE, rims: [] }, { round: 0.2 }));
    const visorGlow = k.glow(CORE, 120, 0);
    const pauldron = (key: string, far: boolean) => k.part(key, (pen) => pen.shape([[-44, 0], [-50, 40], [-24, 70], [10, 56], [46, 20], [30, -8], [0, -14]], far ? farFacet : facet, { round: 0.1 }, (p) => {
      p.hard([[-20, 10], [-34, 40], [-8, 56]]).fill(RIM, far ? 0.1 : 0.28);
    }));
    const pauldronNear = pauldron('pauldron-near', false);
    const pauldronFar = pauldron('pauldron-far', true);
    const spires = [0, 1, 2, 3, 4, 5].map((i) => k.part(`spire${i}`, (pen) => pen.hard([[-12, 0], [-4, 90 + (i % 3) * 40], [0, 130 + (i % 2) * 40], [6, 80], [14, 0]]).fill(mix(CRYSTAL, RIM, 0.35))));
    const armGeo = (far: boolean) => new Leg(k, far ? 'arm-far' : 'arm-near', { l1: 110, l2: 116, w0: far ? 64 : 72, w1: far ? 54 : 60, w2: far ? 46 : 52, mat: far ? farFacet : facet, foot: (pen, l2) => pen.shape([[l2 - 16, 40], [l2 + 40, 34], [l2 + 52, -30], [l2 - 16, -38]], far ? farFacet : solid(mix(CRYSTAL, DEEP, 0.2), RIM, { ramp: 'vert', edge: PALETTE.enemyInk, width: 3 }), { round: 0.04 }, (p) => p.hard([[l2 - 4, 30], [l2 + 28, 24], [l2 + 6, 0]]).fill(RIM, far ? 0.08 : 0.25)), round: 0.04, detail: cut(far) });
    const armNear = armGeo(false);
    const armFar = armGeo(true);
    const dust = new Motes(k, 14, mix(PALETTE.worldHaze, PALETTE.worldGlow, 0.3), 26, 0.2);
    const glitter = new Motes(k, 14, PALETTE.whiteHot, 10, 0.8);
    const rocks = [0, 1, 2, 3].map((i) => k.part(`rock${i}`, (pen) => pen.shape([[0, 0], [24 + i * 4, 10], [30, 44], [6, 54]], facet, { sharp: [0, 1, 2, 3], round: 0 })));
    for (const r of rocks) r.visible = false;
    const bits = Array.from({ length: 10 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [22 + (i % 4) * 6, 8], [26, 38 + (i % 3) * 10], [6, 44]], facet, { sharp: [0, 1, 2, 3], round: 0 })));
    for (const b of bits) b.visible = false;

    body.addChild(pelvis, torso, window, coreGlow, beacon, core, ...shutters, pauldronFar, head, visor, visorGlow, pauldronNear, ...spires);
    root.addChild(legs[0]!.root, legs[1]!.root, armFar.root, body, legs[2]!.root, legs[3]!.root, armNear.root, dust, glitter, ...rocks, ...bits);
    place(window, WIN[0], WIN[1]);
    place(core, WIN[0], WIN[1]);
    coreGlow.position.set(WIN[0], -WIN[1]);

    const opening = new Opening();
    const waking = new Waking();
    let walk = k.seed * 2;
    let heat = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const key = f.attackKey ?? '';
        const stomp = key === 'stomp';
        const rockfall = key === 'rockfall';
        const burst = key === 'burst';
        const moving = Math.abs(f.vx) > 0.25 && !wind && !strike && !dead;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.5 * second, roar), 10, dt) : heat;
        if (moving) walk += dt * (0.4 + Math.abs(f.vx) * 0.35);
        const slam = strike && stomp ? 1 : 0;

        // the body: a slow breath, rocking back to wind up the stomp, throwing its weight forward on the blow, sagging when it is spent, falling apart when it dies
        const bob = moving ? -5 * Math.abs(Math.sin(walk * Math.PI * 2)) : 1.2 * Math.sin(f.t * 1.3);
        const hipY = 196 + bob - 14 * open - 16 * (1 - awake) - (wind && stomp ? 6 * f.p : 0) - (dead ? 60 * easeIn(f.dying) : 0);
        const lean = (wind && stomp ? -0.05 * f.p : 0) + (slam ? 0.05 : 0) + (wind && rockfall ? -0.06 * f.p : 0) + 0.04 * open - 0.05 * (1 - awake) + 0.02 * f.hurt;
        const shake = (roar * 6 + 5 * f.hurt) * Math.sin(f.t * 60) * 0.4;
        place(body, shake, hipY - 196, -lean);
        place(pelvis, 0, 196);
        place(torso, 0, 0);
        place(head, 0, 380 + (wind && burst ? 8 * f.p : 0) - (open > 0.5 ? 8 : 0), -0.04 * Math.sin(f.t * 1.1) + 0.14 * open - (wind ? 0.06 * f.p : 0), 1, 1);
        place(visor, 0, 380 + (wind && burst ? 8 * f.p : 0) - (open > 0.5 ? 8 : 0), -0.04 * Math.sin(f.t * 1.1) + 0.14 * open - (wind ? 0.06 * f.p : 0), 1, 1);
        visorGlow.position.set(2, -(394 - (open > 0.5 ? 8 : 0)));
        visorGlow.alpha = Math.min(1, awake * (0.4 + 0.6 * f.heat) + 0.3 * second + roar) * (dead ? 0 : 1) * (open > 0.4 ? 0.6 : 1);
        visorGlow.scale.set((90 + 60 * f.heat + 40 * second) / visorGlow.texture.width);
        visor.alpha = 0.3 + 0.7 * awake;
        place(pauldronNear, 78, 352 + (wind && rockfall ? 20 * f.p : 0), -0.2, 1, 1);
        place(pauldronFar, -78, 356, 0.2, -1, 1);
        spires.forEach((s, i) => {
          const grow = 1 + 0.45 * second + 0.3 * roar + 0.2 * heat;
          const x = (i - 2.5) * 34;
          place(s, x + (i < 3 ? -30 : 30), 360 + (i % 2) * 12 + (i < 3 ? 0 : -6), (i - 2.5) * 0.14, 0.7 * grow, (0.8 + 0.4 * (i % 3) / 2) * grow);
          s.alpha = dead ? 0 : 1;
        });

        // the window: four shutters of facet that turn edge-on when it is spent; the core burns behind them and beats
        const turn = Math.max(open, wind && burst ? easeIn(f.p) * 0.8 : 0, strike && burst ? 0.9 : 0);
        shutters.forEach((s, i) => {
          const upper = i < 2;
          const right = i % 2 === 0;
          place(s, WIN[0] + (right ? 2 : -2), WIN[1] + (upper ? 2 : -2), 0, (right ? 1 : -1) * Math.max(0.1, 1 - 0.9 * turn), upper ? 1 : -1);
          s.visible = !dead;
        });
        core.alpha = 0.3 + 0.7 * turn;
        place(core, WIN[0], WIN[1], 0, (1 + 0.1 * Math.sin(f.t * (4 + 7 * open)) * open) * (1 + 0.2 * heat), (1 + 0.1 * Math.sin(f.t * (4 + 7 * open)) * open) * (1 + 0.2 * heat));
        coreGlow.alpha = Math.min(0.75, 0.1 + 0.6 * Math.max(turn, heat * 0.5)) * (dead ? 0 : 1);
        coreGlow.scale.set((110 + 50 * turn) / coreGlow.texture.width);
        beacon.show(f.t, WIN, open, 0.05 * awake + 0.2 * second);

        // the legs: pillars that step slowly, one raised high for the stomp and brought down with the blow
        const hipX = [-40, 40, -34, 46] as const;
        legs.forEach((leg, i) => {
          const far = i < 2;
          const front = i % 2 === 1;
          const c = footCycle(walk + (front ? 0.5 : 0) + (far ? 0.25 : 0), 56, 30);
          const hipH = hipY - 6;
          leg.root.position.set(hipX[i]!, -hipH);
          let fx = (front ? 40 : -40) + (moving ? c.x : 0);
          let fy = moving ? c.y : 0;
          if (stomp && front && !far) {
            if (wind) fy = 150 * easeOut(f.p);
            else if (strike) fy = 150 * Math.max(0, 1 - f.p * 4);
          }
          if (dead) fx += (i - 1.5) * 20 * f.dying;
          leg.reach(fx + (rockfall && wind ? 10 : 0), -hipH + 24 + fy, front ? 1 : -1);
        });

        // the arms: hanging at its sides; raised high for the rockfall (crystals gathering above); thrown wide for the burst; folded over the chest when it is spent
        const sh: Pt[] = [[80, 332], [-80, 336]];
        [armNear, armFar].forEach((arm, i) => {
          const far = i === 1;
          const shY = sh[i]![1] + (hipY - 196);
          arm.root.position.set(sh[i]![0], -shY);
          // where the hand goes, in the rig's frame (cm from the floor, x forward): hanging at its sides, a little forward, swinging with the stride
          let tx = (far ? -96 : 112) + 6 * Math.sin(f.t * 1.2 + i) + (moving ? 22 * Math.sin((walk + (far ? 0.5 : 0)) * Math.PI * 2) : 0);
          let ty = 118 + 6 * Math.sin(f.t * 1.5 + i) - 40 * (1 - awake);
          if (rockfall && (wind || strike)) {
            tx = (far ? -40 : 60) + 30 * (far ? -1 : 1) * (strike ? 1 : 0);
            ty = 420 + 70 * (wind ? easeOut(f.p) : 1);
          } else if (burst && (wind || strike)) {
            tx = (far ? -230 : 230);
            ty = 330;
          } else if (stomp && wind) {
            tx = (far ? -120 : 140);
            ty = 200 + 40 * f.p;
          } else if (open > 0.4) {
            tx = (far ? -1 : 1) * (130 + 24 * open);
            ty = 70;
          } else if (dead) {
            tx = (far ? -120 : 120);
            ty = 40 * (1 - f.dying);
          }
          arm.reach(tx - sh[i]![0], ty - shY, far ? -1 : 1);
        });

        // the rocks of the rockfall gathering over its head; dust at its feet on the stomp; glitter off the facets; and the pieces of it when it dies
        rocks.forEach((r, i) => {
          r.visible = rockfall && (wind || strike) && !dead;
          if (r.visible) {
            const u = wind ? easeOut(f.p) : 1;
            place(r, (i - 1.5) * 110 + 20 * Math.sin(f.t * 3 + i), 520 + 40 * u + 26 * Math.sin(f.t * 2 + i) - (strike ? 60 * f.p * 2 : 0), f.t * (i % 2 ? 1 : -1), 1.4, 1.4);
            r.alpha = u * (strike ? Math.max(0, 1 - f.p * 1.4) : 1);
          }
        });
        dust.position.set(0, 0);
        dust.show(f.t, 0, 14, 320, 40, 0.5, (slam ? 0.9 : 0) + (dead && f.dying > 0.3 ? 0.8 : 0) + roar * 0.4);
        glitter.position.set(0, -250);
        glitter.show(f.t, 0, 0, 220, 300, 1.1, (strike && burst ? 0.9 : 0) + roar * 0.8 + (open > 0.5 ? 0.3 : 0) + 0.06);
        bits.forEach((b, i) => {
          b.visible = dead && f.dying > 0.1 + i * 0.04;
          if (b.visible) {
            const a = (i / 10) * TAU;
            const u = Math.min(1, (f.dying - 0.1 - i * 0.04) * 1.6);
            flung(b, [Math.cos(a) * 60, 200 + Math.sin(a) * 120 + 60], [Math.cos(a) * 120, 80 + Math.sin(a) * 80], 3 + i, 360, 4, u);
            b.alpha = 1 - Math.max(0, (f.dying - 0.7) / 0.3);
          }
        });
        if (dead) {
          const g = Math.min(1, f.dying * 2);
          torso.alpha = pelvis.alpha = head.alpha = pauldronNear.alpha = pauldronFar.alpha = window.alpha = 1 - g * 0.95;
          for (const l of legs) l.root.alpha = 1 - g;
          armNear.root.alpha = armFar.root.alpha = 1 - g;
        } else {
          torso.alpha = pelvis.alpha = head.alpha = pauldronNear.alpha = pauldronFar.alpha = window.alpha = 1;
          for (const l of legs) l.root.alpha = 1;
          armNear.root.alpha = armFar.root.alpha = 1;
        }
      },
    };
  },
};
