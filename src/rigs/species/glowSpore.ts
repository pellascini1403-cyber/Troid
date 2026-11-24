import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix } from '../kit/geometry';
import { Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut, tentacle } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE GLOW SPORE (docs/PROMPT24-LOG.md): a bulb-flower that does not move, shut like a stone until it blooms. SHUT it is a dark, ridged, armoured bud with a thread of light between its petals — a blow is turned away — and that is
 * what it looks like for as long as it sleeps; the bloom (telegraph) peels the petals open, one pair after another, and the seed at its heart — an eye, with a slit for a pupil — comes alight; the burst throws a cloud of spores out and
 * a ring of light after it; and then it stays OPEN, wide and dim and pulsing, the seed bare: that is the window, and it looks like one. Then it shuts again, slowly. Dead, it wilts: the petals droop and the spores fall.
 */

const RIM = PALETTE.violetCore;
const GLOW = PALETTE.violetGlow;
const PETAL = mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.28);
/** Where each petal stands, from the far side to the near one, as a share of the way from the bud's axis to the side: shut, they lean in and meet at the tip; open, they are a cup. The near ones leave the middle clear, so the seed shows. */
const SPREAD = [-1, -0.62, -0.28, 0, 0.28, 0.62, 1] as const;
const NEAR = [-1, -0.66, -0.33, 0.33, 0.66, 1] as const;

