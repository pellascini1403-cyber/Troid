import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { easeIn, easeOut, tentacle, TAU, wobble } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE EMBER WISP (docs/PROMPT24-LOG.md): a spark that has the brain of the lantern wisp — it drifts, it comes, it goes off — and the body of a JELLYFISH of embers: a bell of glowing glass with a single great eye at its heart, a fringe of
 * tentacles of light that stream behind it and curl up under it. It swims, in pulses: each beat of the bell is a push forward. The fuse is the bell swelling and going white, the tentacles drawing up and the eye wide; and the blast it makes
 * is the biggest of any small creature — an area, not a line — so the blast is big: the bell turns itself inside out in a ring of fire that runs out and thins. Put out first, it deflates and sinks, trailing smoke.
 */

const HOT = PALETTE.emberHot;
const CORE = PALETTE.emberCore;
const DEEP = PALETTE.emberDeep;
const CY = 40;

export const EMBER_WISP_RIG: RigDef = {
  id: 'ember_wisp',
  width: 0.8,
  height: 0.8,
  aura: { color: CORE, at: [0, CY], size: 190, base: 0.22 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('ember-wisp');
    const tent = k.ribbon(
      { n: 8, count: 6, width: (u, line) => (4.2 - 3.2 * u) * (line % 2 ? 0.8 : 1), color: mix(CORE, HOT, 0.3), ramp: 'fade', alpha: 0.85 },
      'tentacles',
    );
    tent.blendMode = 'add';
    const halo = k.glow(CORE, 160, 0.5);
    const bell = k.part('bell', (pen) =>
      pen.shape([[-26, -6], [-27, 8], [-18, 24], [0, 31], [18, 24], [27, 8], [26, -6], [14, -10], [0, -7], [-14, -10]], { fill: mix(CORE, DEEP, 0.2), ramp: 'sphere', alpha: 0.95, rims: [{ color: HOT, width: 3, power: 1.2, alpha: 1 }], gloss: [{ at: [-10, 18], rx: 9, ry: 3.2, rot: -0.5, color: PALETTE.whiteHot, alpha: 0.5 }] }, { round: 1 }, (p) => {
        // the ribs of the bell, dark ash drawn on the glass, and the rim of the skirt scalloped
        for (const x of [-16, -6, 6, 16]) p.contour([[x * 0.4, 28], [x, 12], [x * 1.1, -4]], { closed: false }).stroke(mix(DEEP, PALETTE.enemyInk, 0.5), 1.3, 0.55);
        p.contour([[-26, -6], [-20, -11], [-13, -6], [-7, -11], [0, -6], [7, -11], [13, -6], [20, -11], [26, -6]], { closed: false }).stroke(HOT, 1.6, 0.85);
      }),
    );
    const heart = k.part('heart', (pen) => {
      pen.circle(0, 0, 11).fill(DEEP);
      pen.circle(0, 0, 9).fill(CORE);
      pen.circle(0, 0, 6.6).fill(HOT);
      pen.circle(0, 0, 4.2).fill(PALETTE.whiteHot);
    });
    const pupil = k.part('pupil', (pen) => pen.ellipse(0, 0, 1.8, 5.6).fill(PALETTE.enemyInk));
    const heartGlow = k.glow(HOT, 56, 0.8);
    const burst = k.glow(PALETTE.whiteHot, 120, 0);
    const ring = k.part('ring', (pen) => pen.circle(0, 0, 50).stroke(HOT, 4, 0.95));
    ring.blendMode = 'add';
    const ring2 = k.part('ring2', (pen) => pen.circle(0, 0, 50).stroke(CORE, 6, 0.8));
    ring2.blendMode = 'add';
    const sparks = new Motes(k, 12, HOT, 7, 0.4);
    const smoke = new Motes(k, 8, mix(PALETTE.worldMist, PALETTE.worldNight, 0.5), 18, 0.1);
    const flakes = [0, 1, 2, 3, 4].map((i) => k.part(`flake${i}`, (pen) => pen.shape([[0, 0], [10 + i, 5], [14, 14], [3, 12]], { fill: mix(CORE, DEEP, 0.3), rims: [] }, { round: 0.3 })));
    for (const f of flakes) f.visible = false;

    root.addChild(tent, halo, bell, heart, pupil, heartGlow, ring2, ring, burst, sparks, smoke, ...flakes);

    let swell = 0;
    let beat = k.seed * 3;
    let lean = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const fuse = f.anim === 'telegraph';
        const blast = f.anim === 'attack';
        const chase = f.anim === 'run';
        const speed = Math.min(1, Math.abs(f.vx) / 4);

        swell = dt > 0 ? damp(swell, fuse ? easeIn(f.p) : blast ? 1 : 0, 12, dt) : swell;
        lean = dt > 0 ? damp(lean, chase ? Math.max(-1, Math.min(1, f.vx * 0.2)) : 0, 6, dt) : lean;
        beat += dt * (chase ? 2.4 : fuse ? 3 + 5 * f.p : 0.9);
        const pulse = Math.sin(beat * TAU);
        // the bell beats: it opens wide and slow, closes narrow and quick; each closing is a push
        const bellW = 1 + 0.12 * pulse + 0.35 * swell;
        const bellH = 1 - 0.14 * pulse + 0.25 * swell;
        const bob = 4 * Math.sin(f.t * 1.5) - 3 * pulse * (chase ? 1 : 0.4);
        const gone = blast ? Math.min(1, f.p * 3) : 0;
        const sink = dead ? 38 * easeIn(f.dying) : 0;
        place(bell, 3 * lean * 4 - 3 * f.hurt, CY + bob + 6 - sink, -0.2 * lean + 0.05 * Math.sin(f.t * 1.2) + 0.5 * f.hurt, bellW * (dead ? 1 - 0.55 * f.dying : 1), bellH * (dead ? 1 - 0.45 * f.dying : 1));
        bell.alpha = blast ? Math.max(0, 1 - Math.max(0, f.p - 0.2) * 1.8) : dead ? 1 - 0.9 * easeOut(f.dying) : 1;

        // the eye at its heart: a coal that swells with the fuse and looks where it goes
        const open = dead ? 0.15 : 1 - 0.8 * f.hurt;
        const hx = 3 * lean * 4 + 3 * lean;
        place(heart, hx, CY + bob + 12 - sink, 0, (1 + 0.55 * swell) * bellW * 0.9, (1 + 0.55 * swell) * bellH * 0.9 * Math.max(0.15, open));
        place(pupil, hx + 2 * lean, CY + bob + 12 - sink, 0, 1 + 0.5 * swell, (1 + 0.4 * swell) * Math.max(0.15, open));
        heart.alpha = pupil.alpha = blast ? Math.max(0, 1 - f.p * 1.8) : 1;
        heartGlow.position.set(hx, -(CY + bob + 12 - sink));
        heartGlow.alpha = Math.min(1, 0.4 + 0.7 * swell) * (dead ? 1 - f.dying : 1) * (blast ? 1 - f.p : 1);
        heartGlow.scale.set((50 + 90 * swell + 8 * wobble(f.t, 6, 2)) / heartGlow.texture.width);
        halo.alpha = (0.35 + 0.55 * swell) * (dead ? 1 - f.dying : 1) * (blast ? 1 - f.p * 0.8 : 1);
        halo.scale.set((130 + 150 * swell) / halo.texture.width);
        halo.position.set(0, -(CY + bob));

        // the tentacles: six strands of light under the bell, streaming behind it, drawn up and short through the fuse
        const root0: Pt = [0, CY + bob + 2 - sink];
        for (let i = 0; i < 6; i++) {
          const spreadX = (i - 2.5) * 9;
          const len = (46 + 18 * (i % 3) - 10 * swell - 16 * speed * 0) * (dead ? 1 - 0.5 * f.dying : 1);
          const trail = -lean * 0.9;
          const pts = tentacle([root0[0] + spreadX * bellW * 0.8, root0[1] + 2], -Math.PI / 2 + trail * 0.6, len, 8, trail * 1.4 + 0.5 * swell * (i % 2 ? 1 : -1), 0.16 + 0.12 * speed, f.t * (2.4 + 3 * speed + 3 * swell) + i * 1.1);
          tent.setLine(i, pts);
        }
        tent.commit();
        tent.alpha = blast ? Math.max(0, 1 - gone) : dead ? Math.max(0, 1 - f.dying * 1.4) : 0.95;

        // the blast: the bell is thrown inside out in a ring of fire that runs outward; the flash first
        burst.visible = blast;
        burst.position.set(0, -CY);
        burst.alpha = blast ? Math.max(0, 1 - f.p * 1.2) : 0;
        burst.scale.set((90 + 260 * easeOut(f.p)) / burst.texture.width);
        for (const [i, r] of [ring, ring2].entries()) {
          r.visible = blast;
          if (blast) {
            const u = Math.max(0, Math.min(1, f.p - i * 0.12));
            r.alpha = Math.max(0, 1 - u) * (i ? 0.7 : 0.95);
            place(r, 0, CY, 0, 0.3 + 4.4 * easeOut(u), 0.3 + 4.4 * easeOut(u));
          }
        }
        sparks.position.set(0, -CY);
        sparks.show(f.t, 0, 0, 70, 60, 1.1, fuse ? 0.5 * f.p : blast ? 0.9 : 0.12);
        smoke.position.set(0, -CY + 10);
        smoke.show(f.t, 0, 0, 60, 70, 0.4, dead ? Math.min(1, f.dying * 3) * (1 - f.dying * 0.7) : 0);
        flakes.forEach((fl, i) => {
          fl.visible = dead && f.dying > 0.1;
          if (fl.visible) flung(fl, [(i - 2) * 6, CY], [(i - 2) * 22, 20 + i * 5], (i - 2) * 3, 150, 2, Math.min(1, (f.dying - 0.1) * 1.4));
        });
      },
    };
  },
};
