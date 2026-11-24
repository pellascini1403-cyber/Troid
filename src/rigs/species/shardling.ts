import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { solid } from '../kit/materials';
import { easeInOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE SHARDLING (docs/PROMPT24-LOG.md): a crystal armadillo — a pointed snout with a crystal horn, a back of six overlapping faceted bands, short crystal legs and a spike for a tail, a violet light inside it that shows at the seams.
 * Its whole defence is the curl, and the curl is its whole warning: through the telegraph the body BENDS — the bands slide round a circle, the snout and the tail meet underneath, the legs fold away — until it is a ball of overlapping
 * facets; the roll is that ball turning with the ground it covers, glints orbiting it; and uncurled again it is soft and open: the bands fan, the belly shows and the light inside goes dim. Dead, it breaks into its own shards.
 */

const CRYSTAL = mix(PALETTE.worldHaze, PALETTE.worldGlow, 0.3);
const DEEP = mix(PALETTE.worldSlate, PALETTE.violetDeep, 0.4);
const RIM = PALETTE.whiteHot;
const CORE = PALETTE.violetGlow;
const N = 6;
const R = 37; // the radius of the ball, cm
const LEN = 92; // the length of the back, snout to tail, cm
const BAND: readonly Pt[] = [[-10, -19], [-13, 4], [-6, 19], [9, 24], [15, 6], [12, -14], [0, -21]];
const HEAD: readonly Pt[] = [[-9, -6], [-10, 6], [0, 12], [14, 8], [30, -1], [14, -9], [0, -11]];

export const SHARDLING_RIG: RigDef = {
  id: 'shardling',
  width: 1.2,
  height: 0.9,
  shadow: 120,
  aura: { color: PALETTE.violetGlow, at: [0, 36], size: 190, base: 0.04 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('shardling');
    const body = k.group('body');
    const facet = solid(CRYSTAL, RIM, { ramp: 'vert', edge: mix(PALETTE.worldSlate, PALETTE.enemyInk, 0.6), width: 2.4 });
    const farFacet = solid(mix(CRYSTAL, PALETTE.worldSlate, 0.55), mix(RIM, PALETTE.worldSlate, 0.5), { ramp: 'vert', edge: PALETTE.enemyInk, width: 1.4 });

    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 3], [l2 + 7, 0], [l2 - 1, -3]]).fill(mix(CRYSTAL, PALETTE.worldSlate, 0.3));
    };
    const legs = [0, 1, 2, 3].map((i) => new Leg(k, `leg${i}`, { l1: 11, l2: 12, w0: 8, w1: 6, w2: 4, mat: i < 2 ? farFacet : facet, foot }));
    const belly = k.part('belly', (pen) => pen.shape([[-38, 0], [-40, 12], [-18, 24], [14, 24], [38, 10], [40, 0]], solid(mix(CRYSTAL, PALETTE.violetGlow, 0.25), RIM, { ramp: 'sphere', edge: DEEP, width: 1 }), { round: 0.9 }));
    const bands = Array.from({ length: N }, (_, i) =>
      k.part(`band${i}`, (pen) =>
        pen.shape(BAND, facet, { round: 0.25 }, (p) => {
          // the facets: a lighter wedge, a dark one, and the seam where the light inside leaks out
          p.hard([[-12, -2], [-6, 18], [3, 4]]).fill(RIM, 0.28);
          p.hard([[6, 22], [14, 6], [4, -8]]).fill(DEEP, 0.35);
          p.line([-10, -17], [-12, 3]).stroke(CORE, 1.4, 0.85);
        }),
      ),
    );
    const head = k.part('head', (pen) =>
      pen.shape(HEAD, facet, { sharp: [4] }, (p) => {
        p.hard([[-4, 6], [6, 10], [14, 5], [4, 0]]).fill(RIM, 0.3);
        // the horn: a long thin crystal on the snout
        p.hard([[14, 7], [30, 26], [20, 6]]).fill(mix(CRYSTAL, RIM, 0.5));
        p.hard([[14, 7], [30, 26], [18, 10]]).fill(RIM, 0.45);
      }),
    );
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 2.6, 3.2).fill(PALETTE.enemyInk);
      pen.ellipse(0.8, 1, 1.1, 1.3).fill(PALETTE.whiteHot);
    });
    const tail = k.part('tail', (pen) => pen.shape([[0, 6], [18, 2], [38, -4], [16, -6], [0, -6]], facet, { sharp: [2] }, (p) => p.hard([[2, 4], [24, 0], [10, -2]]).fill(RIM, 0.3)));
    const ballCore = k.part('ball-core', (pen) => pen.shape([[-31, 0], [-22, 22], [0, 31], [22, 22], [31, 0], [22, -22], [0, -31], [-22, -22]], solid(mix(CRYSTAL, PALETTE.worldSlate, 0.35), RIM, { ramp: 'sphere', edge: DEEP, width: 1.6 }), { round: 1 }));
    const core = k.glow(CORE, 80, 0);
    const glints = new Motes(k, 8, PALETTE.whiteHot, 9, 0.5);
    const shards = [0, 1, 2, 3, 4].map((i) => k.part(`shard${i}`, (pen) => pen.shape([[0, 0], [6 + i, 4], [3, 14 + i * 2], [-4, 6]], facet, { sharp: [0, 1, 2, 3], round: 0 })));
    for (const s of shards) s.visible = false;

    body.addChild(belly, ballCore, ...bands, head, eye, tail, core, glints, ...shards);
    root.addChild(legs[0]!.root, legs[1]!.root, body, legs[2]!.root, legs[3]!.root);

    let walk = k.seed * 3;
    let curl = 0;
    let roll = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const curling = f.anim === 'telegraph';
        const rolling = f.anim === 'attack';
        const spent = f.phase === 'recovery';
        const moving = Math.abs(f.vx) > 0.25 && !curling && !rolling && !dead;

        // how curled it is: closing through the telegraph, shut in the roll, opening slowly after it
        const want = curling ? easeInOut(Math.min(1, f.p * 1.1)) : rolling ? 1 : spent ? 1 - easeInOut(Math.min(1, f.p * 1.4)) : dead ? 1 : 0;
        curl = dt > 0 ? damp(curl, want, curling ? 10 : rolling ? 30 : 7, dt) : curl;
        if (rolling || (curl > 0.9 && !spent)) roll -= dt * ((rolling ? Math.max(3, Math.abs(f.vx)) : Math.abs(f.vx)) / (R / 100)) * 0.6;
        else roll = dt > 0 ? damp(roll, Math.round(roll / TAU) * TAU, 8, dt) : roll;
        if (moving) walk += dt * (0.7 + Math.abs(f.vx) * 0.6);

        // the spine is a path: along the ground when it walks, round a circle when it is curled; each band sits on it
        const cx = 0;
        const cy = R + 2;
        const stepBob = moving ? 1.6 * Math.abs(Math.sin(walk * TAU)) : 0.8 * Math.sin(f.t * 1.8);
        const straightY = 38 + stepBob - 6 * (spent ? 1 - f.p : 0);
        const bandAt = (u: number): { x: number; y: number; a: number } => {
          // straight: from the tail (u = 0) to the snout (u = 1) along a gentle arch
          const sx = -LEN / 2 + 0.78 * LEN * u;
          const sy = straightY + 8 * Math.sin(u * Math.PI) - 4;
          const sa = -0.55 * Math.cos(u * Math.PI) * 0.25;
          // curled: round the circle, the tail at the bottom-back and the snout tucked in front-below
          const ang = Math.PI * 1.15 - u * Math.PI * 2 * 0.86;
          const kx = cx + Math.cos(ang) * R * 0.92;
          const ky = cy + Math.sin(ang) * R * 0.92;
          const ka = ang + Math.PI / 2;
          return { x: sx + (kx - sx) * curl, y: sy + (ky - sy) * curl, a: sa + (ka - sa) * curl };
        };
        const rot = roll;
        const sin = Math.sin(rot);
        const cos = Math.cos(rot);
        const spin = (x: number, y: number): [number, number] => [cx + (x - cx) * cos - (y - cy) * sin, cy + (x - cx) * sin + (y - cy) * cos];
        const turned = curl > 0.98 ? 1 : curl;
        bands.forEach((b, i) => {
          const u = (i + 0.5) / N;
          const p = bandAt(u);
          const [x, y] = turned > 0.5 ? spin(p.x, p.y) : [p.x, p.y];
          const fan = spent ? 5 * (1 - curl) * (i - 2.5) : 0;
          place(b, x + fan, y, p.a + (turned > 0.5 ? rot : 0) + (spent ? 0.04 * Math.sin(f.t * 8 + i) : 0), 0.95 + 0.1 * (i === 2 || i === 3 ? 1 : 0) + 0.5 * curl, 1 - 0.18 * curl);
          b.alpha = 1;
        });
        place(ballCore, 0, cy * curl + (straightY - 24) * (1 - curl), roll, 1, 1);
        ballCore.alpha = Math.max(0, curl * 1.4 - 0.4) * (dead ? 0 : 1);
        // the belly folds up inside the ball
        place(belly, 0, straightY - 24 * curl, 0, 1 - 0.7 * curl, 1 - 0.6 * curl);
        belly.alpha = 1 - curl * 0.9;
        // head and tail: the snout tucks in behind the bands, the tail comes round to meet it
        const hp = bandAt(1);
        const tp = bandAt(0);
        const [hx, hy] = turned > 0.5 ? spin(hp.x, hp.y) : [hp.x, hp.y];
        const [tx, ty] = turned > 0.5 ? spin(tp.x, tp.y) : [tp.x, tp.y];
        const headDown = -0.1 + 0.4 * (f.anim === 'alert' ? 1 - f.p : 0) * -1 - 1.4 * curl;
        place(head, hx - 6 * (1 - curl) + 10, hy - 2 + 5 * (f.anim === 'alert' ? 1 - f.p : 0), headDown + (turned > 0.5 ? rot : 0) + (spent ? -0.25 * Math.sin(f.t * 5) * 0.2 : 0));
        place(eye, hx - 2 + 14 * (1 - curl), hy + 5 * (1 - curl) + 2, 0, 1, Math.max(0.1, 1 - 0.85 * f.hurt));
        eye.alpha = 1 - curl;
        place(tail, tx - 4, ty - 2, 0.35 - 2.2 * curl + (turned > 0.5 ? rot : 0), 1 - 0.3 * curl, 1);
        head.alpha = 1 - 0.15 * curl;

        // the legs: short scuttling steps, folded away as it curls
        const legShow = Math.max(0, 1 - curl * 1.8);
        const hips = [-26, 22, -20, 28] as const;
        legs.forEach((leg, i) => {
          const c = footCycle(walk + (i % 2 ? 0.5 : 0) + (i < 2 ? 0.25 : 0), 10, 6);
          const hipH = straightY - 14;
          leg.root.position.set(hips[i]!, -hipH);
          leg.root.visible = legShow > 0.05;
          leg.reach(2 + (moving ? c.x : 0) - 4 * (1 - legShow), -hipH + 4 + (moving ? c.y : 0) + 6 * (1 - legShow), i % 2 ? 1 : -1);
          leg.root.alpha = legShow;
        });

        // the light inside: dim and quiet at rest, white through the curl, a ring of glints round the ball when it rolls, soft when it is spent
        core.position.set(0, -(cy * curl + (straightY - 6) * (1 - curl)));
        core.alpha = Math.min(1, 0.18 + 0.85 * f.heat + (spent ? 0.1 : 0)) * (dead ? 1 - f.dying : 1);
        core.scale.set((60 + 70 * f.heat) / core.texture.width);
        glints.position.set(0, -cy);
        glints.show(f.t, 0, 0, 90, 90, 1.4, rolling ? 0.9 : curling ? 0.6 * f.p : 0);

        // dead: it breaks along its seams
        shards.forEach((s, i) => {
          s.visible = dead && f.dying > 0.08;
          if (s.visible) {
            const a = (i / 5) * TAU;
            flung(s, [Math.cos(a) * 14, cy + Math.sin(a) * 14], [Math.cos(a) * 55, 40 + Math.sin(a) * 30], 3 + i, 170, 2, Math.min(1, (f.dying - 0.08) * 1.5));
            s.alpha = 1 - Math.max(0, (f.dying - 0.7) / 0.3);
          }
        });
        if (dead) {
          const gone = Math.min(1, f.dying * 3);
          for (const b of bands) b.alpha = 1 - gone;
          head.alpha = tail.alpha = 1 - gone;
        } else tail.alpha = 1;
      },
    };
  },
};
