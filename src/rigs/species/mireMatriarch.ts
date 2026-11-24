import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink } from '../kit/materials';
import { easeIn, easeOut, tentacle, TAU } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';
import { MIRE_TOAD_RIG } from './mireToad';

/**
 * THE MIRE MATRIARCH (docs/PROMPT24-LOG.md): the mother of the toads of the mire — the same body made huge and old: she is what a mire toad grows into, so she has its throat, its warts and its legs, at twice and a third its size, and what
 * age has given her: an angler's LURE, a lantern on a long stalk that hangs over her face (it is why her wisps follow her, and in the second phase it burns and calls them), a mouth that opens into a TONGUE that she throws, a crest of pale fins
 * down her back, and a soft pale BELLY under all that hide. The belly is the weak point: while she stands it is hidden by her bulk; when she is spent after an attack she sags onto it and it swells out under her, glowing, pulsing — a pale sac in a dark
 * toad. The tongue is a coil in the mouth and then a lash; the spit is three globs swelling in her cheeks; the leap is the toad's, with a ring of the mire running out along the floor. Dead, she lets all the air go and goes out like a lamp.
 */

const RIM = PALETTE.violetCore;
const GLOW = PALETTE.violetGlow;
const SCALE = 2.3;

export const MIRE_MATRIARCH_RIG: RigDef = {
  id: 'boss_mire_matriarch',
  width: 2.8,
  height: 2.4,
  shadow: 330,
  aura: { color: RIM, at: [0, 90], size: 480, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('mire-matriarch');
    // the body of a mire toad, made huge: everything it does is hers, in the same states
    const toad = MIRE_TOAD_RIG.build(k);
    toad.root.scale.set(SCALE);
    const frame = { ...({} as RigFrame) };

    const fins = [0, 1, 2, 3, 4, 5].map((i) => k.part(`fin${i}`, (pen) => pen.shape([[-7, 0], [-4, 22 + (i % 3) * 8], [2, 36 + (i % 2) * 10], [8, 18], [9, 0]], ink(GLOW, { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.5), width: 1.6 }), { sharp: [2], round: 0.6 })));
    const stalk = k.ribbon({ n: 9, width: (u) => 6 - 3 * u, color: PALETTE.enemyInk, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.5 }, rim: { color: RIM, width: 1.4, alpha: 0.9 } }, 'stalk');
    const lantern = k.part('lantern', (pen) => {
      pen.shape([[-9, 0], [-12, 10], [-8, 20], [0, 24], [8, 20], [12, 10], [9, 0], [0, -4]], { fill: mix(PALETTE.violetCore, PALETTE.violetGlow, 0.5), ramp: 'sphere', rims: [{ color: PALETTE.whiteHot, width: 2, alpha: 0.9 }] }, { round: 1 });
      pen.circle(0, 11, 5.4).fill(PALETTE.whiteHot);
    });
    const lureGlow = k.glow(GLOW, 130, 0.6);
    const tongue = k.ribbon({ n: 10, width: (u) => 13 * (1 - u * 0.5), color: mix(PALETTE.violetDeep, PALETTE.violetCore, 0.35), ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.7 }, rim: { color: GLOW, width: 2, alpha: 0.9 } }, 'tongue');
    const tip = k.part('tongue-tip', (pen) => pen.shape([[-9, 0], [-7, 9], [4, 11], [12, 4], [10, -6], [0, -9]], ink(GLOW, { fill: mix(PALETTE.violetDeep, PALETTE.violetCore, 0.35), width: 1.4 }), { round: 1 }));
    const belly = k.part('belly', (pen) => {
      pen.shape([[-46, 0], [-44, 18], [-24, 32], [4, 34], [30, 28], [46, 12], [44, 0]], { fill: mix(PALETTE.violetDeep, PALETTE.violetGlow, 0.5), ramp: 'sphere', alpha: 0.96, rims: [{ color: PALETTE.whiteHot, width: 2.4, alpha: 0.85 }], gloss: [{ at: [-20, 24], rx: 18, ry: 5, rot: -0.1, color: PALETTE.whiteHot, alpha: 0.4 }] }, { round: 1 }, (p) => {
        for (const x of [-26, -9, 9, 26]) p.contour([[x, 4], [x * 1.1, 18], [x, 28]], { closed: false }).stroke(PALETTE.violetCore, 1.4, 0.6);
      });
    });
    const globs = [0, 1, 2].map(() => k.glow(GLOW, 40, 0));
    const spores = new Motes(k, 14, GLOW, 12, 0.3);
    const beacon = new Beacon(k, GLOW, 250, PALETTE.whiteHot);
    const opening = new Opening();
    const waking = new Waking();

    root.addChild(...fins, toad.root, belly, beacon, tongue, tip, stalk, lantern, lureGlow, ...globs, spores);

    return {
      root,
      update(f: RigFrame) {
        const key = f.attackKey ?? '';
        const leap = key === 'leap';
        const tongueOn = key === 'tongue';
        const spit = key === 'spit';
        const strike = f.anim === 'attack';
        const wind = f.anim === 'telegraph';
        const dead = f.anim === 'death';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;

        // the toad under it reads the state as a toad does: the leap is a leap and a landing (the ring); the tongue and the spit are a crouch with the throat swelling
        Object.assign(frame, f);
        if (strike && leap) {
          if (f.p > 0.78) {
            frame.anim = 'land';
            frame.p = (f.p - 0.78) / 0.22;
            frame.phase = 'active';
          } else frame.p = f.p / 0.78;
        } else if (strike && (tongueOn || spit)) {
          frame.anim = 'telegraph';
          frame.p = 1;
        } else if (f.anim === 'phaseTransition') {
          frame.anim = 'telegraph';
          frame.p = Math.min(1, f.p * 0.8);
          frame.heat = 0.6 + 0.4 * surge(f);
        }
        if (!f.awake) {
          frame.anim = 'crouch';
          frame.p = 0.5;
        }
        toad.update(frame);

        // the belly: hidden under her bulk while she stands, swelling out under her, glowing, when she is spent
        place(belly, 0, 2, 0, 0.5 + 1.8 * open, 0.2 + 1.9 * open);
        belly.alpha = open;
        beacon.show(f.t, [0, 60 + 30 * open], open, 0);
        // the crest of fins down her back, standing up with the warning and the second phase
        fins.forEach((fn, i) => {
          const stand = 0.55 + 0.45 * Math.max(wind ? f.p : 0, strike ? 1 : 0, second * 0.8, roar) + 0.05 * Math.sin(f.t * 2 + i);
          place(fn, (-90 + i * 30) * 1.0, 78 + 10 * Math.sin(i * 0.9) - (dead ? 50 * f.dying : 0), -0.2 + i * 0.05, 1.5 * stand, 1.5 * stand);
          fn.alpha = dead ? 1 - f.dying : awake;
        });
        // the lure: a lantern on a stalk that sways over her face; dim while she sleeps, bright awake, a blaze in the second phase
        const sway = Math.sin(f.t * 1.1) * 0.25 + (wind ? 0.2 * f.p : 0);
        const headY = 118 - (wind ? 36 * f.p : 0) + (strike && leap ? 30 : 0);
        const pts = tentacle([100, headY], 1.35 + sway * 0.3, 118, 9, -1.0 + sway, 0.05, f.t * 1.2);
        stalk.setSpine(pts);
        const lt = pts[8]!;
        place(lantern, lt[0], lt[1] - 12, 0.1 * Math.sin(f.t * 1.7), 1.4, 1.4);
        const lureOn = (0.25 + 0.45 * awake + 0.45 * second + 0.4 * roar) * (dead ? 1 - f.dying : 1);
        lureGlow.position.set(lt[0], -(lt[1] - 2));
        lureGlow.alpha = Math.min(1, lureOn);
        lureGlow.scale.set((110 + 90 * second + 40 * Math.sin(f.t * 3)) / lureGlow.texture.width);
        lantern.alpha = stalk.alpha = dead ? 1 - f.dying : 1;

        // the tongue: a coil in the mouth through the wind-up and a lash across the floor in front of her in the blow
        const mouth: Pt = [SCALE * 48, SCALE * 34];
        const lash = tongueOn ? (wind ? easeIn(f.p) * 0.1 : strike ? Math.sin(Math.min(1, f.p * 1.4) * Math.PI * 0.5) : 0) : 0;
        const reach = 40 + 360 * lash;
        const tpts = tentacle(mouth, -0.12 + 0.18 * lash, reach, 10, wind && tongueOn ? 2.4 * (1 - f.p) : 0.6 * (1 - lash), 0.05 + 0.05 * (1 - lash), f.t * 6);
        tongue.setSpine(tpts);
        tongue.visible = tip.visible = tongueOn && (wind || strike);
        const e = tpts[9]!;
        place(tip, e[0], e[1], 0, 1.4, 1.4);
        // three globs swelling in the cheeks, and out they go
        globs.forEach((g, i) => {
          const sw = spit ? (wind ? easeOut(f.p) : strike ? Math.max(0, 1 - f.p * 1.6) : 0) : 0;
          g.position.set(mouth[0] + 10 + i * 24 - (wind ? 10 : 0), -(mouth[1] - 6 + i * 10 + (strike ? 40 * f.p * (i + 1) : 0)));
          g.alpha = sw * 0.9;
          g.scale.set((18 + 38 * sw) / g.texture.width);
        });
        spores.position.set(0, -80);
        spores.show(f.t, 0, 0, 280, 160, 0.3, (0.1 + 0.7 * second + roar) * awake + (dead ? 0.8 * (1 - f.dying) : 0) + (open > 0.5 ? 0.3 : 0));
        void TAU;
      },
    };
  },
};
