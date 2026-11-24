import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeIn, easeOut, ik2, TAU, tentacle } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE ROOT TYRANT (docs/PROMPT24-LOG.md): a tree that has decided to be a king. A trunk four metres tall with a face cut into its bark — two eyes like wounds, a mouth that is a crack with teeth — standing on a spread of buttress roots
 * that grip the floor, with two long branch-arms that end in root-fingers and a crown of bare antlers. Its HEART is in a hollow in its chest, the sap of it a violet light, and the hollow has DOORS of bark: shut, they are a seam in the
 * trunk and a blow is turned away; open — which is only when it is spent after an attack — they swing wide and the heart beats in the light, and that is the place to strike. The sweep is an arm heaved back and brought round through the
 * air; the eruptions and the march are both arms raised and driven into the floor, the roots under it lighting up along the ground to where the columns will come. Second phase: the bark splits and the light of the sap leaks out of it, the antlers grow.
 * Dead, the trunk splits down the middle and falls in two, the crown after it, and the heart goes out.
 */

const RIM = PALETTE.worldGlow;
const SAP = PALETTE.violetCore;
const GLOW = PALETTE.violetGlow;
const BARK = mix(PALETTE.enemyInk, PALETTE.worldDeep, 0.42);

const TRUNK: readonly Pt[] = [[-84, 34], [-96, 80], [-90, 126], [-104, 170], [-88, 226], [-100, 282], [-70, 330], [-58, 372], [-22, 396], [8, 420], [34, 392], [70, 372], [86, 322], [78, 268], [96, 214], [82, 160], [92, 104], [70, 60], [58, 34], [0, 16]];
const HOLLOW_AT: Pt = [60, 232];

/** A curve from `a` through the bend `b` to `c` as `n` points: the arm of a tree. */
const bend = (a: Pt, b: Pt, c: Pt, n: number): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    out.push([(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * b[1] + u * u * c[1]]);
  }
  return out;
};

