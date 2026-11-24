import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeOut, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE MAGMA PISTON (docs/PROMPT24-LOG.md): the second half's dropper keeps the piston drone's trick — it hangs on its line, follows the hero, locks and falls — and none of its machinery: a FORGE WEIGHT, a hexagonal block of black basalt
 * on a chain, its underside a pool of molten metal that drips, a jagged mouth and two slits of ember cut into its face. It swings like a pendulum while it tracks; the lock is the weight drawn up a little and the underside blazing,
 * the mouth opening, the whole block shaking on its chain; the drop is a streak of heat straight down; and stuck in the floor it CRACKS — the seams open and glow, steam and embers come out — which is when it can be hurt. Then the chain draws it up.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const BASALT = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.5);
const Y0 = 52;

const BLOCK: readonly Pt[] = [[-52, 0], [-58, 30], [-48, 64], [-26, 80], [26, 80], [48, 64], [58, 30], [52, 0], [32, -10], [-32, -10]];

export const MAGMA_PISTON_RIG: RigDef = {
  id: 'magma_piston',
  width: 1.3,
  height: 1.05,
  aura: { color: RIM, at: [0, Y0 + 30], size: 220, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('magma-piston');
    const rig = k.group('rig');
    const stone = scorched(BASALT, RIM, { gloss: lens([-22, 54], 14, 3.4, -0.3, HOT, 0.14), width: 2.6 });
    const seam = (p: Pen, pts: Pt[], w = 2): void => {
      p.contour(pts, { closed: false, round: 0.3 }).stroke(DEEP, w + 1.2, 0.95);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(RIM, w, 0.95);
      p.contour(pts, { closed: false, round: 0.3 }).stroke(HOT, w * 0.4, 0.9);
    };

    const chain = k.ribbon({ n: 12, width: (u) => 6.2 * (1 + 0.28 * Math.cos(u * TAU * 8)), color: mix(PALETTE.worldMist, PALETTE.enemyInk, 0.55), ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.6 }, rim: { color: RIM, width: 1.1, alpha: 0.8 } }, 'chain');
    const block = k.part('block', (pen) =>
      pen.shape(BLOCK, stone, { round: 0.35 }, (p) => {
        // the columns of the block, with their seams, the bands of iron round it, and the eye-bolt at the top
        for (const x of [-34, -12, 12, 34]) p.line([x * 1.02, 74], [x * 1.1, 0]).stroke(PALETTE.enemyInk, 1.8, 0.85);
        p.contour([[-56, 24], [-26, 20], [0, 19], [26, 20], [56, 24]], { closed: false }).stroke(PALETTE.enemyInk, 2.8, 0.9);
        p.contour([[-52, 56], [-26, 52], [0, 52], [26, 52], [52, 56]], { closed: false }).stroke(PALETTE.enemyInk, 2.8, 0.9);
        seam(p, [[-30, 4], [-24, 16]], 1.3);
        seam(p, [[34, 6], [30, 18]], 1.3);
      }),
    );
    const bolt = k.part('bolt', (pen) => {
      pen.circle(0, 0, 9).stroke(PALETTE.enemyInk, 5, 1);
      pen.circle(0, 0, 9).stroke(mix(PALETTE.worldMist, PALETTE.enemyInk, 0.4), 2.6, 1);
      pen.circle(0, 0, 9).stroke(RIM, 0.8, 0.7);
    });
    const pool = k.part('pool', (pen) => {
      pen.ellipse(0, 0, 46, 9).fill(DEEP);
      pen.ellipse(0, 0, 40, 7).fill(RIM);
      pen.ellipse(-4, 1, 28, 4.4).fill(HOT);
    });
    const poolGlow = k.glow(HOT, 130, 0);
    const mouth = k.part('mouth', (pen) => {
      const zig: Pt[] = [[-32, 0], [-24, 7], [-16, -3], [-8, 7], [0, -3], [8, 7], [16, -3], [24, 7], [32, 0]];
      pen.contour(zig, { closed: false, round: 0 }).stroke(DEEP, 7, 0.95);
      pen.contour(zig, { closed: false, round: 0 }).stroke(RIM, 4.6, 0.95);
      pen.contour(zig, { closed: false, round: 0 }).stroke(HOT, 2, 0.95);
    });
    const eyes = [-1, 1].map(() => k.part('eye', (pen) => pen.shape([[-9, 2], [0, 6], [9, 2], [0, -3.4]], { fill: HOT, rims: [] }, { round: 0.5 })));
    const eyeGlow = k.glow(HOT, 80, 0);
    const cracks = k.part('cracks', (pen) => {
      seam(pen, [[-40, 8], [-30, 26], [-36, 44], [-26, 62]], 2.4);
      seam(pen, [[38, 4], [28, 22], [40, 40], [30, 66]], 2.4);
      seam(pen, [[-8, 14], [-2, 30], [8, 42]], 2);
    });
    cracks.blendMode = 'add';
    const drips = k.ribbon({ n: 5, count: 4, width: (u) => 5 * (1 - u * 0.8) + 0.8, color: HOT, ramp: 'flat', alpha: 0.9 }, 'drips');
    drips.blendMode = 'add';
    const streak = k.part('streak', (pen) => {
      for (const x of [-34, -14, 8, 30]) pen.line([x, 80], [x, 80 + 90 + (x % 3) * 20]).stroke(HOT, 3, 0.55);
    });
    streak.blendMode = 'add';
    const steam = new Motes(k, 12, mix(PALETTE.worldMist, PALETTE.whiteHot, 0.25), 24, 0.1);
    const sparks = new Motes(k, 10, HOT, 8, 0.6);
    const chunks = [0, 1, 2, 3, 4].map((i) => k.part(`chunk${i}`, (pen) => pen.shape([[0, 0], [16 + i * 2, 5], [20, 24], [4, 18]], stone, { round: 0.2 })));
    for (const c of chunks) c.visible = false;

    rig.addChild(streak, drips, pool, poolGlow, block, cracks, mouth, ...eyes, eyeGlow, bolt, ...chunks);
    root.addChild(chain, rig, steam, sparks);
    place(pool, 0, -8);
    place(block, 0, 0);
    place(bolt, 0, 86);

    let slide = 0;
    let cock = 0;
    let drop = 0;
    let crack = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const lock = f.anim === 'telegraph';
        const fall = f.anim === 'attack';
        const stuck = f.phase === 'recovery';
        const rising = f.anim === 'walk';

        slide = dt > 0 ? damp(slide, Math.max(-1, Math.min(1, f.vx * 0.3)), 6, dt) : slide;
        cock = dt > 0 ? damp(cock, lock ? easeOut(f.p) : 0, 14, dt) : cock;
        drop = dt > 0 ? damp(drop, fall ? 1 : 0, 40, dt) : drop;
        crack = dt > 0 ? damp(crack, stuck ? 1 - f.p * 0.6 : dead ? 1 : 0, stuck ? 14 : 6, dt) : crack;

        const heat = Math.min(1, 0.15 + 0.85 * cock + (fall ? 0.5 : 0) + 0.7 * crack);
        const swayA = 0.12 * Math.sin(f.t * 1.5) - 0.2 * slide + (lock ? Math.sin(f.t * 66) * 0.03 * f.p : 0) + (stuck ? Math.sin(f.t * 21) * 0.04 * (1 - f.p) : 0) + 0.3 * f.hurt;
        const by = Y0 + 16 * cock - (stuck ? 14 : 0) - (dead ? 28 * easeIn(f.dying) : 0);
        place(rig, 0, by + 4 * Math.sin(f.t * 1.2) * (stuck || fall || lock ? 0 : 1), swayA + (dead ? 0.8 * f.dying : 0));

        place(block, 0, 0, 0, 1 - 0.0, 1);
        pool.alpha = 0.55 + 0.45 * heat;
        place(pool, 0, -8, 0, 1 + 0.12 * heat, 1 + 0.5 * heat);
        poolGlow.position.set(0, 8);
        poolGlow.alpha = Math.min(1, heat * 0.9) * (dead ? 0 : 1);
        poolGlow.scale.set((100 + 90 * heat) / poolGlow.texture.width);
        cracks.alpha = Math.min(1, 0.12 + 0.95 * Math.max(crack, cock * 0.6));
        // the mouth and the eyes: shut and dim while it tracks, torn open with the lock
        place(mouth, 0, 32, 0, 1 + 0.2 * cock + 0.1 * crack, 1 + 1.4 * cock + 0.9 * crack + (fall ? 0.6 : 0));
        mouth.alpha = Math.min(1, 0.3 + 0.8 * heat);
        const open = dead ? 0.1 : 1 - 0.8 * f.hurt;
        eyes.forEach((e, i) => {
          place(e, i ? 24 : -24, 56, i ? -0.18 : 0.18, 1 + 0.4 * f.heat, Math.max(0.1, open) * (1 + 0.5 * f.heat));
          e.alpha = 0.4 + 0.6 * Math.min(1, f.heat + 0.2);
        });
        eyeGlow.position.set(0, -56);
        eyeGlow.alpha = Math.min(1, 0.2 + 0.8 * f.heat) * (dead ? 0 : 1);
        eyeGlow.scale.set((80 + 60 * f.heat) / eyeGlow.texture.width);

        // the chain: slack and swaying while it tracks, taut and long when it drops
        const topY = by + 90;
        const pts: Pt[] = [];
        const sag = 7 * Math.sin(f.t * 1.3) + 18 * slide + (lock ? Math.sin(f.t * 60) * 2 * f.p : 0);
        for (let i = 0; i < 12; i++) {
          const u = i / 11;
          pts.push([Math.sin(swayA) * -86 * (1 - u) + sag * Math.sin(u * Math.PI) * 0.6, topY + u * (80 + 190 * drop + (rising ? 30 : 0))]);
        }
        chain.setSpine(pts);
        chain.alpha = dead ? Math.max(0, 1 - f.dying * 2) : 1;
        place(bolt, Math.sin(swayA) * -86, 86, 0);
        // molten metal dripping from the underside
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * 24;
          const len = (10 + 16 * ((Math.sin(f.t * 1.1 + i * 2.1) + 1) / 2) + 14 * heat) * (dead ? 1 + f.dying : 1);
          drips.setLine(i, [[x, -6], [x + 0.6, -6 - len * 0.35], [x - 0.4, -6 - len * 0.7], [x, -6 - len]]);
          if (heat < 0.3) drips.hideLine(i);
        }
        drips.commit();
        drips.alpha = Math.min(1, heat);
        streak.visible = fall && f.p < 0.9;
        streak.alpha = fall ? 0.9 * (1 - f.p) : 0;
        steam.position.set(0, -(by + 30));
        steam.show(f.t, 0, 0, 120, 60, 1, stuck ? 0.9 * crack : lock ? 0.4 * f.p : dead ? 0.8 * Math.min(1, f.dying * 3) : 0);
        sparks.position.set(0, -(Math.max(2, by - 4)));
        sparks.show(f.t, 0, 0, 100, 40, 1.8, fall && f.p > 0.5 ? 0.9 : stuck && f.p < 0.4 ? 0.9 : 0);
        chunks.forEach((c, i) => {
          c.visible = dead && f.dying > 0.12;
          if (c.visible) flung(c, [(i - 2) * 22, 44], [(i - 2) * 38, 38 + i * 8], (i - 2) * 2.6, 200, -by + 2, Math.min(1, (f.dying - 0.12) * 1.3));
        });
        if (dead) block.alpha = 1 - Math.min(1, Math.max(0, (f.dying - 0.3) / 0.4)) * 0.9;
        else block.alpha = 1;
      },
    };
  },
};
