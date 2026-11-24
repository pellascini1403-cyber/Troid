import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens, solid } from '../kit/materials';
import { easeIn, easeInOut, easeOut } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE VEIL SHADE (docs/PROMPT24-LOG.md): a mourner made of cloth and dark — a hood with two slanted slits of light for eyes, a long cloak that is a mesh and moves like cloth (it trails behind whatever way it drifts and fades into nothing
 * at the hem), a veil that hangs from the hood and stirs without wind, and, under the cloak, an arm that ends in a long pale claw. It lurks and drifts; to attack it VANISHES — the cloak thins to nothing — and comes back behind the hero:
 * the reappearance is the warning, the arm already raised, the claw catching the light; and the slash is the arm swung through a wide arc that leaves a crescent of light hanging in the air after it. Dead, the cloak falls in on itself.
 */

const RIM = PALETTE.violetCore;
const CLOAK = mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.38);
const EDGE = PALETTE.violetGlow;
const COLS = 5;
const ROWS = 9;
const TOP = 122;
const HEM = 12;

export const VEIL_SHADE_RIG: RigDef = {
  id: 'veil_shade',
  width: 0.9,
  height: 1.7,
  shadow: 70,
  aura: { color: RIM, at: [0, 80], size: 210, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('veil-shade');
    const cloak = k.cloth({ cols: COLS, rows: ROWS, color: CLOAK, ramp: 'soft', alpha: 0.97 }, 'cloak');
    const inner = k.cloth({ cols: COLS, rows: ROWS, color: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.15), ramp: 'soft', alpha: 0.9 }, 'cloak-inner');
    const veil = k.cloth({ cols: 2, rows: 5, color: mix(PALETTE.violetDeep, PALETTE.violetGlow, 0.25), ramp: 'fade', alpha: 0.55 }, 'veil');
    const edgeBack = k.ribbon({ n: ROWS + 1, width: (u) => 2.6 * (1 - u * 0.7) + 0.3, color: EDGE, ramp: 'flat', alpha: 0.9 }, 'edge-back');
    const edgeFront = k.ribbon({ n: ROWS + 1, width: (u) => 1.6 * (1 - u * 0.7) + 0.2, color: RIM, ramp: 'flat', alpha: 0.6 }, 'edge-front');

    const hood = k.part('hood', (pen) =>
      pen.shape([[-14, 0], [-17, 14], [-11, 31], [1, 45], [10, 30], [15, 12], [13, 0], [0, -5]], ink(RIM, { gloss: lens([-6, 24], 3, 11, 0.12, PALETTE.violetGlow, 0.22), width: 2.6 }), { sharp: [3], round: 0.9 }, (p) => {
        // the face is a hollow: darker than the hood, with the line of the cowl round it
        p.shape([[-8, 4], [-9, 16], [-3, 26], [5, 22], [9, 12], [7, 3], [0, 1]], { fill: PALETTE.enemyInk, rims: [] }, { round: 1 });
      }),
    );
    const eyes = [0, 1].map((i) => k.part(`eye${i}`, (pen) => pen.shape([[-2, 8], [-1.6, -8], [0.8, -9], [2.2, 7], [0.4, 9]], { fill: PALETTE.whiteHot, rims: [] }, { round: 0.6 })));
    const eyeGlow = k.glow(PALETTE.violetGlow, 50, 0);
    // the arm and its claw: behind the cloak at rest, out in front of it when it strikes
    const arm = new Leg(k, 'arm', { l1: 30, l2: 36, w0: 7, w1: 5, w2: 3.4, mat: ink(RIM, { width: 1.4 }) });
    const claw = k.part('claw', (pen) =>
      pen.shape([[0, 4], [12, 17], [34, 20], [62, 3], [36, 12], [12, 6]], solid(mix(PALETTE.worldGlow, PALETTE.violetGlow, 0.3), PALETTE.whiteHot, { ramp: 'tube', edge: PALETTE.enemyInk, width: 1.4 }), { sharp: [3], round: 0.7 }),
    );
    const clawGlow = k.glow(PALETTE.whiteHot, 60, 0);
    const trail = k.part('trail', (pen) => {
      pen.arc(0, 0, 80, -1.9, 0.6).stroke(PALETTE.violetGlow, 5, 0.9);
      pen.arc(0, 0, 74, -1.7, 0.4).stroke(PALETTE.whiteHot, 2.2, 0.9);
    });
    trail.blendMode = 'add';
    const dust = new Motes(k, 12, PALETTE.violetGlow, 9, 0.3);

    // the arm is drawn BEHIND the cloak (so it shows only when it comes out), the claw too; the trail over everything
    root.addChild(arm.root, claw, clawGlow, inner, cloak, edgeBack, edgeFront, hood, ...eyes, eyeGlow, veil, trail, dust);

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

        // the cloak lags behind the way it drifts (a spring on its speed) and billows when it appears or strikes
        sway = dt > 0 ? damp(sway, Math.max(-1.4, Math.min(1.4, -f.vx * 0.45)), 4, dt) : sway;
        vanish = dt > 0 ? damp(vanish, f.anim === 'alert' ? easeIn(f.p) : 0, 10, dt) : vanish;
        const bob = 3.6 * Math.sin(f.t * 1.4) + (moving ? 1.8 * Math.sin(f.t * 5) : 0);
        const fall = dead ? easeIn(f.dying) : 0;
        const top = TOP + bob * 0.5 - 24 * fall;
        const hem = HEM + 6 + bob - 4 * fall;
        const billow = (appear ? 1 : 0) * f.p * 0.9 + (slash ? 1 : 0) * 0.6;

        const gap = (j: number): number => j / ROWS;
        const edgeX = (j: number, back: boolean): number => {
          const u = gap(j);
          const width = 12 + 62 * u ** 0.85 + 8 * billow * u;
          const lag = sway * 22 * u ** 1.5 + 4 * Math.sin(f.t * 1.7 - j * 0.55) * u ** 1.3 + (dead ? 28 * fall * u : 0);
          return (back ? -width / 2 : width / 2) + lag - 3 * f.hurt * u;
        };
        const yAt = (j: number): number => top + (hem - top) * gap(j) * (dead ? 1 - 0.55 * fall : 1);
        const hemTooth = [0, 6, 1, 8, 3, 7];
        cloak.setPoints((i, j) => {
          const back = edgeX(j, true);
          const front = edgeX(j, false);
          const x = back + ((front - back) * i) / COLS;
          const y = yAt(j) + (j === ROWS ? hemTooth[i]! * (1 + 0.5 * Math.sin(f.t * 3 + i)) * (1 - fall) : 0);
          return [x, y] as Pt;
        });
        inner.setPoints((i, j) => {
          const back = edgeX(j, true) * 0.82 + 3;
          const front = edgeX(j, false) * 0.82 - 3;
          return [back + ((front - back) * i) / COLS, yAt(j) - 1 + (j === ROWS ? hemTooth[i]! * 0.7 : 0)] as Pt;
        });
        const backEdge: Pt[] = [];
        const frontEdge: Pt[] = [];
        for (let j = 0; j <= ROWS; j++) {
          backEdge.push([edgeX(j, true), yAt(j)]);
          frontEdge.push([edgeX(j, false), yAt(j)]);
        }
        edgeBack.setSpine(backEdge);
        edgeFront.setSpine(frontEdge);
        const veilAlpha = 1 - 0.85 * vanish;
        cloak.alpha = veilAlpha * (dead ? 1 - fall * 0.9 : 1);
        inner.alpha = cloak.alpha;
        edgeBack.alpha = edgeFront.alpha = veilAlpha * 0.9;

        // the hood sits on the shoulders and nods with the drift; the veil hangs from its brim and stirs on its own
        const nod = -0.05 * sway + 0.03 * Math.sin(f.t * 1.4) - 0.3 * f.hurt - (dead ? 0.9 * fall : 0);
        place(hood, 2 + sway * 4, top - 4 - 6 * fall, nod);
        eyes.forEach((e, i) => {
          const open = dead ? 0.05 : 1 - 0.8 * f.hurt;
          place(e, 2 + sway * 4 + (i ? 10 : 2), top + 24 - 6 * fall, -0.22 + 0.14 * i, 1 + 0.3 * f.heat, (0.9 + 0.5 * f.heat) * Math.max(0.05, open));
          e.alpha = veilAlpha;
        });
        eyeGlow.position.set(2 + sway * 4 + 7, -(top + 24 - 6 * fall));
        eyeGlow.alpha = Math.min(1, 0.25 + 0.75 * f.heat + (appear ? 0.4 : 0)) * veilAlpha * (dead ? 0 : 1);
        eyeGlow.scale.set((44 + 40 * f.heat) / eyeGlow.texture.width);
        veil.setPoints((i, j) => {
          const u = j / 5;
          const w = 16 + 6 * u;
          return [8 + sway * 4 + (i / 2 - 0.5) * w + 4 * Math.sin(f.t * 2.3 - j * 0.9) * u + sway * 10 * u * u, top + 20 - 34 * u - 4 * fall] as Pt;
        });
        veil.alpha = (0.6 - 0.45 * vanish) * (dead ? 1 - fall : 1);

        // the arm: raised behind and above it when it appears, swung through an arc in the slash, lowered into the cloak after
        const shoulder: Pt = [-4 + sway * 3, top - 12];
        arm.root.position.set(shoulder[0], -shoulder[1]);
        let hx = 14;
        let hy = -52;
        let ang = -0.3;
        let show = 0;
        if (appear) {
          const u = easeOut(f.p);
          hx = -4 - 22 * u;
          hy = 22 + 22 * u;
          ang = 2.0 - 0.2 * u;
          show = u;
        } else if (slash) {
          const u = easeInOut(Math.min(1, f.p * 1.15));
          const a = 2.4 - u * 3.3; // from up and behind, over the head, to forward and down
          hx = Math.cos(a) * 62 + 6;
          hy = Math.sin(a) * 62 - 6;
          ang = a - 1.5;
          show = 1;
        } else if (recover) {
          const u = easeInOut(f.p);
          hx = 52 - 40 * u;
          hy = -38 + 8 * u;
          ang = -1.0 + 0.7 * u;
          show = 1 - u;
        }
        arm.reach(hx, hy, -1);
        arm.root.alpha = show * veilAlpha;
        const ex = shoulder[0] + hx;
        const ey = shoulder[1] + hy;
        place(claw, ex, ey, ang);
        claw.alpha = show * veilAlpha;
        clawGlow.position.set(ex + Math.cos(ang) * 38, -(ey + Math.sin(ang) * 14));
        clawGlow.alpha = show * (appear ? 0.3 + 0.7 * f.p : slash ? 0.9 : 0.25) * veilAlpha;
        clawGlow.scale.set((50 + 40 * (appear ? f.p : 0)) / clawGlow.texture.width);
        // the crescent the slash leaves hanging in the air, thinning away
        trail.visible = slash || (recover && f.p < 0.5);
        if (trail.visible) {
          const u = slash ? Math.min(1, f.p * 1.15) : 1;
          trail.alpha = slash ? Math.sin(Math.min(1, u) * Math.PI * 0.5) * 0.95 : (1 - f.p * 2) * 0.9;
          place(trail, shoulder[0] + 6, shoulder[1] - 6, 0, 1.1, 1.1);
        }
        // it comes apart into motes: when it vanishes and when it dies
        dust.position.set(0, -(60));
        dust.show(f.t, 0, 0, 70, 120, 0.9, f.anim === 'alert' ? easeIn(f.p) * 0.9 : dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.3 : 0);
      },
    };
  },
};