export const ROOT_TYRANT_RIG: RigDef = {
  id: 'boss_root_tyrant',
  width: 3,
  height: 4.2,
  shadow: 340,
  aura: { color: SAP, at: [30, 220], size: 520, base: 0.03 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('root-tyrant');
    const body = k.group('body');
    const bark = ink(RIM, { fill: BARK, width: 3, gloss: lens([-30, 250], 9, 70, 0.05, GLOW, 0.1) });

    // ------------------------------------------------------------------------------------------ roots (its legs)
    const roots = k.ribbon({ n: 9, count: 7, width: (u, l) => (46 - 40 * u) * (l % 2 ? 0.8 : 1), color: BARK, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.8 }, rim: { color: RIM, width: 3, alpha: 0.85 } }, 'roots');
    const rootGlow = k.ribbon({ n: 9, count: 7, width: (u) => 3.4 * (1 - u * 0.7), color: SAP, ramp: 'flat', alpha: 0.9 }, 'root-glow');
    rootGlow.blendMode = 'add';

    // ------------------------------------------------------------------------------------------ trunk and face
    const trunk = k.part('trunk', (pen) =>
      pen.shape(TRUNK, bark, { round: 0.8 }, (p) => {
        // the grain of the bark, knots, moss
        for (const [x, y0, y1] of [[-56, 60, 320], [-30, 40, 360], [4, 30, 280], [40, 60, 200], [-72, 120, 260]] as const) {
          p.contour([[x, y0], [x + 6, (y0 + y1) / 2], [x - 4, y1]], { closed: false }).stroke(PALETTE.enemyInk, 2.4, 0.8);
        }
        p.ellipse(-48, 190, 11, 15).stroke(PALETTE.enemyInk, 2.6, 0.9);
        p.ellipse(-40, 120, 8, 10).stroke(PALETTE.enemyInk, 2.2, 0.8);
        p.ellipse(70, 360, 14, 5).fill(mix(PALETTE.worldSlate, PALETTE.worldGlow, 0.2), 0.45);
        // plates of bark standing away from the trunk, and a few stubs of branches that were broken off it
        for (const [x, y, w, h, r] of [[-96, 150, 16, 40, 0.15], [-96, 250, 14, 36, -0.12], [90, 236, 12, 34, 0.1], [88, 130, 12, 30, -0.1]] as const) {
          p.hard([[x, y], [x + (x < 0 ? -w : w), y + h * 0.5], [x + (x < 0 ? -w * 0.4 : w * 0.4), y + h]]).fill(mix(BARK, PALETTE.worldGlow, 0.18));
          void r;
        }
        p.hard([[-92, 300], [-130, 330], [-90, 316]]).fill(BARK);
        p.hard([[-84, 200], [-122, 214], [-86, 218]]).fill(BARK);
        p.hard([[84, 190], [118, 206], [86, 208]]).fill(BARK);
      }),
    );
    const hollow = k.part('hollow', (pen) => {
      pen.ellipse(0, 0, 38, 58).fill(PALETTE.enemyInk);
      pen.ellipse(0, 0, 38, 58).stroke(mix(BARK, SAP, 0.35), 4, 0.95);
    });
    const heart = k.part('heart', (pen) => {
      pen.circle(0, 0, 28).fill(mix(PALETTE.violetDeep, SAP, 0.3));
      pen.circle(0, 0, 21).fill(SAP);
      pen.circle(0, 0, 13).fill(GLOW);
      pen.circle(-4, 5, 5).fill(PALETTE.whiteHot, 0.9);
      for (const a of [0.4, 1.7, 2.9, 4.2, 5.3]) pen.line([Math.cos(a) * 14, Math.sin(a) * 14], [Math.cos(a) * 30, Math.sin(a) * 36]).stroke(GLOW, 1.4, 0.7);
    });
    const door = (side: 1 | -1) =>
      k.part(`door${side}`, (pen) =>
        pen.shape([[0, -58], [side * 36, -50], [side * 42, 0], [side * 36, 50], [0, 58]], ink(RIM, { fill: BARK, width: 2.4 }), { round: 0.5 }, (p) => {
          p.contour([[side * 8, -44], [side * 14, 0], [side * 8, 44]], { closed: false }).stroke(PALETTE.enemyInk, 2.4, 0.85);
          p.contour([[side * 24, -30], [side * 28, 0], [side * 24, 30]], { closed: false }).stroke(PALETTE.enemyInk, 1.8, 0.7);
        }),
      );
    const doorL = door(-1);
    const doorR = door(1);
    const beacon = new Beacon(k, SAP, 230, PALETTE.whiteHot);
    const face = k.part('face', (pen) => {
      // a brow of bark over the eyes, the long nose-ridge, and the cheek-bones
      pen.shape([[-8, 0], [-10, 14], [4, 22], [40, 18], [52, 6], [44, -4], [10, -6]], ink(RIM, { fill: mix(BARK, PALETTE.enemyInk, 0.25), width: 2.4 }), { round: 0.5 });
    });
    const eyes = [0, 1].map((i) => k.part(`eye${i}`, (pen) => {
      pen.shape([[-20, 4], [-2, 14], [18, 6], [4, -9]], { fill: PALETTE.enemyInk, rims: [] }, { round: 0.4 });
      pen.shape([[-16, 3], [-2, 11], [14, 5], [3, -6]], { fill: GLOW, rims: [] }, { round: 0.4 }, (p) => p.ellipse(1, 1, 4.6, 4.6).fill(PALETTE.whiteHot));
    }));
    const eyeGlow = k.glow(GLOW, 130, 0);
    const mouth = k.part('mouth', (pen) => {
      pen.shape([[-24, 0], [-14, -6], [0, -8], [14, -6], [26, 2], [14, 4], [0, 5], [-14, 3]], { fill: PALETTE.enemyInk, rims: [] }, { round: 0.3 });
      for (let i = 0; i < 6; i++) pen.hard([[-20 + i * 8, -4 + (i % 2) * 2], [-16 + i * 8, -4 + (i % 2) * 2], [-18 + i * 8, 4]]).fill(mix(PALETTE.worldGlow, BARK, 0.4));
    });
    const cracksGlow = k.part('cracks', (pen) => {
      for (const pts of [[[-60, 90], [-40, 150], [-70, 210]], [[20, 70], [40, 130], [10, 190]], [[-20, 300], [-40, 350], [-10, 392]], [[70, 150], [60, 200], [80, 260]]] as Pt[][]) {
        pen.contour(pts, { closed: false, round: 0.3 }).stroke(SAP, 5, 0.9);
        pen.contour(pts, { closed: false, round: 0.3 }).stroke(GLOW, 2, 0.95);
      }
    });
    cracksGlow.blendMode = 'add';

    // ------------------------------------------------------------------------------------------ arms, hands, crown
    const arms = k.ribbon({ n: 10, count: 2, width: (u, l) => (l ? 46 : 38) * (1 - u * 0.5), color: BARK, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.8 }, rim: { color: RIM, width: 3, alpha: 0.9 } }, 'arms');
    const fingers = k.ribbon({ n: 5, count: 6, width: (u) => 11 * (1 - u * 0.8) + 1, color: BARK, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.5 }, rim: { color: RIM, width: 1.4, alpha: 0.9 } }, 'fingers');
    const crown = k.ribbon({ n: 6, count: 7, width: (u) => 12 * (1 - u * 0.85) + 1, color: BARK, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.6 }, rim: { color: RIM, width: 1.6, alpha: 0.9 } }, 'crown');
    const crownGlow = k.ribbon({ n: 6, count: 7, width: (u) => 2.4 * (1 - u * 0.5), color: SAP, ramp: 'flat', alpha: 0.9 }, 'crown-glow');
    crownGlow.blendMode = 'add';
    const dust = new Motes(k, 14, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 30, 0.2);
    const leaves = new Motes(k, 12, mix(PALETTE.worldGlow, PALETTE.violetGlow, 0.3), 12, 0.7);
    const halves = [0, 1].map((i) => k.part(`half${i}`, (pen) => pen.shape(i ? [[0, 0], [70, 40], [90, 200], [70, 340], [20, 400], [0, 300]] : [[0, 0], [-80, 40], [-90, 200], [-70, 340], [-20, 400], [0, 300]], bark, { round: 0.4 })));
    for (const h of halves) h.visible = false;

    body.addChild(trunk, hollow, heart, beacon, doorL, doorR, face, ...eyes, eyeGlow, mouth, cracksGlow, crown, crownGlow);
    root.addChild(roots, rootGlow, body, arms, fingers, dust, leaves, ...halves);
    place(hollow, HOLLOW_AT[0], HOLLOW_AT[1]);
    place(heart, HOLLOW_AT[0], HOLLOW_AT[1]);
    place(face, 4, 296, 0, 1.4, 1.4);

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let slam = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const key = f.attackKey ?? '';
        const sweep = key === 'sweep';

        heat = dt > 0 ? damp(heat, (wind ? easeIn(f.p) : strike ? 1 : 0) * (sweep ? 0.3 : 1) + 0.55 * second + roar, 10, dt) : heat;
        slam = dt > 0 ? damp(slam, strike && !sweep ? 1 : 0, 30, dt) : slam;

        // the body: it breathes, leans back to wind up, throws itself forward in the sweep, bows when it is open, falls when it dies
        const breathe = 1 + 0.008 * Math.sin(f.t * 1.4);
        const lean = (wind ? (sweep ? -0.08 : 0.04) * f.p : 0) + (strike ? (sweep ? 0.08 : 0.03) : 0) + (open > 0.5 ? 0.05 * open : 0) - 0.12 * (1 - awake) - (dead ? 0.1 * f.dying : 0) + 0.02 * f.hurt;
        const shake = (roar * 4 + 6 * f.hurt) * Math.sin(f.t * 70) * 0.3 + (wind && !sweep ? Math.sin(f.t * 55) * 1.6 * f.p : 0);
        place(body, shake, -(dead ? 30 * easeOut(f.dying) : 0), -lean, breathe, breathe);
        trunk.alpha = dead ? 1 - Math.min(1, Math.max(0, (f.dying - 0.3) / 0.3)) : 1;

        // the face: asleep, the eyes are dark and the mouth shut; awake, they burn; the second phase burns them white
        const eyeOn = Math.min(1, awake * (0.55 + 0.45 * f.heat) + 0.4 * second + roar) * (dead ? 0 : 1);
        eyes.forEach((e, i) => {
          place(e, 30 + i * 42, 336 - i * 6 + 4 * (1 - awake), i ? -0.26 : -0.08, 1.15 + 0.3 * eyeOn, Math.max(0.1, (1 - 0.8 * f.hurt) * (0.2 + 0.8 * awake)) * (1.15 + 0.3 * f.heat));
          e.alpha = 0.3 + 0.7 * awake;
        });
        eyeGlow.position.set(64, -330);
        eyeGlow.alpha = eyeOn * 0.9;
        eyeGlow.scale.set((100 + 70 * eyeOn) / eyeGlow.texture.width);
        const gape = (wind && sweep ? 0.7 * f.p : 0) + (strike ? 0.5 : 0) + roar * 1 + (open > 0.5 ? 0.25 + 0.1 * Math.sin(f.t * 8) : 0);
        place(mouth, 50, 282 - 6 * gape, 0, 1.5 + 0.2 * gape, 0.7 + 2 * gape);
        cracksGlow.alpha = Math.min(1, 0.04 + 0.95 * Math.max(second * 0.7, roar, heat * 0.5));

        // the hollow and its doors: shut, they are a seam; open, they swing back and the heart beats in the light
        const ang = open;
        place(doorL, HOLLOW_AT[0] - 38 * (1 - 0.0), HOLLOW_AT[1], 0, Math.max(0.12, 1 - 0.88 * ang), 1);
        place(doorR, HOLLOW_AT[0] + 38, HOLLOW_AT[1], 0, Math.max(0.12, 1 - 0.88 * ang), 1);
        // (a door is drawn from its hinge toward the middle: its origin sits at the hinge, and its width is what the swing takes away)
        doorL.scale.x = -Math.max(0.12, 1 - 0.88 * ang);
        doorR.scale.x = -Math.max(0.12, 1 - 0.88 * ang);
        heart.alpha = 0.25 + 0.75 * open;
        place(heart, HOLLOW_AT[0], HOLLOW_AT[1], 0, 1 + 0.12 * Math.sin(f.t * (4 + 6 * open)) * open, 1 + 0.12 * Math.sin(f.t * (4 + 6 * open)) * open);
        beacon.show(f.t, HOLLOW_AT, open, 0.1 * awake + 0.2 * second);

        // the roots: seven buttresses spread across the floor; they lift and grip with the step of the sweep, and light along the ground when the columns are coming
        for (let i = 0; i < 7; i++) {
          const dir = i < 3 ? -1 : 1;
          const base = dir * (14 + (i % 3) * 22) + (i === 3 ? 0 : 0);
          const reach = 90 + (i % 4) * 34;
          const pts: Pt[] = [];
          for (let j = 0; j < 9; j++) {
            const u = j / 8;
            const lift = (1 - u) ** 2 * 44 + (i % 2 ? 5 : 8) * Math.sin(u * TAU * 1.2 + i) * u + (j === 8 ? 0 : 0);
            const clutch = strike && !sweep ? 8 * Math.sin(u * 3 + f.t * 10) : 0;
            pts.push([base + dir * u * reach * (1 - 0.0 * u), 6 + lift * (dead ? 1 + 0.4 * f.dying : 1) + clutch + (wind && i > 3 ? 6 * f.p * Math.sin(u * 3) : 0)]);
          }
          roots.setLine(i, pts);
          rootGlow.setLine(i, pts.map((p) => [p[0], p[1] - 2] as Pt));
        }
        roots.commit();
        rootGlow.commit();
        rootGlow.alpha = Math.min(1, heat * (sweep ? 0.2 : 1) * 0.95 + 0.5 * roar) * (dead ? 0 : 1);

        // the arms: two-bone reaches that follow the attack — a heave back and a sweep through the air; or both raised and driven into the floor
        const shoulders: Pt[] = [[24, 330], [-22, 336]];
        const targets: Pt[] = [[70, 190], [40, 210]];
        for (let a = 0; a < 2; a++) {
          const S = shoulders[a]!;
          let tx = 150 + 14 * Math.sin(f.t * 1.2 + a) - a * 70;
          let ty = 100 + 10 * Math.sin(f.t * 1.5 + a * 2) - 40 * (1 - awake);
          if (wind) {
            if (sweep) {
              tx = -90 + 20 * (1 - easeOut(f.p));
              ty = 400 - 40 * (1 - f.p);
            } else {
              tx = 30 + a * 40;
              ty = 470 + 20 * f.p;
            }
          } else if (strike) {
            if (sweep) {
              const u = easeIn(Math.min(1, f.p * 1.2));
              const th = 2.6 - u * 3.4;
              tx = Math.cos(th) * 250 + 20;
              ty = 280 + Math.sin(th) * 250 - 90 * u;
            } else {
              tx = 70 + a * 90 + 40 * slam;
              ty = 12 + 24 * (1 - slam);
            }
          } else if (open > 0.4) {
            tx = 40 + a * 30;
            ty = 60 + 40 * (1 - open);
          } else if (dead) {
            tx = 80 + 30 * f.dying;
            ty = 40 * (1 - f.dying);
          }
          tx += (roar * 10) * Math.sin(f.t * 40);
          targets[a] = [tx, ty];
          const r = ik2(150, 164, tx - S[0], ty - S[1], a ? 1 : -1);
          const E: Pt = [S[0] + Math.cos(r.a1) * 150, S[1] + Math.sin(r.a1) * 150];
          const H: Pt = [E[0] + Math.cos(r.a2) * 164, E[1] + Math.sin(r.a2) * 164];
          const mid: Pt = [(S[0] + H[0]) / 2 * 0.4 + E[0] * 0.6, (S[1] + H[1]) / 2 * 0.4 + E[1] * 0.6];
          arms.setLine(1 - a, bend(S, mid, H, 10));
          // the fingers of the near hand: six roots that claw
          if (a === 0) {
            const grip = wind || strike || open > 0.5 ? 0.5 : 1 + 0.2 * Math.sin(f.t * 2);
            for (let i = 0; i < 3; i++) fingers.setLine(i, tentacle(H, r.a2 + (i - 1) * 0.5 * grip, 56, 5, 0.9 * (i - 1) * grip, 0.2, f.t * 2 + i));
          } else {
            for (let i = 3; i < 6; i++) fingers.setLine(i, tentacle(H, r.a2 + (i - 4) * 0.5, 50, 5, 0.8 * (i - 4), 0.2, f.t * 2 + i));
          }
        }
        arms.commit();
        fingers.commit();
        arms.alpha = fingers.alpha = dead ? 1 - Math.min(1, f.dying * 1.6) : 1;

        // the crown: seven antlers that sway; they grow with the second phase and the roar, and glow at the tip
        const grow = 1 + 0.45 * second + 0.3 * roar;
        for (let i = 0; i < 7; i++) {
          const a = 0.5 + i * 0.36;
          const pts = tentacle([-10 + i * 14, 392 + (i % 2) * 6], a, (64 + (i % 3) * 22) * grow, 6, (i < 3 ? 0.6 : -0.5) + 0.12 * Math.sin(f.t * 1.2 + i), 0.08, f.t * 1.4 + i);
          crown.setLine(i, pts);
          crownGlow.setLine(i, pts);
        }
        crown.commit();
        crownGlow.commit();
        crown.position.copyFrom(body.position);
        crown.rotation = body.rotation;
        crownGlow.alpha = Math.min(1, 0.1 + 0.7 * second + roar) * (dead ? 0 : 1);

        // dust where the arms land, leaves where the crown shakes; the trunk splits and falls when it dies
        dust.position.set(110, 0);
        dust.show(f.t, 0, 10, 220, 50, 0.5, (strike && !sweep ? 0.8 * slam : 0) + (dead && f.dying > 0.3 ? 0.8 : 0) + roar * 0.4);
        leaves.position.set(10, -380);
        leaves.show(f.t, 0, 0, 200, 120, 0.4, roar * 0.8 + (dead ? 0.9 * Math.min(1, f.dying * 2) : 0.06));
        halves.forEach((h, i) => {
          h.visible = dead && f.dying > 0.3;
          if (h.visible) {
            const u = Math.min(1, (f.dying - 0.3) / 0.7);
            flung(h, [0, 20], [(i ? 1 : -1) * 120, 10], (i ? 1 : -1) * 1.5, 120, 2, u);
            h.alpha = 1 - Math.max(0, (f.dying - 0.75) / 0.25);
          }
        });
      },
    };
  },
};
