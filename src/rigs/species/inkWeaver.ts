import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix } from '../kit/geometry';
import { Leg, Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE INK WEAVER (docs/PROMPT24-LOG.md): a tall spider of ink that does not fight but makes things that do. Six long, jointed legs hold a small body high above the floor: a bulb of an abdomen with a glowing spinneret, a head with a
 * cluster of six eyes, and two short forelegs held up in front like a weaver's hands. It keeps its distance, backing away on stilts; and the WEAVING is drawn: the hands rise, the abdomen glows, and the forelegs trace a ring of violet
 * thread on the floor in front of it, a little more of it every moment, a spark running ahead along the thread — when the ring is closed, what it was making stands in it. Dead, the legs fold and the abdomen bursts into thread.
 */

const RIM = PALETTE.violetCore;
const THREAD = PALETTE.violetGlow;
const RING_X = 150; // where the thing it weaves stands, cm in front of it
const HIP_Y = 84;

export const INK_WEAVER_RIG: RigDef = {
  id: 'ink_weaver',
  width: 1.0,
  height: 1.6,
  shadow: 100,
  aura: { color: RIM, at: [0, 100], size: 190, base: 0.02 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('ink-weaver');
    const body = k.group('body');
    const limb = ink(RIM, { width: 1.3 });
    const farLimb = ink(mix(RIM, PALETTE.enemyInk, 0.55), { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.22), width: 1 });
    const tip = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 1.3], [l2 + 9, 0], [l2 - 1, -1.3]]).fill(PALETTE.enemyInk);
    };
    const legs = [0, 1, 2, 3, 4, 5].map((i) => new Leg(k, `leg${i}`, { l1: 38, l2: 52, w0: 5.4, w1: 4, w2: 2, mat: i < 3 ? farLimb : limb, foot: tip }));
    const hands = [0, 1].map((i) => new Leg(k, `hand${i}`, { l1: 22, l2: 26, w0: 4.2, w1: 3.2, w2: 1.6, mat: i ? limb : farLimb, foot: (pen, l2) => pen.hard([[l2 - 1, 1.2], [l2 + 12, 0], [l2 - 1, -1.2]]).fill(THREAD, 0.9) }));

    const abdomen = k.part('abdomen', (pen) =>
      pen.shape([[0, 4], [-12, 16], [-34, 18], [-48, 6], [-46, -12], [-30, -26], [-10, -24], [2, -10]], ink(RIM, { gloss: lens([-26, 4], 12, 3.6, -0.3, PALETTE.violetGlow, 0.26) }), { round: 1.1 }, (p) => {
        // a mark on the back, the hourglass of a thing that bites
        p.hard([[-28, 8], [-22, 0], [-28, -8], [-34, 0]]).fill(THREAD, 0.4);
        p.contour([[-8, 8], [-24, 12], [-40, 4]], { closed: false }).stroke(PALETTE.violetDeep, 1.6, 0.7);
      }),
    );
    const spinneret = k.part('spinneret', (pen) => pen.shape([[0, 4], [8, 0], [14, -8], [4, -6], [-2, -2]], ink(RIM, { width: 1.2 }), { sharp: [2] }));
    const thorax = k.part('thorax', (pen) => pen.shape([[-12, 0], [-9, 11], [4, 15], [16, 10], [18, -2], [8, -11], [-6, -10]], ink(RIM, { gloss: lens([-2, 6], 5, 2, -0.3, PALETTE.violetGlow, 0.28) }), { round: 1 }));
    const head = k.part('head', (pen) => pen.shape([[-8, -1], [-6, 8], [4, 11], [13, 5], [14, -4], [5, -9], [-3, -8]], ink(RIM, { gloss: lens([0, 5], 3.4, 1.6, -0.3, PALETTE.violetGlow, 0.26) }), { round: 1 }));
    const fangs = [0, 1].map((i) => k.part(`fang${i}`, (pen) => pen.hard([[0, 0], [2.6, -1], [4, -10 - i * 2], [-0.4, -2]]).fill(PALETTE.whiteHot)));
    const eyes = k.part('eyes', (pen) => {
      for (const [x, y, r] of [[4, 5, 2.2], [9, 4.4, 1.9], [11.6, -0.4, 1.7], [-1, 3.4, 1.5], [6, 0, 1.6], [2, -2.6, 1.3]] as const) pen.circle(x, y, r).fill(PALETTE.whiteHot);
    });
    const eyeGlow = k.glow(THREAD, 36, 0);
    const abGlow = k.glow(THREAD, 60, 0);
    const spark = k.glow(PALETTE.whiteHot, 28, 0);
    const spool = new Motes(k, 12, THREAD, 8, 0.2);

    // the thread: a ring on the floor in front of it that is drawn a little more every moment; and the line from the hand to the point where it is being drawn
    const ringArcs = Array.from({ length: 12 }, (_, i) => k.part(`arc${i}`, (pen) => pen.arc(0, 0, 1, (i / 12) * TAU, ((i + 1.15) / 12) * TAU).stroke(THREAD, 0.05, 1)));
    for (const a of ringArcs) a.blendMode = 'add';
    const line = k.ribbon({ n: 4, width: () => 1.6, color: THREAD, ramp: 'flat', alpha: 0.9 }, 'thread');
    line.blendMode = 'add';

    body.addChild(abdomen, spinneret, thorax, head, ...fangs, eyes, eyeGlow, abGlow);
    root.addChild(legs[0]!.root, legs[1]!.root, legs[2]!.root, hands[0]!.root, body, legs[3]!.root, legs[4]!.root, legs[5]!.root, hands[1]!.root, ...ringArcs, line, spark, spool);
    place(abdomen, -2, 0);
    place(thorax, 8, 0);
    place(head, 24, 6);
    place(eyes, 27, 7);
    fangs.forEach((f, i) => place(f, 31 + i * 3, 1 - i * 2, -0.2));
    eyeGlow.position.set(33, -9);
    abGlow.position.set(-26, 6);

    let walk = k.seed * 3;
    let weave = 0;
    let raise = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const weaving = f.anim === 'telegraph';
        const spent = f.phase === 'recovery';
        const moving = Math.abs(f.vx) > 0.25 && !weaving && !dead;

        weave = dt > 0 ? damp(weave, weaving ? easeOut(f.p) : 0, 12, dt) : weave;
        raise = dt > 0 ? damp(raise, weaving ? 1 : f.anim === 'alert' ? 0.7 : spent ? 0.25 : 0.12, 9, dt) : raise;
        if (moving) walk += dt * (0.55 + Math.abs(f.vx) * 0.45) * Math.sign(f.vx || 1);

        // the body rides high; it sinks as the legs fold, bobs as it steps, and the abdomen breathes
        const bob = moving ? 3 * Math.abs(Math.sin(walk * Math.PI)) : 1.4 * Math.sin(f.t * 1.6);
        const hy = HIP_Y + bob - (spent ? 4 : 0) - (dead ? 50 * easeIn(f.dying) : 0) - (weaving ? 5 * f.p : 0);
        place(body, -3 * f.hurt, hy, 0.18 * f.hurt - (weaving ? 0.08 * f.p : 0) + (dead ? 0.5 * f.dying : 0));
        place(abdomen, -2, 0, -0.1 + 0.05 * Math.sin(f.t * 1.5) + 0.2 * weave, 1 + 0.06 * Math.sin(f.t * 1.5) + 0.22 * weave, 1 + 0.06 * Math.sin(f.t * 1.5) + 0.22 * weave);
        place(spinneret, -44, -8, -0.9, 1 + 0.4 * weave, 1);
        place(head, 24, 6 + 2 * (weaving ? f.p : 0), (weaving ? -0.2 * f.p : 0) + (f.anim === 'alert' ? 0.2 * (1 - f.p) : 0));

        // six legs: three out of step with the other three, in long strides; folding under it when it dies
        const hips = [-6, 6, 18] as const;
        legs.forEach((leg, i) => {
          const far = i < 3;
          const c = footCycle(walk + (i % 2 ? 0 : 0.5) + (far ? 0.25 : 0), 26, 12);
          const hipH = hy - 4;
          leg.root.position.set(hips[i % 3]! + (far ? -3 : 0), -hipH);
          const spread = [-34, 8, 44][i % 3]!;
          leg.reach(spread + (far ? -6 : 6) + (moving ? c.x : 0) + (dead ? -spread * 0.6 * f.dying : 0), -hipH + 2 + (moving ? c.y : 0) + (dead ? 46 * easeOut(f.dying) : 0) + (spent ? 3 : 0), i % 3 === 0 ? -1 : 1);
        });

        // the hands: held up, and, through the weave, tracing the ring on the floor in front of it
        const ringR = 46;
        const drawn = weaving ? Math.min(1, f.p * 1.05) : 0;
        const a = -Math.PI / 2 - drawn * TAU;
        const px = RING_X + Math.cos(a) * ringR;
        const py = 2 + Math.sin(a) * ringR * 0.16;
        hands.forEach((h, i) => {
          const far = i === 0;
          const sx = 22 - (far ? 3 : 0);
          h.root.position.set(sx, -(hy + 4));
          let tx = 40 + 8 * raise + (far ? -4 : 0);
          let ty = 6 + 22 * raise + 3 * Math.sin(f.t * 2.2 + i);
          if (weaving) {
            // one hand follows the ring, the other keeps the thread
            const k2 = far ? 0.55 : 1;
            tx = (px - sx) * k2 + 10 * (1 - k2);
            ty = (py - (hy + 4)) * k2 + (-12) * (1 - k2);
          }
          if (dead) {
            tx = 16 + 8 * f.dying;
            ty = -20 * f.dying;
          }
          h.reach(tx, ty, far ? 1 : -1);
        });
        // the thread, drawn so far (the arcs appear one after the other), the spark at its end, the line up to the hand
        const n = Math.floor(drawn * 12 + 0.0001);
        ringArcs.forEach((arc, i) => {
          arc.visible = weaving && i < n + 1;
          if (arc.visible) {
            place(arc, RING_X, 2, 0, ringR, ringR * 0.16);
            arc.alpha = i < n ? 0.9 : drawn * 12 - n;
          }
        });
        spark.visible = weaving && drawn < 1;
        spark.position.set(px, -py);
        spark.alpha = weaving ? 0.9 : 0;
        spark.scale.set((22 + 8 * Math.sin(f.t * 30)) / spark.texture.width);
        line.visible = weaving;
        if (weaving) {
          const hx = 22 + 40;
          line.setSpine([[hx, hy + 20], [(hx + px) / 2, (hy + 20 + py) / 2 + 10], [(hx + px * 3) / 4, py + 20], [px, py]]);
          line.alpha = 0.9 * weave;
        }
        // the abdomen glows with the work, and the eyes
        abGlow.alpha = Math.min(1, weave * 0.9 + 0.06) * (dead ? 0 : 1);
        abGlow.scale.set((50 + 36 * weave) / abGlow.texture.width);
        const open = dead ? 0.1 : 1 - 0.85 * f.hurt;
        eyes.scale.set(1 + 0.25 * f.heat, Math.max(0.1, open));
        eyeGlow.alpha = Math.min(1, (0.12 + 0.88 * f.heat) * open) * (dead ? 0 : 1);
        eyeGlow.scale.set((28 + 26 * f.heat) / eyeGlow.texture.width);
        spool.position.set(-30, -(hy + 2));
        spool.show(f.t, 0, 0, 60, 50, 0.6, dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.5 : weaving ? 0.5 * f.p : 0);
      },
    };
  },
};
