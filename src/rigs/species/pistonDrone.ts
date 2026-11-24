import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix } from '../kit/geometry';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { solid } from '../kit/materials';
import { easeIn, easeOut } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE PISTON DRONE (docs/PROMPT24-LOG.md): a machine that hangs from its line, slides along it after the hero and drops. A barrel of riveted steel with one big lens for an eye, a piston under it that ends in a three-pronged claw, two
 * little thrusters, a cable that goes up out of the picture. It tracks the hero hanging level, leaning into its slide; the LOCK is the piston being drawn up into the barrel, the claw spreading, the lens going red and steam venting —
 * it is a hammer being cocked —; the DROP is the whole piston thrown down and the claw closing; and STUCK, jammed in the floor, it jerks and vents steam, the lens flickering, which is when it can be hurt. Then the cable draws it up.
 */

const STEEL = mix(PALETTE.worldSlate, PALETTE.worldMist, 0.35);
const DARK = PALETTE.worldNight;
const RIM = PALETTE.worldGlow;
const LAMP = PALETTE.accentWarm;
const Y0 = 62; // where the middle of the barrel hangs, cm

export const PISTON_DRONE_RIG: RigDef = {
  id: 'piston_drone',
  width: 1.2,
  height: 1.0,
  aura: { color: LAMP, at: [0, Y0], size: 170, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('piston-drone');
    const rig = k.group('rig');
    const metal = solid(STEEL, RIM, { ramp: 'cap', edge: DARK, width: 2.2 });
    const dark = solid(mix(STEEL, DARK, 0.5), mix(RIM, DARK, 0.4), { ramp: 'cap', edge: DARK, width: 1.4 });

    const cable = k.ribbon({ n: 8, width: () => 4.2, color: mix(STEEL, DARK, 0.4), ramp: 'tube', edge: { color: DARK, grow: 0.5 }, rim: { color: RIM, width: 0.9, alpha: 0.7 } }, 'cable');
    const rod = k.part('rod', (pen) => {
      pen.shape([[-8, 0], [-8, -60], [8, -60], [8, 0]], solid(mix(STEEL, PALETTE.worldGlow, 0.15), RIM, { ramp: 'cap', edge: DARK, width: 1.2 }), { round: 0 });
      for (const y of [-14, -30, -46]) pen.line([-8, y], [8, y]).stroke(DARK, 1.4, 0.7);
    });
    const claw = [0, 1, 2].map((i) =>
      k.part(`claw${i}`, (pen) => pen.shape([[-3.4, 0], [-4.4, -14], [0, -26], [4.4, -14], [3.4, 0]], i === 1 ? metal : dark, { sharp: [2], round: 0.4 }, (p) => p.line([0, -2], [0, -22]).stroke(RIM, 0.7, 0.55))),
    );
    const hub = k.part('hub', (pen) => pen.shape([[-13, -4], [-15, 4], [-8, 10], [8, 10], [15, 4], [13, -4], [6, -9], [-6, -9]], metal));
    const barrel = k.part('barrel', (pen) =>
      pen.shape([[-52, 0], [-56, 22], [-46, 42], [-24, 52], [24, 52], [46, 42], [56, 22], [52, 0], [34, -12], [-34, -12]], metal, { round: 0.6 }, (p) => {
        // the bands, the rivets and the plate seams of the drum
        for (const y of [-6, 14, 34]) p.contour([[-52, y], [-26, y + 4], [0, y + 5], [26, y + 4], [52, y]], { closed: false }).stroke(DARK, 2.6, 0.85);
        for (let i = -4; i <= 4; i++) for (const y of [4, 24, 44]) p.circle(i * 11.5, y + 2 - Math.abs(i) * 0.8, 1.5).fill(DARK, 0.9);
        p.line([-14, -10], [-14, 50]).stroke(DARK, 1.2, 0.5);
        p.line([14, -10], [14, 50]).stroke(DARK, 1.2, 0.5);
      }),
    );
    const lensRing = k.part('lens-ring', (pen) => {
      pen.circle(0, 0, 22).fill(DARK);
      pen.circle(0, 0, 22).stroke(RIM, 1.3, 0.8);
      pen.circle(0, 0, 18).stroke(mix(STEEL, DARK, 0.3), 2, 1);
    });
    const lens = k.part('lens', (pen) => {
      pen.circle(0, 0, 15).fill(mix(LAMP, PALETTE.enemyInk, 0.6));
      pen.circle(0, 0, 11).fill(LAMP);
      pen.circle(-4, 4, 4).fill(PALETTE.whiteHot, 0.55);
    });
    const lensGlow = k.glow(LAMP, 80, 0);
    const jetL = k.part('jet-l', (pen) => pen.shape([[0, 0], [-10, 7], [-26, 5], [-30, -4], [-12, -8]], dark, { round: 0.5 }));
    const jetR = k.part('jet-r', (pen) => pen.shape([[0, 0], [10, 7], [26, 5], [30, -4], [12, -8]], dark, { round: 0.5 }));
    const flameL = k.glow(PALETTE.violetGlow, 28, 0);
    const flameR = k.glow(PALETTE.violetGlow, 28, 0);
    const steam = new Motes(k, 12, mix(PALETTE.worldMist, PALETTE.whiteHot, 0.25), 22, 0.1);
    const sparks = new Motes(k, 8, PALETTE.emberHot, 7, 0.6);
    const bits = [0, 1, 2, 3, 4].map((i) => k.part(`plate${i}`, (pen) => pen.shape([[-9, -6], [-11, 6], [5, 9], [12, -2], [3, -8]], metal, { round: 0.2 })));
    for (const b of bits) b.visible = false;

    rig.addChild(jetL, jetR, flameL, flameR, rod, ...claw, hub, barrel, lensRing, lens, lensGlow, ...bits);
    root.addChild(cable, rig, steam, sparks);
    place(jetL, -52, 24, 0.12);
    place(jetR, 52, 24, -0.12);
    place(barrel, 0, 8);
    place(lensRing, 0, 36);
    place(lens, 0, 36);
    lensGlow.position.set(0, -36);
    flameL.position.set(-52, -16);
    flameR.position.set(52, -16);

    let slide = 0;
    let cock = 0;
    let drop = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const lock = f.anim === 'telegraph';
        const fall = f.anim === 'attack';
        const stuck = f.phase === 'recovery';
        const rising = f.anim === 'walk';

        slide = dt > 0 ? damp(slide, Math.max(-1, Math.min(1, f.vx * 0.3)), 8, dt) : slide;
        cock = dt > 0 ? damp(cock, lock ? easeOut(f.p) : 0, 14, dt) : cock;
        drop = dt > 0 ? damp(drop, fall ? 1 : 0, 40, dt) : drop;

        // the barrel hangs level, leans into the slide, trembles as it is cocked, and shakes as it is stuck
        const tremble = lock ? Math.sin(f.t * 70) * 1.1 * f.p : stuck ? Math.sin(f.t * 22) * 1.4 * (1 - f.p) : 0;
        const bob = lock || fall || stuck || dead ? 0 : 2.2 * Math.sin(f.t * 1.7);
        const by = Y0 + bob - (stuck ? 6 : 0) - (dead ? 28 * easeIn(f.dying) : 0);
        place(rig, tremble - 3 * f.hurt, by, -0.14 * slide + (stuck ? 0.05 * Math.sin(f.t * 17) : 0) - 0.3 * f.hurt + (dead ? 0.9 * f.dying : 0));

        // the piston: drawn up into the barrel to cock (the claw spreads), thrown out to drop (the claw closes), then jammed
        const out = fall ? 1 : stuck ? 0.92 - 0.3 * f.p : rising ? 0.35 * (1 - f.p) : 0.22;
        const ext = (1 - cock * 0.95) * out * 1;
        place(rod, 0, 6, 0, 1, Math.max(0.15, ext * 1.05));
        const tip = 6 - 60 * Math.max(0.15, ext * 1.05) - 8;
        const spreadA = 0.15 + 0.85 * cock - (fall ? 0.9 : 0) - (stuck ? 0.1 : 0);
        claw.forEach((c, i) => {
          const a = (i - 1) * (0.28 + 0.8 * Math.max(0, spreadA));
          place(c, (i - 1) * 6, tip + 5, a);
        });
        place(hub, 0, tip + 6);
        // the lens: dim and amber while it tracks, red-hot through the cock, a flicker while it is stuck
        const flick = stuck ? 0.55 + 0.45 * Math.sin(f.t * 31) * Math.sin(f.t * 7) : 1;
        const lamp = dead ? 0 : (0.3 + 0.85 * f.heat + (fall ? 0.3 : 0)) * flick;
        lens.alpha = Math.max(0.25, Math.min(1, lamp + 0.25));
        place(lens, 0, 36, 0, 1 + 0.18 * f.heat, 1 + 0.18 * f.heat);
        lensGlow.alpha = Math.min(1, lamp);
        lensGlow.scale.set((60 + 70 * f.heat) / lensGlow.texture.width);

        // the thrusters: a violet flicker that works harder when it slides and cuts out when it drops
        const thrust = fall || dead ? 0 : 0.35 + 0.5 * Math.abs(slide) + 0.1 * Math.sin(f.t * 21);
        flameL.alpha = flameR.alpha = thrust;
        flameL.scale.set((22 + 14 * thrust) / flameL.texture.width);
        flameR.scale.set((22 + 14 * thrust) / flameR.texture.width);
        place(jetL, -52, 24, 0.12 + 0.08 * slide);
        place(jetR, 52, 24, -0.12 + 0.08 * slide);

        // the cable goes up out of the picture, fading as it goes, and stretches with the drop
        const sag = 6 * Math.sin(f.t * 1.3) + 14 * slide;
        const top = by + 40;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < 8; i++) {
          const u = i / 7;
          pts.push([sag * Math.sin(u * Math.PI) * 0.6 + tremble * 0.3 * (1 - u), top + u * (110 + 150 * drop) + 0]);
        }
        cable.setSpine(pts);
        cable.alpha = 0.95 * (dead ? 1 - f.dying : 1);

        // steam: vented with the cock, jetting from the barrel while it is stuck; sparks where the claw bit the floor
        steam.position.set(0, -(by + 18));
        steam.show(f.t, 0, 0, 120, 60, 1.1, lock ? 0.5 * f.p : stuck ? 0.9 * (1 - f.p * 0.6) : dead ? 0.7 * Math.min(1, f.dying * 3) : 0);
        sparks.position.set(0, -(Math.max(2, by + tip)));
        sparks.show(f.t, 0, 0, 40, 30, 1.8, fall && f.p > 0.5 ? 0.9 : stuck && f.p < 0.4 ? 0.9 : 0);

        bits.forEach((b, i) => {
          b.visible = dead && f.dying > 0.15;
          if (b.visible) flung(b, [(i - 2) * 18, 40], [(i - 2) * 30, 30 + i * 6], (i - 2) * 3, 180, -by + 4, Math.min(1, (f.dying - 0.15) * 1.3));
        });
      },
    };
  },
};
