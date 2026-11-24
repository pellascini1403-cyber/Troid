import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE MIRE TOAD (docs/PROMPT24-LOG.md): a squat, wet, warty toad — a big pear of a body, eyes that bulge on top, a wide mouth, hind legs folded in a Z and short arms — with a THROAT SAC under its chin and a scatter of luminous
 * spots along its back. It hops where it patrols; to leap it crouches, and the crouch is the warning: the body sinks, the hind legs fold tight, the sac swells with air and the spots on its back brighten. The leap is the whole body
 * stretched out behind it; the landing is a splat with a ring that runs along the floor (that is where it hurts). Sitting after the landing, panting, it is open. Dead, it lets the air go.
 */

const RIM = PALETTE.violetCore;
const WET = PALETTE.violetGlow;
const HALO = PALETTE.violetCore;
const BELLY = mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.55);

const BODY_Y = 36;
const TORSO: readonly Pt[] = [[-45, -6], [-41, 10], [-27, 22], [-4, 27], [18, 26], [36, 17], [47, 3], [41, -11], [24, -22], [0, -25], [-26, -22], [-43, -15]];
const JAW: readonly Pt[] = [[0, 0], [15, -1.5], [23, -7], [13, -11.5], [0, -9]];
const WARTS: ReadonlyArray<readonly [number, number, number]> = [[-34, 10, 5.5], [-21, 20, 6.5], [-6, 24, 6], [10, 22, 5.5], [-38, -4, 4.5], [3, 14, 3.8]];

