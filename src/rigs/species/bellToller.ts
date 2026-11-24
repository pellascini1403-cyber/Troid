import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, solid } from '../kit/materials';
import { easeIn, Spring } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE BELL TOLLER (docs/PROMPT24-LOG.md): a great metal bell that walks on two stubby legs and never goes anywhere. It is a rhythm, and the rhythm is drawn: through the swing the whole bell ROCKS on its feet, a little more each time, the
 * clapper inside it swinging below the rim and out of step; the toll is the last rock, hard, the clapper striking, a ring of sound running out along the floor to each side; then it wobbles itself still. Its eyes sit high on the shoulder,
 * heavy-lidded while it waits and wide when it winds up. Dead, the bell topples, and is struck one last time by the floor.
 */

const METAL = mix(PALETTE.worldMist, PALETTE.worldHaze, 0.25);
const RIM = PALETTE.worldGlow;
const HALO = PALETTE.violetGlow;
const DARK = PALETTE.worldNight;
const HIP_Y = 52;

const BELL: readonly Pt[] = [[-50, 0], [-45, 12], [-35, 44], [-27, 80], [-20, 102], [-11, 116], [0, 121], [11, 116], [20, 102], [27, 80], [35, 44], [45, 12], [50, 0]];

export const BELL_TOLLER_RIG: RigDef = {
  id: 'bell_toller',
  width: 1.2,
  height: 1.8,
  shadow: 130,
  aura: { color: HALO, at: [0, 100], size: 230, base: 0 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('bell-toller');
    const bellG = k.group('bell');

    const metal = solid(METAL, RIM, { ramp: 'cap', edge: DARK, width: 2.4 });
    const limbMat = solid(mix(METAL, DARK, 0.4), mix(RIM, DARK, 0.3), { ramp: 'tube', edge: DARK, width: 1.4 });

    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 5, 7], [l2 + 12, 5], [l2 + 14, -6], [l2 - 5, -7]]).fill(mix(METAL, DARK, 0.45));
    };
    const legBack = new Leg(k, 'leg-back', { l1: 22, l2: 26, w0: 21, w1: 18, w2: 15, mat: limbMat, foot });
    const legFront = new Leg(k, 'leg-front', { l1: 22, l2: 26, w0: 22, w1: 19, w2: 16, mat: limbMat, foot });

    const clapper = k.part('clapper', (pen) => {
      pen.line([0, 30], [0, 0]).stroke(DARK, 3.5, 1);
      pen.shape([[-8, 0], [-9, -9], [0, -14], [9, -9], [8, 0]], solid(mix(METAL, DARK, 0.2), RIM, { ramp: 'sphere', edge: DARK, width: 1.6 }));
    });
    const bell = k.part('bell', (pen) =>
      pen.shape(BELL, { ...metal, gloss: lens([-20, 62], 4.5, 26, 0.06, PALETTE.whiteHot, 0.2) }, { sharp: [] }, (p) => {
        // the bands cast round the skirt and the shoulder, the lip, and a crack that has run up from it
        const band = mix(METAL, DARK, 0.45);
        p.contour([[-48, 8], [-24, 5], [0, 4], [24, 5], [48, 8]], { closed: false }).stroke(band, 3, 0.9);
        p.contour([[-41, 26], [-20, 24], [0, 23], [20, 24], [41, 26]], { closed: false }).stroke(band, 1.8, 0.75);
        p.contour([[-27, 80], [-12, 77], [0, 77], [12, 77], [27, 80]], { closed: false }).stroke(band, 2.2, 0.75);
        p.contour([[-18, 100], [0, 97], [18, 100]], { closed: false }).stroke(band, 1.6, 0.6);
        p.contour([[26, 2], [23, 18], [29, 30], [24, 44]], { closed: false, round: 0 }).stroke(DARK, 1.6, 0.85);
        // verdigris, where the water has run
        p.ellipse(-30, 38, 7, 3).fill(mix(PALETTE.worldGlow, PALETTE.worldSlate, 0.5), 0.35);
        p.ellipse(-12, 64, 5, 2.4).fill(mix(PALETTE.worldGlow, PALETTE.worldSlate, 0.5), 0.3);
      }),
    );
    const crown = k.part('crown', (pen) => {
      pen.shape([[-10, 0], [-7, 7], [0, 9], [7, 7], [10, 0]], metal);
      pen.circle(0, 17, 7).stroke(DARK, 4.2, 1);
      pen.circle(0, 17, 7).stroke(METAL, 2.4, 1);
      pen.circle(0, 17, 7).stroke(RIM, 0.7, 0.7);
    });
    const lid = k.part('lid', (pen) => pen.shape([[-8, 0], [-8, 8], [0, 10], [8, 8], [8, 0]], solid(mix(METAL, DARK, 0.25), RIM, { ramp: 'vert', edge: DARK, width: 1 })));
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 6, 7).fill(PALETTE.whiteHot);
      pen.ellipse(1, 0, 2.2, 6.2).fill(DARK);
    });
    const eyes = [0, 1].map(() => k.group('eye-pair'));
    const eyeGlow = k.glow(HALO, 56, 0);
    const lidParts = [lid, k.part('lid2', (pen) => pen.shape([[-8, 0], [-8, 8], [0, 10], [8, 8], [8, 0]], solid(mix(METAL, DARK, 0.25), RIM, { ramp: 'vert', edge: DARK, width: 1 })))];
    const eyeParts = [eye, k.part('eye2', (pen) => {
      pen.ellipse(0, 0, 6, 7).fill(PALETTE.whiteHot);
      pen.ellipse(1, 0, 2.2, 6.2).fill(DARK);
    })];
    eyes.forEach((g, i) => g.addChild(eyeParts[i]!, lidParts[i]!));
    const ringA = k.part('ring-a', (pen) => pen.ellipse(0, 0, 60, 8).stroke(HALO, 2.4, 0.9));
    const ringB = k.part('ring-b', (pen) => pen.ellipse(0, 0, 60, 8).stroke(PALETTE.whiteHot, 1.6, 0.8));
    ringA.blendMode = ringB.blendMode = 'add';
    const dust = new Motes(k, 8, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 16, 0.5);

    bellG.addChild(clapper, bell, crown, ...eyes, eyeGlow);
    root.addChild(legBack.root, legFront.root, bellG, ringA, ringB, dust);
    place(clapper, 0, 9);
    place(crown, 0, 120);
    place(eyes[0]!, -15, 92);
    place(eyes[1]!, 15, 92);
    eyeGlow.position.set(0, -92);

    // ------------------------------------------------------------------------------------------ motion
    const swing = new Spring(0, 70, 7);
    let beat = k.seed * 3;
    let rock = 0;
    let rocking = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const toll = f.anim === 'attack';
        const spent = f.phase === 'recovery';

        // the rock: slow and small at rest, growing through the swing, hard at the toll, dying away after
        beat += dt * (wind ? 1.6 + 1.2 * f.p : 0.55);
        rocking = dt > 0 ? damp(rocking, wind ? 0.06 + 0.3 * easeIn(f.p) : toll ? 0.34 : spent ? 0.1 * (1 - f.p) : 0.025, wind ? 8 : 5, dt) : rocking;
        const sw = Math.sin(beat * Math.PI * 2);
        rock = toll ? (f.p < 0.2 ? 0.34 * (f.p / 0.2) : 0.34 * Math.max(0, 1 - (f.p - 0.2) / 0.8) * Math.cos((f.p - 0.2) * 22)) : sw * rocking;
        if (dead) rock = 1.5 * easeIn(Math.min(1, f.dying * 1.3));
        rock += 0.18 * f.hurt;
        const lift = dead ? 0 : (wind ? 2 * f.p : 0);
        place(bellG, 0, HIP_Y + lift, -rock, 1 + (toll ? 0.03 : 0), 1 + (toll ? -0.03 : 0) + 0.01 * Math.sin(f.t * 1.5));

        // the clapper swings below the rim, out of step with the bell (a spring), and strikes at the toll
        const target = -rock * 1.9 + (toll && f.p < 0.25 ? -0.9 : 0);
        const c = swing.step(target, dt);
        place(clapper, 0, 9, Math.max(-1.1, Math.min(1.1, c)));

        // the legs: planted, taking the weight of the rock
        // (the hips are up inside the bell, hidden by it: the legs come out from under the skirt)
        const hipH = HIP_Y + 12 + lift;
        legBack.root.position.set(-18, -hipH);
        legFront.root.position.set(18, -hipH);
        legBack.reach(-4 + 5 * Math.max(0, -rock), -hipH + 9 + (dead ? 10 * f.dying : 0), 1);
        legFront.reach(4 - 5 * Math.max(0, rock), -hipH + 9 + (dead ? 10 * f.dying : 0), -1);

        // the eyes: heavy-lidded while it waits, wide with the swing, shut in pain
        const lidDown = dead ? 1 : Math.max(0, 0.55 - 0.65 * f.heat) + 0.8 * f.hurt;
        for (const [i, g] of eyes.entries()) {
          const lp = lidParts[i]!;
          place(lp, 0, 4 + 8 * (1 - lidDown) - 8, 0, 1, Math.max(0.05, 0.4 + 0.9 * lidDown));
          place(g, i ? 15 : -15, 92, 0, 1 + 0.12 * f.heat, 1 + 0.12 * f.heat);
        }
        eyeGlow.alpha = Math.min(1, (0.1 + 0.9 * f.heat) * (1 - lidDown * 0.8)) * (dead ? 0 : 1);
        eyeGlow.scale.set((44 + 44 * f.heat) / eyeGlow.texture.width);

        // the toll: two rings run out along the floor, one after the other
        const out = toll ? f.p : 1;
        const ringOn = toll && f.p < 0.97;
        for (const [i, r] of [ringA, ringB].entries()) {
          r.visible = ringOn || (dead && f.dying > 0.35 && f.dying < 0.8);
          const u = toll ? Math.max(0, Math.min(1, out - i * 0.18)) : dead ? Math.max(0, Math.min(1, (f.dying - 0.35) / 0.4)) : 0;
          r.alpha = (1 - u) * (i ? 0.7 : 0.95);
          place(r, 0, 4, 0, 0.4 + u * 3.1, 0.7 + u * 0.5);
        }
        dust.show(f.t, 0, 14, 150, 30, 0.5, dead && f.dying > 0.4 ? 0.7 : toll && f.p > 0.1 ? 0.35 : 0);
      },
    };
  },
};
