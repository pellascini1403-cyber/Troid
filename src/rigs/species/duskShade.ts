import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens, scorched } from '../kit/materials';
import { easeIn, easeInOut, easeOut } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE DUSK SHADE (docs/PROMPT24-LOG.md): it has the veil shade's trick — it vanishes, comes back behind the hero, and the reappearance is the warning — and nothing else of it: a REAPER of embers. A cloak of black cloth whose hem BURNS (a
 * fringe of flames that lick and gutter), a hood with a mask of pale bone under it and two coals for eyes, and in one hand a sickle on a long staff whose edge glows. It drifts, trailing sparks; it vanishes by collapsing into a drift of
 * embers; it comes back with the sickle already raised and the mask blazing, and the slash is the sickle swung over the head and through the air in a wide arc that burns where it passes. Dead, the cloak burns away.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const CLOTH = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.3);
const BONE = mix(PALETTE.worldMist, PALETTE.whiteHot, 0.55);
const COLS = 5;
const ROWS = 9;
const TOP = 124;
const HEM = 14;

export const DUSK_SHADE_RIG: RigDef = {
  id: 'dusk_shade',
  width: 0.95,
  height: 1.75,
  shadow: 70,
  aura: { color: RIM, at: [0, 84], size: 220, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('dusk-shade');
    const cloak = k.cloth({ cols: COLS, rows: ROWS, color: CLOTH, ramp: 'soft', alpha: 0.98 }, 'cloak');
    const inner = k.cloth({ cols: COLS, rows: ROWS, color: mix(PALETTE.enemyInk, DEEP, 0.2), ramp: 'soft', alpha: 0.92 }, 'cloak-inner');
    const edgeBack = k.ribbon({ n: ROWS + 1, width: (u) => 2.6 * (1 - u * 0.7) + 0.3, color: RIM, ramp: 'flat', alpha: 0.9 }, 'edge-back');
    const edgeFront = k.ribbon({ n: ROWS + 1, width: (u) => 1.6 * (1 - u * 0.7) + 0.2, color: HOT, ramp: 'flat', alpha: 0.6 }, 'edge-front');
    const flames = Array.from({ length: COLS + 1 }, (_, i) => k.part(`flame${i}`, (pen) => {
      pen.shape([[-7, 0], [-5, 10], [-1, 20 + (i % 2) * 8], [1, 12], [5, 16], [7, 0]], { fill: mix(RIM, HOT, 0.35), ramp: 'vert', alpha: 0.95, rims: [] }, { sharp: [2], round: 0.5 });
      pen.shape([[-3.4, 0], [-1, 8], [0.6, 14 + (i % 2) * 5], [2.4, 6], [3.4, 0]], { fill: HOT, alpha: 0.95, rims: [] }, { sharp: [2], round: 0.5 });
    }));
    for (const f of flames) f.blendMode = 'add';

    const hood = k.part('hood', (pen) =>
      pen.shape([[-15, 0], [-18, 14], [-12, 32], [1, 46], [11, 30], [16, 12], [14, 0], [0, -5]], ink(RIM, { gloss: lens([-6, 25], 3, 11, 0.12, HOT, 0.16), width: 2.6, fill: CLOTH }), { sharp: [3], round: 0.9 }, (p) => {
        // the hollow of the hood, darker than the cloth
        p.shape([[-9, 4], [-10, 17], [-3, 28], [6, 23], [10, 12], [8, 3], [0, 1]], { fill: PALETTE.enemyInk, rims: [] }, { round: 1 });
      }),
    );
    const mask = k.part('mask', (pen) =>
      pen.shape([[-8, 0], [-9, 10], [-5, 20], [0, 23], [5, 20], [9, 10], [8, 0], [4, -6], [-4, -6]], scorched(BONE, HOT, { gloss: lens([-3, 12], 2, 7, 0.1, PALETTE.whiteHot, 0.35), width: 1.4 }), { round: 0.8 }, (p) => {
        // the cheek, the nose and the line of the jaw of a skull
        p.hard([[-1.4, 6], [0, 11], [1.4, 6]]).fill(PALETTE.enemyInk, 0.9);
        p.contour([[-5, -2], [-3, -5], [3, -5], [5, -2]], { closed: false }).stroke(PALETTE.enemyInk, 1.2, 0.8);
        p.line([-3, -1], [-3, -5]).stroke(PALETTE.enemyInk, 0.9, 0.7);
        p.line([0, -1], [0, -5]).stroke(PALETTE.enemyInk, 0.9, 0.7);
        p.line([3, -1], [3, -5]).stroke(PALETTE.enemyInk, 0.9, 0.7);
      }),
    );
    const eyes = [0, 1].map(() => k.part('eye', (pen) => {
      pen.ellipse(0, 0, 3.4, 4.4).fill(DEEP);
      pen.ellipse(0, 0, 2.5, 3.4).fill(HOT);
      pen.ellipse(0.4, 0.6, 1, 1.4).fill(PALETTE.whiteHot);
    }));
    const eyeGlow = k.glow(HOT, 56, 0);
    const arm = new Leg(k, 'arm', { l1: 30, l2: 36, w0: 7, w1: 5, w2: 3.6, mat: ink(RIM, { width: 1.4, fill: CLOTH }) });
    const sickle = k.part('sickle', (pen) => {
      // the staff, and the long curved blade at its head
      pen.shape([[-52, 2], [74, 1.6], [76, -1.6], [-52, -2]], scorched(mix(PALETTE.worldDusk, PALETTE.enemyInk, 0.3), RIM, { width: 1.2 }), { round: 0.1 });
      pen.shape([[70, 2], [86, 20], [112, 28], [140, 16], [150, -4], [118, 12], [92, 6]], scorched(mix(PALETTE.worldMist, PALETTE.worldDusk, 0.5), HOT, { width: 1.6 }), { sharp: [4], round: 0.55 });
      pen.contour([[96, 12], [118, 20], [142, 8], [149, -3]], { closed: false }).stroke(HOT, 2, 0.95);
    });
    const edgeGlow = k.glow(HOT, 70, 0);
    const trail = k.part('trail', (pen) => {
      pen.arc(0, 0, 96, -2.1, 0.7).stroke(RIM, 7, 0.9);
      pen.arc(0, 0, 90, -1.9, 0.5).stroke(HOT, 3, 0.95);
    });
    trail.blendMode = 'add';
    const embers = new Motes(k, 14, HOT, 8, 0.2);
    const ash = new Motes(k, 10, mix(PALETTE.worldMist, PALETTE.worldNight, 0.4), 14, 0.6);

    root.addChild(arm.root, sickle, edgeGlow, inner, cloak, edgeBack, edgeFront, ...flames, hood, mask, ...eyes, eyeGlow, trail, embers, ash);

    let sway = 0;
    let vanish = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const appear = f.anim === 'telegraph';
        const slash = f.anim === 'attack';
        const recover = f.phase === 'recovery';
        const moving = Math.abs(f.vx) > 0.2 && !dead;

        sway = dt > 0 ? damp(sway, Math.max(-1.4, Math.min(1.4, -f.vx * 0.45)), 4, dt) : sway;
        vanish = dt > 0 ? damp(vanish, f.anim === 'alert' ? easeIn(f.p) : 0, 10, dt) : vanish;
        const bob = 3.6 * Math.sin(f.t * 1.4) + (moving ? 1.8 * Math.sin(f.t * 5) : 0);
        const fall = dead ? easeIn(f.dying) : 0;
        const top = TOP + bob * 0.5 - 22 * fall;
        const hem = HEM + 6 + bob - 4 * fall;
        const billow = (appear ? f.p * 0.9 : 0) + (slash ? 0.6 : 0);
        const gap = (j: number): number => j / ROWS;
        const edgeX = (j: number, back: boolean): number => {
          const u = gap(j);
          const width = 12 + 64 * u ** 0.85 + 8 * billow * u;
          const lag = sway * 22 * u ** 1.5 + 4 * Math.sin(f.t * 1.9 - j * 0.55) * u ** 1.3 + (dead ? 22 * fall * u : 0);
          return (back ? -width / 2 : width / 2) + lag - 3 * f.hurt * u;
        };
        const yAt = (j: number): number => top + (hem - top) * gap(j) * (dead ? 1 - 0.5 * fall : 1);
        const teeth = [0, 7, 2, 9, 3, 8];
        cloak.setPoints((i, j) => {
          const b = edgeX(j, true);
          const fr = edgeX(j, false);
          return [b + ((fr - b) * i) / COLS, yAt(j) + (j === ROWS ? teeth[i]! * (1 + 0.5 * Math.sin(f.t * 4 + i)) * (1 - fall) : 0)] as Pt;
        });
        inner.setPoints((i, j) => {
          const b = edgeX(j, true) * 0.82 + 3;
          const fr = edgeX(j, false) * 0.82 - 3;
          return [b + ((fr - b) * i) / COLS, yAt(j) - 1 + (j === ROWS ? teeth[i]! * 0.7 : 0)] as Pt;
        });
        const backEdge: Pt[] = [];
        const frontEdge: Pt[] = [];
        for (let j = 0; j <= ROWS; j++) {
          backEdge.push([edgeX(j, true), yAt(j)]);
          frontEdge.push([edgeX(j, false), yAt(j)]);
        }
        edgeBack.setSpine(backEdge);
        edgeFront.setSpine(frontEdge);
        const vis = 1 - 0.9 * vanish;
        cloak.alpha = inner.alpha = vis * (dead ? 1 - fall * 0.9 : 1);
        edgeBack.alpha = edgeFront.alpha = vis * 0.9;

        // the burning hem: a flame at each point of it, leaning with the drift and flickering
        flames.forEach((fl, i) => {
          const x = edgeX(ROWS, true) + ((edgeX(ROWS, false) - edgeX(ROWS, true)) * i) / COLS;
          const y = yAt(ROWS) + teeth[Math.min(i, 5)]! * 0.6 + 2;
          const flick = 0.75 + 0.3 * Math.sin(f.t * 11 + i * 2.1) + 0.2 * Math.sin(f.t * 23 + i);
          place(fl, x, y, -sway * 0.35 + 0.12 * Math.sin(f.t * 7 + i), 0.9 + 0.5 * f.heat, flick * (0.8 + 0.7 * f.heat) * (dead ? 1 + 0.8 * fall : 1));
          fl.alpha = vis * (dead ? Math.max(0, 1 - fall * 0.8) : 1);
        });

        const nod = -0.05 * sway + 0.03 * Math.sin(f.t * 1.4) - 0.3 * f.hurt - (dead ? 0.9 * fall : 0);
        place(hood, 2 + sway * 4, top - 4 - 6 * fall, nod);
        place(mask, 8 + sway * 4, top + 6 - 6 * fall, nod * 0.9, 1, 1);
        eyes.forEach((e, i) => {
          const open = dead ? 0.1 : 1 - 0.8 * f.hurt;
          place(e, 6 + sway * 4 + (i ? 7.4 : 0.4), top + 14 - 6 * fall, 0, 1 + 0.3 * f.heat, Math.max(0.1, open) * (1 + 0.3 * f.heat));
          e.alpha = vis;
        });
        mask.alpha = vis;
        eyeGlow.position.set(10 + sway * 4, -(top + 14 - 6 * fall));
        eyeGlow.alpha = Math.min(1, 0.3 + 0.7 * f.heat + (appear ? 0.4 : 0)) * vis * (dead ? 0 : 1);
        eyeGlow.scale.set((50 + 50 * f.heat) / eyeGlow.texture.width);

        // the sickle: held low across the body at rest (hidden behind the cloak but for its blade), raised behind when it appears, swung through an arc in the slash
        const shoulder: Pt = [-6 + sway * 3, top - 14];
        arm.root.position.set(shoulder[0], -shoulder[1]);
        let hx = 20;
        let hy = -46;
        let ang = 0.5;
        let show = 0.0;
        if (appear) {
          const u = easeOut(f.p);
          hx = -4 - 20 * u;
          hy = 24 + 24 * u;
          ang = 2.2 - 0.3 * u;
          show = u;
        } else if (slash) {
          const u = easeInOut(Math.min(1, f.p * 1.15));
          const a = 2.4 - u * 3.4;
          hx = Math.cos(a) * 64 + 6;
          hy = Math.sin(a) * 64 - 6;
          ang = a - 1.4;
          show = 1;
        } else if (recover) {
          const u = easeInOut(f.p);
          hx = 54 - 40 * u;
          hy = -36 + 8 * u;
          ang = -0.9 + 0.8 * u;
          show = 1 - u;
        }
        arm.reach(hx, hy, -1);
        arm.root.alpha = show * vis;
        const ex = shoulder[0] + hx;
        const ey = shoulder[1] + hy;
        place(sickle, ex, ey, ang);
        sickle.alpha = show * vis;
        edgeGlow.position.set(ex + Math.cos(ang) * 112 - Math.sin(ang) * 14, -(ey + Math.sin(ang) * 112 + Math.cos(ang) * 14));
        edgeGlow.alpha = show * (appear ? 0.3 + 0.7 * f.p : slash ? 0.95 : 0.3) * vis;
        edgeGlow.scale.set((60 + 50 * (appear ? f.p : 0)) / edgeGlow.texture.width);
        trail.visible = slash || (recover && f.p < 0.5);
        if (trail.visible) {
          const u = slash ? Math.min(1, f.p * 1.15) : 1;
          trail.alpha = slash ? Math.sin(Math.min(1, u) * Math.PI * 0.5) * 0.95 : (1 - f.p * 2) * 0.9;
          place(trail, shoulder[0] + 6, shoulder[1] - 6, 0, 1.15, 1.15);
        }

        // embers drift up from the hem and off the cloak when it moves; the cloak turns to them when it vanishes and when it dies
        embers.position.set(0, -hem - 20);
        embers.show(f.t, 0, 0, 80, 120, 0.7, (0.3 + 0.2 * Math.abs(sway)) * vis + (f.anim === 'alert' ? easeIn(f.p) * 0.9 : 0) + (dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.4 : 0));
        ash.position.set(0, -hem - 40);
        ash.show(f.t, 0, 0, 60, 100, 0.4, dead ? 0.7 * Math.min(1, f.dying * 3) : 0);
      },
    };
  },
};