export const MIRE_TOAD_RIG: RigDef = {
  id: 'mire_toad',
  width: 1.2,
  height: 0.9,
  shadow: 130,
  aura: { color: HALO, at: [0, 38], size: 210, base: 0.03 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('mire-toad');
    const body = k.group('body');
    const skin = ink(RIM, { gloss: lens([-14, 12], 14, 4.2, -0.12, mix(WET, PALETTE.violetCore, 0.55), 0.22) });
    const limb = ink(RIM, { width: 1.8 });
    const farLimb = ink(mix(RIM, PALETTE.enemyInk, 0.55), { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.22), width: 1.3 });

    // ------------------------------------------------------------------------------------------ legs
    const hindFoot = (pen: import('../kit/paint').Pen, l2: number): void => {
      // a long webbed foot: three toes fanned out
      pen.hard([[l2 - 2, 3], [l2 + 15, 1], [l2 + 17, -2.5], [l2 + 5, -4], [l2 - 2, -3]]).fill(BELLY);
      pen.line([l2 + 3, 0], [l2 + 16, 1.5]).stroke(RIM, 0.9, 0.7);
    };
    const handFoot = (pen: import('../kit/paint').Pen, l2: number): void => {
      pen.hard([[l2 - 1, 2.4], [l2 + 7, 0.5], [l2 + 8, -2.4], [l2 - 1, -2.4]]).fill(BELLY);
    };
    const hindFar = new Leg(k, 'hind-far', { l1: 29, l2: 33, w0: 20, w1: 10, w2: 5, mat: farLimb, foot: hindFoot });
    const hindNear = new Leg(k, 'hind-near', { l1: 30, l2: 34, w0: 23, w1: 11, w2: 5.5, mat: limb, foot: hindFoot });
    const armFar = new Leg(k, 'arm-far', { l1: 14, l2: 16, w0: 8, w1: 6, w2: 4, mat: farLimb, foot: handFoot });
    const armNear = new Leg(k, 'arm-near', { l1: 15, l2: 17, w0: 9, w1: 6.5, w2: 4.2, mat: limb, foot: handFoot });

    // ------------------------------------------------------------------------------------------ body
    const torso = k.part('torso', (pen) =>
      pen.shape(TORSO, skin, {}, (p) => {
        // the pale underside, from the chin back along the belly
        p.contour([[47, 3], [38, -11], [22, -21], [0, -24], [-24, -21], [-40, -13], [-30, -15], [-4, -17], [22, -14], [38, -3]], { closed: true }).fill(BELLY, 0.75);
        // the line of the mouth runs back from the snout past the cheek
        p.contour([[46, 1.5], [36, 3.5], [24, 2], [16, -1]], { closed: false }).stroke(PALETTE.enemyInk, 1.8, 0.95);
      }),
    );
    const warts = k.part('warts', (pen) => {
      for (const [x, y, r] of WARTS) {
        pen.ellipse(x, y, r, r * 0.8).fill(mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.3));
        pen.ellipse(x - r * 0.25, y + r * 0.25, r * 0.5, r * 0.28).fill(WET, 0.35);
      }
    });
    const spots = WARTS.map(([x, y]) => {
      const g = k.glow(WET, 9, 0);
      g.position.set(x, -y);
      return g;
    });
    const jaw = k.part('jaw', (pen) => pen.shape(JAW, ink(RIM, { width: 1.4 }), {}, (p) => p.contour([[1, -1], [14, -2.5], [21, -7]], { closed: false }).stroke(WET, 0.8, 0.5)));
    const sac = k.part('sac', (pen) => pen.shape([[-9, 0], [-6, 8], [2, 10], [9, 5], [10, -3], [4, -9], [-4, -9]], { fill: mix(PALETTE.violetDeep, PALETTE.violetGlow, 0.38), ramp: 'sphere', alpha: 0.95, rims: [{ color: PALETTE.whiteHot, width: 1.6, power: 1.5, alpha: 0.75 }], gloss: lens([-2, 3], 4, 2, -0.3, PALETTE.whiteHot, 0.45) }));
    const eyeBulb = (key: string, far: boolean) => k.part(key, (pen) => pen.shape([[-7, 0], [-5.5, 6], [0, 8], [6, 5.5], [7.5, 0], [4, -4], [-4, -4]], ink(far ? mix(RIM, PALETTE.enemyInk, 0.5) : RIM, { gloss: lens([-2, 3], 3.6, 1.6, -0.3, WET, 0.3) })));
    const bulbFar = eyeBulb('eye-bulb-far', true);
    const bulbNear = eyeBulb('eye-bulb-near', false);
    const iris = (key: string) => k.part(key, (pen) => {
      pen.ellipse(0, 0, 3.7, 3.2).fill(PALETTE.whiteHot);
      pen.ellipse(0.5, 0, 1.2, 3).fill(PALETTE.enemyInk); // a slit pupil
    });
    const irisFar = iris('iris-far');
    const irisNear = iris('iris-near');
    const eyeGlow = k.glow(WET, 30, 0);
    const ring = k.part('shock', (pen) => pen.ellipse(0, 0, 60, 7).stroke(WET, 2.2, 0.9));
    ring.blendMode = 'add';

    body.addChild(torso, warts, ...spots, sac, jaw, bulbFar, irisFar, bulbNear, irisNear, eyeGlow);
    root.addChild(hindFar.root, armFar.root, ring, body, hindNear.root, armNear.root);
    place(sac, 31, -13);
    place(jaw, 27, -5.5);
    place(bulbFar, 22, 25, 0.1, 0.85);
    place(irisFar, 23.5, 28.5, 0, 0.85);
    place(bulbNear, 32, 23, -0.05);
    place(irisNear, 34, 26.5);
    eyeGlow.position.set(33, -27);

    // ------------------------------------------------------------------------------------------ motion
    let hop = k.seed * 2;
    let squat = 0;
    let swell = 0;
    let lift = 0;
    let glowSpots = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const crouch = f.anim === 'telegraph';
        const leap = f.anim === 'attack';
        const land = f.anim === 'land';
        const moving = Math.abs(f.vx) > 0.3 && f.anim === 'walk';

        const wantSquat = crouch ? 0.45 + 0.55 * easeIn(f.p) : land ? 0.9 - 0.3 * easeOut(f.p) : f.phase === 'recovery' ? 0.25 + 0.05 * Math.sin(f.t * 9) : dead ? 1 : 0;
        squat = dt > 0 ? damp(squat, wantSquat, crouch ? 8 : 16, dt) : squat;
        const wantSwell = crouch ? easeOut(f.p) : leap ? 1 - f.p * 0.6 : f.phase === 'recovery' ? 0.45 + 0.2 * Math.sin(f.t * 8) : f.anim === 'alert' ? 0.45 : land ? 0.25 : 0.12 + 0.1 * Math.sin(f.t * 2.4);
        swell = dt > 0 ? damp(swell, dead ? 0 : wantSwell, 10, dt) : swell;
        const wantLift = f.anim === 'alert' ? 1 : 0;
        lift = dt > 0 ? damp(lift, wantLift, 12, dt) : lift;
        glowSpots = dt > 0 ? damp(glowSpots, dead ? 0 : crouch ? 0.4 + 0.6 * f.p : leap ? 1 : f.phase === 'recovery' ? 0.3 : 0.28 + 0.14 * Math.sin(f.t * 1.7), 10, dt) : glowSpots;

        // a hop is a little arc each beat; a leap follows the real arc (its vertical speed), and the toad points along it
        if (moving) hop += dt * 1.7;
        const arc = moving ? Math.sin((hop % 1) * Math.PI) : 0;
        const air = leap ? Math.max(-1, Math.min(1, f.vy / 7)) : arc * 0.6;
        const by = BODY_Y - 18 * squat + (moving ? 9 * arc : 0) + (leap ? 6 : 0) - (dead ? 6 * f.dying : 0);
        const sx = 1 + 0.2 * squat + (leap ? -0.1 : 0) + (dead ? 0.35 * f.dying : 0) + 0.04 * f.hurt;
        const sy = 1 - 0.36 * squat + (leap ? 0.12 : 0) + 0.02 * Math.sin(f.t * 2.4) - (dead ? 0.5 * easeOut(f.dying) : 0) - 0.08 * f.hurt;
        const shake = crouch ? Math.sin(f.t * 55) * 0.7 * f.p : 0;
        place(body, shake - 4 * f.hurt, by, (leap ? 0.5 * air : 0) + (moving ? 0.1 * (0.5 - arc) : 0) + 0.12 * lift - 0.12 * squat + 0.25 * f.hurt, sx, sy);

        // the hind legs: folded in a Z at rest, tight when it crouches, flung out behind it in the leap, splayed on landing
        const hipX = -24;
        const hipH = by - 4;
        const fold = leap ? -1 : land ? 0.4 : squat;
        const hx = leap ? -58 : -4 + 12 * squat + (land ? -8 : 0);
        const hy = leap ? -hipH + 14 + 14 * Math.max(0, air) : -hipH + (moving ? 12 * arc : 0);
        hindNear.root.position.set(hipX, -hipH);
        hindFar.root.position.set(hipX - 5, -hipH + 2);
        hindNear.reach(hx, hy, fold < 0 ? 1 : 1);
        hindFar.reach(hx - 8 + (land ? -10 : 0), hy + (leap ? 4 : 0), 1);
        // the arms: down at rest, forward and up in the leap, braced on landing
        const armH = by - 6;
        armNear.root.position.set(24, -armH);
        armFar.root.position.set(19, -armH + 1);
        const ax = leap ? 24 : land ? 16 : 7;
        const ay = leap ? -armH + 30 : -armH + (moving ? 8 * arc : 0);
        armNear.reach(ax, ay, -1);
        armFar.reach(ax - 7, ay + (leap ? 3 : 0), -1);

        // the throat sac: a breath at rest, swollen when it crouches
        const sacScale = 0.22 + 0.95 * swell;
        place(sac, 33, -15 - 3 * swell, 0, sacScale * 1.3, sacScale * 1.3);
        sac.alpha = 0.5 + 0.5 * swell;
        // the jaw: shut, wide in the leap, a little open to pant
        const gape = leap ? 0.55 : crouch ? 0.12 + 0.1 * f.p : land ? 0.3 : f.phase === 'recovery' ? 0.16 + 0.1 * Math.sin(f.t * 9) : 0.02;
        place(jaw, 27, -5.5, -gape);
        // the eyes bulge with the warning and shut in pain
        const blink = Math.sin(f.t * 0.9 + k.seed * 6) > 0.985 ? 0.15 : 1;
        const open = dead ? 0.15 : Math.min(blink, 1 - 0.85 * f.hurt);
        const bulge = 1 + 0.28 * f.heat;
        place(bulbFar, 22, 25 + 2 * lift, 0.1, 0.85 * bulge, 0.85 * bulge);
        place(bulbNear, 32, 23 + 2 * lift, -0.05, bulge, bulge);
        place(irisFar, 23.5, 28.5 + 2 * lift, 0, 0.85 * bulge, 0.85 * bulge * Math.max(0.06, open));
        place(irisNear, 34, 26.5 + 2 * lift, 0, bulge, bulge * Math.max(0.06, open));
        eyeGlow.alpha = Math.min(1, (0.1 + 0.9 * f.heat) * open) * (dead ? 0 : 1);
        eyeGlow.scale.set((24 + 24 * f.heat) / eyeGlow.texture.width);
        spots.forEach((g, i) => {
          g.alpha = glowSpots * (0.65 + 0.35 * Math.sin(f.t * 3.1 + i * 1.9));
          g.scale.set((7 + 9 * glowSpots) / g.texture.width);
        });

        // the shock: a ring that runs out along the floor from where it lands, as far as it hurts
        const shock = land ? easeOut(f.p) : 0;
        ring.visible = land && f.p < 0.98;
        if (ring.visible) {
          ring.alpha = (1 - shock) * 0.95;
          place(ring, 0, 3, 0, 0.35 + shock * 3.4, 0.5 + shock * 0.6);
        }
      },
    };
  },
};