export const GLOW_SPORE_RIG: RigDef = {
  id: 'glow_spore',
  width: 0.9,
  height: 1.1,
  shadow: 80,
  aura: { color: RIM, at: [0, 62], size: 170, base: 0.08 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('glow-spore');
    const head = k.group('head');
    const bloom = k.group('bloom');

    const skin = ink(RIM, { width: 2 });
    // ------------------------------------------------------------------------------------------ roots and stem
    const roots = k.part('roots', (pen) => {
      pen.contour([[-4, 6], [-16, 2], [-30, 5], [-40, 1]], { closed: false }).stroke(PALETTE.enemyInk, 5, 1);
      pen.contour([[4, 6], [18, 3], [30, 6], [42, 1]], { closed: false }).stroke(PALETTE.enemyInk, 5, 1);
      pen.contour([[0, 8], [-4, 1], [-10, -2]], { closed: false }).stroke(PALETTE.enemyInk, 4, 1);
      pen.contour([[-4, 6], [-16, 2], [-30, 5], [-40, 1]], { closed: false }).stroke(RIM, 0.9, 0.55);
      pen.contour([[4, 6], [18, 3], [30, 6], [42, 1]], { closed: false }).stroke(RIM, 0.9, 0.55);
    });
    const bulb = k.part('bulb', (pen) => pen.shape([[-14, 4], [-17, 16], [-9, 28], [0, 31], [10, 28], [16, 16], [13, 4], [0, 0]], skin, {}, (p) => p.contour([[-12, 14], [-4, 22], [8, 20]], { closed: false }).stroke(GLOW, 1, 0.45)));
    const stem = k.ribbon({ n: 5, width: (u) => 15 - 6 * u, color: PALETTE.enemyInk, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.3 }, rim: { color: RIM, width: 1.6, alpha: 0.9 } }, 'stem');
    const leafL = k.part('leaf-l', (pen) => pen.shape([[0, 0], [-10, 8], [-26, 10], [-34, 4], [-22, 3], [-8, -1]], skin, { sharp: [3] }));
    const leafR = k.part('leaf-r', (pen) => pen.shape([[0, 0], [10, 7], [24, 8], [31, 2], [20, 2], [8, -1]], skin, { sharp: [3] }));

    // ------------------------------------------------------------------------------------------ the bloom
    const petalShape = (far: boolean) => (pen: import('../kit/paint').Pen): void => {
      const body = far ? mix(PETAL, PALETTE.enemyInk, 0.5) : PETAL;
      pen.shape([[-6.5, 0], [-8.5, 13], [-6, 34], [0, 50], [6, 34], [8.5, 13], [6.5, 0]], ink(far ? mix(RIM, PALETTE.enemyInk, 0.55) : RIM, { fill: body, width: 2, gloss: far ? [] : lens([-2, 22], 2.2, 9, 1.45, GLOW, 0.2) }), { sharp: [3] }, (p) => {
        // the ridge down the middle, a seam of light that leaks between petals when the bud is shut
        p.contour([[0, 3], [-1, 24], [0, 46]], { closed: false }).stroke(far ? RIM : GLOW, 1.1, far ? 0.35 : 0.7);
      });
    };
    const farPetals = SPREAD.map((_, i) => k.part(`petal-far${i}`, petalShape(true)));
    const nearPetals = NEAR.map((_, i) => k.part(`petal-near${i}`, petalShape(false)));
    const seed = k.part('seed', (pen) => {
      pen.circle(0, 0, 11).fill(mix(PALETTE.violetDeep, PALETTE.violetGlow, 0.55));
      pen.circle(0, 0, 8).fill(GLOW);
      pen.circle(-2.5, 3, 3.4).fill(PALETTE.whiteHot, 0.85);
    });
    const pupil = k.part('pupil', (pen) => pen.ellipse(0, 0, 2, 7).fill(PALETTE.enemyInk));
    const seedGlow = k.glow(GLOW, 80, 0);
    const burstGlow = k.glow(RIM, 120, 0);
    const spores = new Motes(k, 18, GLOW, 9, 0.2);
    const drift = new Motes(k, 8, GLOW, 6, 0.6);

    bloom.addChild(...farPetals, seed, pupil, seedGlow, ...nearPetals);
    head.addChild(bloom);
    root.addChild(roots, leafL, leafR, stem, bulb, head, burstGlow, spores, drift);
    place(leafL, -4, 24, 0.5);
    place(leafR, 4, 22, -0.3);
    place(seed, 0, 22);
    place(pupil, 0, 22);
    seedGlow.position.set(0, -22);
    place(bloom, 0, 0);

    // ------------------------------------------------------------------------------------------ motion
    let opened = 0;
    let glowAmt = 0;
    let wilt = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const bloomIng = f.anim === 'telegraph';
        const burst = f.anim === 'attack';
        const spent = f.phase === 'recovery';

        // open as far as the state says, quickly while it blooms and slowly when it closes again
        const wantOpen = dead ? 1 : bloomIng ? easeOut(f.p) : burst ? 1 : spent ? 1 : 0;
        opened = dt > 0 ? damp(opened, wantOpen, wantOpen > opened ? 9 : 2.6, dt) : opened;
        const wantGlow = bloomIng ? easeIn(f.p) : burst ? 1 : spent ? 0.32 + 0.1 * Math.sin(f.t * 3.2) : dead ? 0 : 0.14 + 0.05 * Math.sin(f.t * 1.4);
        glowAmt = dt > 0 ? damp(glowAmt, wantGlow, 10, dt) : glowAmt;
        wilt = dt > 0 ? damp(wilt, dead ? f.dying : 0, 6, dt) : wilt;

        // the whole head sways on its stem, and leans toward the hero's side when it blooms
        const sway = 0.05 * Math.sin(f.t * 1.1 + k.seed * 6) + 0.025 * Math.sin(f.t * 2.7) - 0.18 * wilt + (bloomIng ? 0.06 * Math.sin(f.t * 30) * f.p : 0) - 0.14 * f.hurt;
        const sp = tentacle([0, 6], Math.PI / 2, 40, 5, sway * 2.1, 0.02, f.t * 1.4);
        stem.setSpine(sp);
        const top = sp[4]!;
        place(head, top[0], top[1], sway * 0.9);

        // the petals: shut, they lean in and meet at the tip; open, they are a cup (the far ones a little later and a little less)
        const o = opened;
        const petal = (node: import('pixi.js').Container, a: number, far: boolean): void => {
          const lag = Math.max(0, Math.min(1, (o - Math.abs(a) * 0.12) / 0.88));
          // closed: leaning in toward the axis; open: out, the more the farther from it
          const out = Math.sign(a || 1) * (0.5 + 0.95 * Math.abs(a)) * lag;
          const inward = -a * 0.3 * (1 - lag);
          const droop = wilt * (a < 0 ? -1 : 1) * 0.9;
          const ang = -(far ? (out + inward) * 0.92 : out + inward) - droop;
          place(node, a * (far ? 3 : 5) * (1 - lag) + a * 7 * lag, far ? 8 : 6, ang, far ? 0.94 : 1 - 0.1 * wilt, far ? 0.94 : 1 - 0.18 * wilt);
        };
        SPREAD.forEach((a, i) => petal(farPetals[i]!, a, true));
        NEAR.forEach((a, i) => petal(nearPetals[i]!, a, false));
        const reveal = Math.min(1, Math.max(0, (o - 0.25) / 0.6));
        seed.alpha = pupil.alpha = 0.15 + 0.85 * reveal;
        place(seed, 0, 20 + 4 * reveal, 0, 0.8 + 0.3 * glowAmt + 0.06 * Math.sin(f.t * 5) * glowAmt);
        place(pupil, 1, 20 + 4 * reveal, 0, 1 + 0.4 * glowAmt, 0.8 + 0.6 * glowAmt);
        seedGlow.position.set(0, -(20 + 4 * reveal));
        seedGlow.alpha = Math.min(1, glowAmt * (0.4 + 0.6 * reveal)) * (dead ? 1 - f.dying : 1);
        seedGlow.scale.set((50 + 70 * glowAmt) / seedGlow.texture.width);

        // the burst: spores out in every direction, and a ring of light behind them
        const out = burst ? 1 - f.p * 0.2 : spent ? Math.max(0, 0.9 - f.p * 1.3) : dead ? Math.max(0, 1 - f.dying * 2) : 0;
        spores.position.set(top[0], -top[1] + 10);
        spores.show(f.t, 0, 0, 150, 100, 0.9, out * 0.9);
        drift.position.set(top[0], -top[1] + 10);
        drift.show(f.t, 0, 0, 60, 60, 0.35, spent ? 0.7 : 0);
        const flash = burst ? 1 - f.p : bloomIng ? 0 : 0;
        burstGlow.visible = burst && f.p < 0.9;
        burstGlow.position.set(top[0], -(top[1] + 10));
        burstGlow.alpha = flash * 0.85;
        burstGlow.scale.set((60 + 240 * easeOut(f.p)) / burstGlow.texture.width);
      },
    };
  },
};

