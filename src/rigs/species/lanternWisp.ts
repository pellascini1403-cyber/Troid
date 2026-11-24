import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix } from '../kit/geometry';
import { flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink } from '../kit/materials';
import { easeIn, easeOut, tentacle, wobble } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE LANTERN WISP (docs/PROMPT24-LOG.md): a small flame in a cage of black ribs, hung from a ring, with a trail of spirit behind it and two dark slits for eyes in the light. It drifts, it comes, and it goes off — so the warning is the
 * cage: through the fuse it trembles harder and harder, the flame swells and goes white, the ribs bow apart and light leaks between them; the blast is the cage bursting open, every rib thrown out, and a ring of light after it.
 * Put out before it blasts, the flame shrinks to an ember and the cage falls.
 */

const RIM = PALETTE.violetCore;
const FLAME = PALETTE.violetGlow;
/** The ribs of the cage, seen from the side: two in front and two behind, at the same height of the sides (a cage of four). */
const RIBS = [-0.82, 0.82, -0.82, 0.82] as const;
const R = 16;
const CY = 36;

export const LANTERN_WISP_RIG: RigDef = {
  id: 'lantern_wisp',
  width: 0.7,
  height: 0.7,
  aura: { color: RIM, at: [0, CY], size: 150, base: 0.2 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('lantern-wisp');
    const core = k.group('core');
    const trail = [0, 1].map((i) =>
      k.ribbon({ n: 8, width: (u) => (i ? 7 : 9) * (1 - u) ** 0.8 + 0.6, color: mix(PALETTE.violetCore, PALETTE.violetDeep, 0.35 + i * 0.2), ramp: 'fade', alpha: 0.7 - i * 0.2 }, `trail${i}`),
    );
    for (const t of trail) t.blendMode = 'add';

    const halo = k.glow(FLAME, 110, 0.5);
    const flameOuter = k.part('flame-outer', (pen) =>
      pen.shape([[0, -15], [-9.5, -5], [-8, 8], [0, 19], [8, 8], [9.5, -5]], { fill: mix(PALETTE.violetCore, PALETTE.violetGlow, 0.45), ramp: 'sphere', rims: [] }, { sharp: [3] }),
    );
    const flameCore = k.part('flame-core', (pen) => pen.shape([[0, -9], [-5.5, -2], [-4.5, 6], [0, 12], [4.5, 6], [5.5, -2]], { fill: PALETTE.whiteHot, rims: [] }, { sharp: [3] }));
    const eyes = k.part('eyes', (pen) => {
      pen.ellipse(-3.3, 0, 1.4, 3.2).fill(PALETTE.enemyInk);
      pen.ellipse(3.3, 0, 1.4, 3.2).fill(PALETTE.enemyInk);
    });
    const light = k.glow(PALETTE.whiteHot, 70, 0.9);

    // the cage: two rings, a cap with its handle, a point below, and six ribs that bow out when the fuse burns
    const band = (y: number, w: number) =>
      k.part(`band${y}`, (pen) => {
        pen.ellipse(0, 0, w, 3.2).stroke(PALETTE.enemyInk, 3, 1);
        pen.ellipse(0, 0, w, 3.2).stroke(RIM, 0.8, 0.8);
      });
    const bandTop = band(1, 9);
    const bandBot = band(2, 9);
    const cap = k.part('cap', (pen) => {
      pen.shape([[-10, 0], [-7, 7], [0, 10], [7, 7], [10, 0]], ink(RIM, { width: 1.4 }));
      pen.circle(0, 16, 5).stroke(PALETTE.enemyInk, 3, 1);
      pen.circle(0, 16, 5).stroke(RIM, 0.8, 0.8);
    });
    const tip = k.part('tip', (pen) => pen.shape([[-7, 0], [0, -11], [7, 0], [0, 3]], ink(RIM, { width: 1.3 }), { sharp: [1] }));
    const ribs = RIBS.map((a, i) =>
      k.part(`rib${i}`, (pen) => {
        const xm = R * Math.sin(a);
        const far = i < 2;
        const w = far ? 0.88 : 1;
        const pts: Array<[number, number]> = [[xm * 0.38 * w, 17], [xm * w, 7], [xm * 1.04 * w, -3], [xm * 0.4 * w, -16]];
        pen.contour(pts, { closed: false }).stroke(PALETTE.enemyInk, 3.3, 1);
        pen.contour(pts, { closed: false }).stroke(far ? mix(RIM, PALETTE.enemyInk, 0.55) : a < 0 ? mix(RIM, PALETTE.violetGlow, 0.3) : RIM, 0.9, 0.9);
      }),
    );
    const sparks = k.glow(PALETTE.whiteHot, 24, 0);
    const burst = k.glow(PALETTE.whiteHot, 120, 0);
    const ring = k.part('ring', (pen) => pen.circle(0, 0, 50).stroke(FLAME, 3, 0.9));
    ring.blendMode = 'add';

    core.addChild(halo, ...ribs.slice(0, 2), bandBot, tip, flameOuter, flameCore, eyes, light, bandTop, cap, ...ribs.slice(2), sparks);
    root.addChild(...trail, core, ring, burst);
    place(bandTop, 0, 17);
    place(bandBot, 0, -16);
    place(cap, 0, 18);
    place(tip, 0, -17);
    place(flameOuter, 0, 0);
    place(flameCore, 0, -1);
    place(eyes, 0, 1);

    let lean = 0;
    let swell = 0;
    let spread = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const fuse = f.anim === 'telegraph';
        const blast = f.anim === 'attack';
        const chase = f.anim === 'run';

        lean = dt > 0 ? damp(lean, chase ? Math.max(-1, Math.min(1, f.vx * 0.2)) : 0, 6, dt) : lean;
        const wantSwell = fuse ? easeIn(f.p) : blast ? 1 : 0;
        swell = dt > 0 ? damp(swell, wantSwell, 14, dt) : swell;
        spread = dt > 0 ? damp(spread, fuse ? easeIn(f.p) : blast ? 1.4 : 0, 12, dt) : spread;

        const bob = 3.2 * Math.sin(f.t * 1.9) + (chase ? 1.6 * Math.sin(f.t * 6) : 0) + 4 * Math.sin(f.t * 0.8 + 1) * (fuse ? 0 : 0.5);
        const tremble = fuse ? Math.sin(f.t * (50 + 60 * f.p)) * (0.5 + 3 * f.p) : 0;
        const gone = blast ? Math.min(1, f.p * 3) : 0;
        place(core, tremble + 3 * lean * 4 - 3 * f.hurt, CY + bob + (dead ? -28 * easeIn(f.dying) : 0), -0.28 * lean + 0.04 * Math.sin(f.t * 1.3) + (fuse ? 0.05 * Math.sin(f.t * 30) * f.p : 0) + (dead ? 0.8 * f.dying : 0));

        // the flame: a flicker of its own; it swells and whitens with the fuse, flashes with the blast, and goes out when it is put out
        const flick = 1 + 0.07 * wobble(f.t, 7 + 12 * f.heat, 1) + 0.03 * Math.sin(f.t * 23);
        const size = (1 + 0.95 * swell) * flick * (dead ? 1 - 0.85 * easeOut(f.dying) : 1) * (blast ? 1 + 0.5 * f.p : 1);
        place(flameOuter, 0, 0, 0.05 * wobble(f.t, 3, 2), size, size * (1 + 0.12 * wobble(f.t, 9, 3)));
        place(flameCore, 0, -1 + 2 * swell, 0, size * 0.9, size);
        const open = dead ? 0.15 : 1 - 0.8 * f.hurt;
        place(eyes, 0, 2 + 2 * swell, 0, 1 + 0.4 * swell, Math.max(0.1, open) * (fuse ? 1.2 : 1));
        flameCore.alpha = flameOuter.alpha = blast ? Math.max(0, 1 - Math.max(0, f.p - 0.35) * 1.6) : dead ? 1 - f.dying : 1;
        eyes.alpha = flameCore.alpha;
        halo.alpha = Math.min(1, 0.45 + 0.6 * swell + 0.1 * flick) * (dead ? 1 - f.dying : 1) * (blast ? 1 - f.p * 0.6 : 1);
        halo.scale.set((90 + 130 * swell + 10 * flick) / halo.texture.width);
        light.alpha = Math.min(1, (0.55 + 0.55 * swell) * flick) * (dead ? 1 - f.dying : 1) * (blast ? Math.max(0, 1 - f.p * 1.4) : 1);
        light.scale.set((52 + 50 * swell) / light.texture.width);

        // the cage: the ribs bow apart as the fuse burns, and fly off in the blast
        ribs.forEach((r, i) => {
          const a = RIBS[i]!;
          if (blast || dead) {
            const t = blast ? f.p : f.dying;
            flung(r, [0, 0], [a * 150, 30 + (i % 2) * 24], a * 6, blast ? 40 : 220, -(CY - 4), Math.min(1, t * (blast ? 2.2 : 1)));
            r.alpha = 1 - Math.min(1, t * (blast ? 2.4 : 1.2));
          } else {
            place(r, a * 4.5 * spread, 0, a * 0.04 * spread, 1 + 0.55 * spread * Math.abs(a), 1);
            r.alpha = 1;
          }
        });
        for (const b of [bandTop, bandBot]) b.alpha = blast ? Math.max(0, 1 - f.p * 3) : dead ? 1 - f.dying : 1;
        bandTop.scale.set(1 + 0.4 * spread, 1);
        bandBot.scale.set(1 + 0.4 * spread, 1);
        cap.alpha = tip.alpha = blast ? Math.max(0, 1 - f.p * 2.4) : dead ? 1 - f.dying : 1;
        place(cap, 0, 18 + (blast ? 30 * gone : 0));
        place(tip, 0, -17 - (blast ? 30 * gone : 0));
        sparks.alpha = fuse ? 0.4 + 0.5 * f.p : 0;
        sparks.position.set((wobble(f.t, 14, 4)) * 12, -(wobble(f.t, 11, 5)) * 10);

        // the blast: a flash, and a ring of light that runs out
        burst.visible = blast;
        burst.position.set(0, -CY);
        burst.alpha = blast ? Math.max(0, 1 - f.p * 1.25) : 0;
        burst.scale.set((80 + 220 * easeOut(f.p)) / burst.texture.width);
        ring.visible = blast;
        if (blast) {
          ring.alpha = Math.max(0, 1 - f.p) * 0.95;
          place(ring, 0, CY, 0, 0.3 + 3.8 * easeOut(f.p), 0.3 + 3.8 * easeOut(f.p));
        }

        // the trail: spirit streaming out behind it, longer the faster it goes
        const speed = Math.min(1, Math.abs(f.vx) / 4);
        trail.forEach((t, i) => {
          const dir = Math.PI + 0.3 * lean + 0.25 * (i ? -1 : 1) * Math.sin(f.t * 2 + i);
          const pts = tentacle([0, CY + bob - 10], dir + (i ? 0.5 : -0.35), 26 + 30 * speed + 6 * i, 8, 0.5 * lean, 0.3 + 0.2 * speed, f.t * (3 + 4 * speed) + i * 2);
          t.setSpine(pts.map((p) => [p[0], p[1] - 6 * (1 - speed)] as const));
          t.visible = !blast && !dead;
        });
      },
    };
  },
};
