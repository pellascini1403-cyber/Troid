import type { FrameSpec, GroupMove, RigPose, Xy } from './heroRig';

/**
 * THE PROTAGONIST'S CLIPS (docs/ART-PIPELINE-2D.md part N): which drawing each frame of each clip is, and how its groups move. Authoring, in code, because an animation is curves: a breath is a cosine,
 * a sway lags the head it hangs from. Nothing here is a picture; the pictures are the user's drawings and `heroRig.ts` bends them.
 */

export interface ClipSpec {
  /** Playback rate (frames per second) when the clip runs on time. */
  fps: number;
  loop: boolean;
  /** For clips the simulation drives (attacks, the cast): which frames are which phase (inclusive indices). */
  phases?: { startup: readonly [number, number]; active: readonly [number, number]; recovery: readonly [number, number] };
  /** Tags the manifest carries (`first`, `sword`). */
  tags?: readonly string[];
  /**
   * Present when the sheet has NO drawing of this action: the clip is made by moving the drawing of another action, and this says which and why. The manifest tags it `stand-in`, which is
   * how `npm run assets:missing` knows the art of its own is still to be delivered (the motion is real; the drawing is borrowed).
   */
  standIn?: string;
  /** What this clip is, honestly: how it was made and what it lacks. */
  note: string;
  frames: readonly FrameSpec[];
}

const TAU = Math.PI * 2;
/** 0 → 1 → 0 over one loop. */
const breath = (t: number): number => (1 - Math.cos(TAU * t)) / 2;
const sin = (t: number, phase = 0): number => Math.sin(TAU * (t - phase));
const r2 = (v: number): number => Math.round(v * 100) / 100;
const mv = (m: GroupMove): GroupMove => ({ dx: m.dx === undefined ? undefined : r2(m.dx), dy: m.dy === undefined ? undefined : r2(m.dy), rot: m.rot === undefined ? undefined : r2(m.rot), sx: m.sx, sy: m.sy });

/** `n` frames of a loop: `f` is given the time of each in [0, 1). */
const cycle = (n: number, f: (t: number, k: number) => FrameSpec): FrameSpec[] => Array.from({ length: n }, (_, k) => f(k / n, k));

/** A control point of a pose. */
const at = (rig: RigPose, name: string): Xy => {
  const p = rig.points[name];
  if (!p) throw new Error(`pose "${rig.pose}": there is no point "${name}"`);
  return p;
};

/**
 * Where a leg has to be turned and shifted so that its foot stands at `target` (the leg is one rigid piece hanging from the hip): the angle that aims it, and the little shift that is
 * left over when the target is not exactly one leg's length from the hip. The knee goes with it.
 */
const legTo = (rig: RigPose, hip: string, foot: string, target: Xy): GroupMove => {
  const h = at(rig, hip);
  const f = at(rig, foot);
  const a0 = Math.atan2(f[1] - h[1], f[0] - h[0]);
  const a1 = Math.atan2(target[1] - h[1], target[0] - h[0]);
  const da = a1 - a0;
  const c = Math.cos(da);
  const s = Math.sin(da);
  const rx = h[0] + c * (f[0] - h[0]) - s * (f[1] - h[1]);
  const ry = h[1] + s * (f[0] - h[0]) + c * (f[1] - h[1]);
  return mv({ rot: (da * 180) / Math.PI, dx: target[0] - rx, dy: target[1] - ry });
};

export function makeClips(rigs: Readonly<Record<string, RigPose>>): Record<string, ClipSpec> {
  const rig = (name: string): RigPose => {
    const r = rigs[name];
    if (!r) throw new Error(`there is no rig "${name}"`);
    return r;
  };
  const clips: Record<string, ClipSpec> = {};

  // ------------------------------------------------------------------------------------------------------------------------------------------ idle
  clips['idle'] = {
    fps: 8,
    loop: true,
    tags: ['first'],
    note: 'drawing 1 (standing, calm), breathing: the chest rises, the head follows a beat later, the antennae sway',
    frames: cycle(8, (t) => ({
      pose: 'idle',
      move: {
        body: mv({ dy: -4 * breath(t) }),
        head: mv({ dy: -5.5 * breath(t - 0.08), dx: 1.4 * sin(t, 0.1), rot: 0.8 * sin(t, 0.05) }),
        ant1: mv({ rot: 4 * sin(t, 0.2) + 1.6 * sin(2 * t, 0.1) }),
        ant2: mv({ rot: -4 * sin(t, 0.27) - 1.6 * sin(2 * t, 0.15) }),
      },
    })),
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------ walk
  {
    const w = rig('walk');
    const footB = at(w, 'foot_b');
    const footF = at(w, 'foot_f');
    clips['walk'] = {
      fps: 16,
      loop: true,
      tags: ['first'],
      note: 'drawing 2 (the three-quarter stance, facing the way it walks): each leg in turn lifts and swings forward while the other stands and slides back, the body rises as the feet come together and sinks as they part, the head and the antennae drag a beat behind, the cape trails',
      frames: cycle(8, (t) => {
        const u = TAU * t;
        const swingB = (1 - Math.cos(u)) / 2; // 0 at the drawing's own stance, 1 with the leg brought forward
        const liftB = Math.max(0, Math.sin(u));
        const liftF = Math.max(0, -Math.sin(u));
        const targetB: Xy = [footB[0] + 20 * swingB, footB[1] - 9 * liftB];
        const targetF: Xy = [footF[0] - 20 * swingB, footF[1] - 9 * liftF];
        return {
          pose: 'walk',
          ground: true,
          move: {
            body: mv({ dy: -3.2 * swingB + 1, dx: 0.6 * Math.cos(u) }),
            legB: legTo(w, 'hip_b', 'foot_b', targetB),
            legF: legTo(w, 'hip_f', 'foot_f', targetF),
            cape: mv({ rot: 6 * sin(t, 0.15) }),
            head: mv({ dy: -2 * Math.abs(Math.sin(TAU * (t - 0.06))), dx: 1.2 * Math.cos(u), rot: 1.6 * sin(t, 0.1) }),
            ant1: mv({ rot: 5 * sin(t, 0.22) }),
            ant2: mv({ rot: -5 * sin(t, 0.3) }),
          },
        };
      }),
    };
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------ run
  {
    const w = rig('run');
    const footB = at(w, 'foot_b');
    const footF = at(w, 'foot_f');
    clips['run'] = {
      fps: 20,
      loop: true,
      tags: [],
      note: 'drawing 3 (the dive of the run): the rear leg pumps from stretched behind to tucked under, the front leg answers (they never cross), the body rises and sinks twice a stride, the head and the antennae drag, the cape streams',
      frames: cycle(8, (t) => {
        const u = TAU * t;
        const tuck = (1 - Math.cos(u)) / 2; // 0 = the rear leg stretched as drawn, 1 = tucked forward
        const targetB: Xy = [footB[0] + 32 * tuck, footB[1] - 14 * Math.max(0, Math.sin(u))];
        const targetF: Xy = [footF[0] - 22 * tuck, footF[1] - 8 * Math.max(0, -Math.sin(u))];
        return {
          pose: 'run',
          ground: true,
          move: {
            body: mv({ dy: -2.6 * (1 - Math.cos(2 * u)) / 2 + 0.8, dx: 0.8 * Math.cos(u), rot: 1.2 * sin(t, 0.1) }),
            legB: legTo(w, 'hip_b', 'foot_b', targetB),
            legF: legTo(w, 'hip_f', 'foot_f', targetF),
            cape: mv({ rot: 9 * sin(2 * t, 0.1), dy: 1.5 * sin(2 * t, 0.3) }),
            head: mv({ dy: -1.8 * Math.abs(Math.sin(u - 0.5)), dx: 1.2 * Math.cos(u), rot: 1.4 * sin(t, 0.2) }),
            ant1: mv({ rot: 6 * sin(2 * t, 0.15) }),
            ant2: mv({ rot: -6 * sin(2 * t, 0.3) }),
          },
        };
      }),
    };
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------ the sword drawings
  // The blade of drawing 7 is a piece of its own (a rigid layer turning about the corner of its hinge), the arm that holds it bends a little with the shoulder, and the whole figure leans and
  // lunges. `blade` is the angle of the blade from where the drawing has it (negative = raised, positive = lowered), `fwd` how far the hand is pushed along the blade (negative = drawn back).
  const sl = rig('slash');
  const AXIS = { x: 0.932, y: 0.362 }; // from the hand to the tip in the drawing
  interface Strike {
    blade: number;
    fwd?: number;
    armRot?: number;
    /** The figure leans (degrees, about the feet; negative = back) and lunges (pixels forward). */
    lean?: number;
    lunge?: number;
    /** The body sinks (pixels, the legs bend under it) */
    sink?: number;
    cape?: number;
    head?: GroupMove;
    ant?: number;
    legB?: Xy;
    legF?: Xy;
    ground?: boolean;
  }
  const strike = (pose: string, s: Strike): FrameSpec => {
    const move: Record<string, GroupMove> = {
      blade: mv({ rot: s.blade }),
      arm: mv({ dx: (s.fwd ?? 0) * AXIS.x, dy: (s.fwd ?? 0) * AXIS.y, rot: s.armRot }),
      cape: mv({ rot: s.cape ?? 0 }),
      head: mv(s.head ?? {}),
      ant1: mv({ rot: s.ant ?? 0 }),
      ant2: mv({ rot: -(s.ant ?? 0) * 0.8 }),
    };
    if (s.sink) move['body'] = mv({ dy: s.sink });
    if (s.legB) move['legB'] = legTo(sl, 'hip_b', 'foot_b', s.legB);
    if (s.legF) move['legF'] = legTo(sl, 'hip_f', 'foot_f', s.legF);
    return { pose, move, global: { rot: s.lean ?? 0, dx: s.lunge ?? 0 }, ground: s.ground ?? true };
  };
  const phases4 = { startup: [0, 1], active: [2, 3], recovery: [4, 6] } as const;

  clips['attack1'] = {
    fps: 28,
    loop: false,
    phases: phases4,
    tags: ['first', 'sword'],
    note: 'drawing 7 (the low lunge): the blade is a rigid piece that turns about the hilt — raised behind while the body coils (startup), brought down through the cut as the figure lunges (active), carried through and let go back to the drawing (recovery)',
    frames: [
      strike('slash', { blade: -30, fwd: -8, armRot: -5, lean: -4, lunge: -3, cape: -5, ant: 5, head: { dx: -1.5, dy: 1 } }),
      strike('slash', { blade: -40, fwd: -13, armRot: -9, lean: -7, lunge: -6, sink: 1.5, cape: -9, ant: 8, head: { dx: -2.5, dy: 1.5 } }),
      strike('slash', { blade: -14, fwd: 4, armRot: 3, lean: 3, lunge: 7, cape: 8, ant: -8, head: { dx: 2, rot: 1.5 } }),
      strike('slash', { blade: 3, fwd: 12, armRot: 4, lean: 5, lunge: 12, cape: 12, ant: -12, head: { dx: 3, dy: 0.5, rot: 2 } }),
      strike('slash', { blade: 16, fwd: 8, armRot: 2, lean: 3, lunge: 9, cape: 7, ant: -6, head: { dx: 1.5, rot: 1.5 } }),
      strike('slash', { blade: 9, fwd: 3, lean: 1.5, lunge: 4, cape: 3, ant: 3, head: { dx: 0.5 } }),
      strike('slash', { blade: 0 }),
    ],
  };

  clips['attack2'] = {
    fps: 28,
    loop: false,
    // the second blow has the longest recovery (11 ticks): four frames of it
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 7] },
    tags: ['sword'],
    standIn: "the sheet's second blow cannot be separated from its red arc: the drawing of the first blow is swung the other way",
    note: 'drawing 7 again, the other way round: the blade starts LOW and rises through the cut (the first blow came down), the body sinks and straightens — a second, different swing of the same drawing, not a copy of the first',
    frames: [
      strike('slash', { blade: 22, fwd: -6, armRot: 4, lean: 3, lunge: -2, sink: 2, cape: 4, ant: -4, head: { dy: 1.5 } }),
      strike('slash', { blade: 32, fwd: -10, armRot: 7, lean: 5, lunge: -4, sink: 3.5, cape: 7, ant: -7, head: { dy: 2.5, dx: -1 } }),
      strike('slash', { blade: 8, fwd: 5, armRot: -2, lean: 0, lunge: 6, sink: 1, cape: -3, ant: 6, head: { dx: 1.5 } }),
      strike('slash', { blade: -26, fwd: 12, armRot: -6, lean: -4, lunge: 11, cape: -8, ant: 12, head: { dx: 3, dy: -1.5, rot: -2 } }),
      strike('slash', { blade: -30, fwd: 7, armRot: -6, lean: -4, lunge: 7, cape: -6, ant: 6, head: { dx: 1.5, dy: -1, rot: -1.5 } }),
      strike('slash', { blade: -14, fwd: 3, armRot: -4, lean: -3, lunge: 5, cape: -4, ant: 4, head: { dx: 1 } }),
      strike('slash', { blade: -6, fwd: 2, lean: -1, lunge: 2, cape: -2 }),
      strike('slash', { blade: 0 }),
    ],
  };

  clips['aerialAttack'] = {
    fps: 26,
    loop: false,
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 6] },
    tags: ['sword'],
    standIn: 'the sheet has no blow in the air: the drawing of the first blow is moved to fit one (legs drawn up)',
    note: 'drawing 7 in the air: the legs are drawn up under the body (they were planted), the blade comes down in a long cut with the body stretched along it and the antennae streaming up — the sheet has no blow in the air, so the lunge is the stand-in drawing moved to fit one',
    frames: [
      strike('slash', { blade: -28, fwd: -6, armRot: -4, lean: -3, lunge: -2, sink: -3, cape: 6, ant: 7, legB: [86, 214], legF: [166, 216], ground: false, head: { dy: -1 } }),
      strike('slash', { blade: -38, fwd: -10, armRot: -8, lean: -6, lunge: -4, sink: -3, cape: 9, ant: 10, legB: [92, 210], legF: [168, 212], ground: false, head: { dy: -1.5, dx: -1.5 } }),
      strike('slash', { blade: -12, fwd: 4, armRot: 3, lean: 4, lunge: 7, sink: -2, cape: -4, ant: -6, legB: [84, 216], legF: [170, 218], ground: false, head: { dx: 2 } }),
      strike('slash', { blade: 4, fwd: 12, armRot: 4, lean: 7, lunge: 11, sink: -2, cape: -8, ant: -12, legB: [78, 220], legF: [172, 220], ground: false, head: { dx: 3, rot: 2 } }),
      strike('slash', { blade: 17, fwd: 8, armRot: 2, lean: 5, lunge: 8, sink: -2, cape: -5, ant: -7, legB: [82, 218], legF: [170, 218], ground: false, head: { dx: 1.5 } }),
      strike('slash', { blade: 9, fwd: 3, lean: 2.5, lunge: 4, sink: -1.5, cape: -2, ant: -2, legB: [80, 222], legF: [168, 222], ground: false }),
      strike('slash', { blade: 3, lean: 1, lunge: 1, sink: -1, legB: [76, 226], legF: [166, 226], ground: false }),
    ],
  };

  clips['crouchAttack'] = {
    fps: 26,
    loop: false,
    phases: { startup: [0, 1], active: [2, 3], recovery: [4, 6] },
    tags: ['sword'],
    standIn: 'the sheet has no blow from the crouch: the drawing of the first blow is lowered onto its legs',
    note: 'drawing 7 low: the figure sinks onto its legs and the blade is swept along the ground in a flat cut — the sheet has no blow from the crouch, so the lunge, already the lowest drawing with a sword, is lowered further',
    frames: [
      strike('slash', { blade: -10, fwd: -8, armRot: -3, lean: 4, lunge: -3, sink: 6, cape: -4, ant: 4, head: { dy: 2, dx: -1 } }),
      strike('slash', { blade: -18, fwd: -12, armRot: -5, lean: 6, lunge: -5, sink: 8, cape: -6, ant: 6, head: { dy: 3, dx: -2 } }),
      strike('slash', { blade: 10, fwd: 4, armRot: 2, lean: 8, lunge: 7, sink: 8, cape: 9, ant: -8, head: { dx: 2, dy: 2 } }),
      strike('slash', { blade: 14, fwd: 12, armRot: 3, lean: 9, lunge: 12, sink: 7, cape: 13, ant: -12, head: { dx: 3, dy: 1.5, rot: 2 } }),
      strike('slash', { blade: 12, fwd: 8, armRot: 2, lean: 7, lunge: 9, sink: 6, cape: 7, ant: -7, head: { dx: 1.5, dy: 1.5 } }),
      strike('slash', { blade: 8, fwd: 4, lean: 4, lunge: 4, sink: 4, cape: 3, ant: -2, head: { dy: 1 } }),
      strike('slash', { blade: 4, lean: 1.5, lunge: 1, sink: 2 }),
    ],
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------ the air
  {
    const w = rig('jump');
    clips['jump'] = {
      fps: 14,
      loop: false,
      tags: ['first'],
      note: 'drawing 4 (rising): the push off squashes the figure and stretches it, then it flies — the limbs trail and sway, the plate and the cape flutter, the antennae lag behind the head',
      frames: [
        // the push off, then the stretch
        { pose: 'jump', global: { sx: 1.05, sy: 0.94 }, move: { head: mv({ dy: 2 }), ant1: mv({ rot: -8 }), ant2: mv({ rot: 8 }), legA: mv({ rot: 7 }), legB: mv({ rot: 9 }), wing: mv({ rot: 6 }), plate: mv({ rot: 5 }) } },
        { pose: 'jump', global: { sx: 0.96, sy: 1.07 }, move: { head: mv({ dy: -2 }), ant1: mv({ rot: 7 }), ant2: mv({ rot: -7 }), legA: mv({ rot: -5 }), legB: mv({ rot: -6 }), wing: mv({ rot: -7 }), plate: mv({ rot: -6 }) } },
        ...cycle(4, (t) => ({
          pose: 'jump',
          global: { sx: 0.985, sy: 1.03 },
          move: {
            body: mv({ dy: -1 * breath(t) }),
            head: mv({ dy: -1.2 * breath(t - 0.1), rot: 1 * sin(t, 0.1) }),
            ant1: mv({ rot: 5 * sin(t, 0.1) }),
            ant2: mv({ rot: -5 * sin(t, 0.2) }),
            wing: mv({ rot: 7 * sin(t, 0.0) }),
            plate: mv({ rot: 5 * sin(t, 0.15) }),
            legA: mv({ rot: 5 * sin(t, 0.25) }),
            legB: mv({ rot: -5 * sin(t, 0.3) }),
            arm: mv({ rot: 4 * sin(t, 0.4) }),
          },
        })),
      ],
    };
    void w;
  }

  {
    clips['fall'] = {
      fps: 12,
      loop: true,
      note: 'drawing 5 (falling head first): the antennae and the spikes stream up in the wind, the body wobbles and breathes with the speed',
      frames: cycle(4, (t) => ({
        pose: 'fall',
        global: { sy: 1 + 0.02 * sin(2 * t, 0.1), sx: 1 - 0.012 * sin(2 * t, 0.1), rot: 1.6 * sin(t, 0.1) },
        move: {
          head: mv({ dx: 0.8 * sin(t, 0.3), rot: 1.2 * sin(t, 0.2) }),
          ant1: mv({ rot: 6 * sin(t, 0.0) + 2 * sin(2 * t, 0.2) }),
          ant2: mv({ rot: -6 * sin(t, 0.18) - 2 * sin(2 * t, 0.1) }),
          spikeL: mv({ rot: 5 * sin(t, 0.35) }),
        },
      })),
    };
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------ the crouch
  clips['land'] = {
    fps: 24,
    loop: false,
    note: 'drawing 6 (the landing crouch): the weight arrives — the figure squashes onto its legs, the head sinks and the antennae flare — and comes back up into the crouch',
    frames: [
      { pose: 'land', ground: true, global: { sx: 1.07, sy: 0.88 }, move: { head: mv({ dy: 3 }), ant1: mv({ rot: 9 }), ant2: mv({ rot: -9 }), wing: mv({ rot: -6 }) } },
      { pose: 'land', ground: true, global: { sx: 1.09, sy: 0.85 }, move: { head: mv({ dy: 4, dx: 1 }), ant1: mv({ rot: 12 }), ant2: mv({ rot: -12 }), wing: mv({ rot: -9 }) } },
      { pose: 'land', ground: true, global: { sx: 1.03, sy: 0.94 }, move: { head: mv({ dy: 1.5 }), ant1: mv({ rot: 4 }), ant2: mv({ rot: -4 }), wing: mv({ rot: -3 }) } },
      { pose: 'land', ground: true, global: { sx: 1.0, sy: 0.985 }, move: { head: mv({ dy: 0.5 }), ant1: mv({ rot: 1 }), ant2: mv({ rot: -1 }) } },
    ],
  };

  clips['crouch'] = {
    fps: 6,
    loop: true,
    standIn: 'the sheet has no crouch: the drawing of the landing crouch is held, breathing',
    note: 'drawing 6 (the crouch) held, breathing: the head rises and sinks a hair behind the body, the antennae sway, the wing stirs',
    frames: cycle(6, (t) => ({
      pose: 'land',
      ground: true,
      global: { sy: 1 - 0.02 * breath(t), sx: 1 + 0.012 * breath(t) },
      move: {
        head: mv({ dy: -3.5 * breath(t - 0.1), dx: 1 * sin(t, 0.1), rot: 0.8 * sin(t, 0.05) }),
        ant1: mv({ rot: 4 * sin(t, 0.2) + 1.6 * sin(2 * t, 0.1) }),
        ant2: mv({ rot: -4 * sin(t, 0.27) - 1.6 * sin(2 * t, 0.15) }),
        wing: mv({ rot: 3 * sin(t, 0.3) }),
      },
    })),
  };

  clips['crouchWalk'] = {
    fps: 14,
    loop: true,
    standIn: 'the sheet has no crouched walk: the drawing of the landing crouch shuffles along',
    note: 'drawing 6 (the crouch) shuffling along: the figure sways side to side and the feet lift one after the other, the head dips with each step, the antennae drag',
    frames: cycle(6, (t) => {
      const u = TAU * t;
      return {
        pose: 'land',
        ground: true,
        global: { rot: 1.8 * Math.sin(u), dx: 0.8 * Math.cos(u) },
        move: {
          body: mv({ dy: 1 - 1.4 * Math.abs(Math.sin(u)) }),
          head: mv({ dy: 1.2 * Math.abs(Math.sin(u - 0.4)), dx: 1 * Math.cos(u), rot: -1.2 * Math.sin(u) }),
          ant1: mv({ rot: 5 * sin(t, 0.15) }),
          ant2: mv({ rot: -5 * sin(t, 0.3) }),
          wing: mv({ rot: 5 * sin(t, 0.0) }),
        },
      };
    }),
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------ the dash
  {
    const w = rig('run');
    const footB = at(w, 'foot_b');
    const footF = at(w, 'foot_f');
    clips['dash'] = {
      fps: 24,
      loop: false,
      tags: ['first'],
      standIn: "the sheet's dash drawing is a red streak, not a figure: the dive drawing of the run is thrown forward instead",
      note: 'drawing 3 (the dive), thrown forward: the figure stretches along its line, the legs trail straight behind, the cape and the antennae are laid back flat',
      frames: [0, 1, 2, 3].map((k) => ({
        pose: 'run',
        ground: true,
        global: { sx: k === 0 ? 1.0 : 1.1 + 0.015 * (k % 2), sy: k === 0 ? 0.97 : 0.94, rot: k === 0 ? 2 : 5, dx: k === 0 ? -2 : 3 },
        move: {
          legB: legTo(w, 'hip_b', 'foot_b', [footB[0] - 10 - 2 * k, footB[1] - 4]),
          legF: legTo(w, 'hip_f', 'foot_f', [footF[0] - 16 - 2 * k, footF[1] - 2]),
          cape: mv({ rot: -10 - 3 * k }),
          head: mv({ dx: 2, rot: 3 }),
          ant1: mv({ rot: -11 - 2 * k }),
          ant2: mv({ rot: -11 - 2 * k }),
        },
      })),
    };
  }

  // ------------------------------------------------------------------------------------------------------------------------------------------ hurt and death
  clips['hurt'] = {
    fps: 20,
    loop: false,
    tags: ['first'],
    note: 'drawing 11 (struck, thrown back): the blow lands — the figure is thrown a little further than the drawing, the antennae whip, the limbs fly out — and it comes back to the drawing and settles',
    frames: [
      { pose: 'hurt', ground: true, global: { rot: 4, dx: 5 }, move: { head: mv({ dx: 2, rot: 2 }), ant1: mv({ rot: 9 }), ant2: mv({ rot: 9 }), arm: mv({ rot: 10 }), leg: mv({ rot: -8 }), cape: mv({ rot: 10 }) } },
      { pose: 'hurt', ground: true, global: { rot: -5, dx: -5 }, move: { head: mv({ dx: -2, rot: -4 }), ant1: mv({ rot: -9 }), ant2: mv({ rot: -9 }), arm: mv({ rot: -12 }), leg: mv({ rot: 9 }), cape: mv({ rot: -9 }) } },
      { pose: 'hurt', ground: true, global: { rot: -2, dx: -2 }, move: { head: mv({ dx: -1, rot: -1 }), ant1: mv({ rot: -3 }), ant2: mv({ rot: -3 }), arm: mv({ rot: -4 }), leg: mv({ rot: 3 }), cape: mv({ rot: -3 }) } },
      { pose: 'hurt', ground: true, global: { rot: 0, dx: 0 }, move: { ant1: mv({ rot: 3 }), ant2: mv({ rot: 3 }), arm: mv({ rot: 2 }) } },
      { pose: 'hurt', ground: true, global: { rot: 1, dx: 1 }, move: { ant1: mv({ rot: 1 }), ant2: mv({ rot: 1 }) } },
    ],
  };

  clips['death'] = {
    fps: 12,
    loop: false,
    standIn: 'the sheet has no death: the drawing of the hit is turned onto the floor',
    note: 'drawing 11 (struck, thrown back) carried on: the figure is thrown, tips over backward as one piece, lands, bounces once and lies still while the light goes out of its eyes',
    frames: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
      const rot = [-3, -9, -20, -36, -55, -73, -86, -90, -90][k]!;
      const dx = [0, -2, -3, -1, 8, 30, 58, 76, 80][k]!;
      const lift = [0, 0, 0, 0, 0, 0, 3, 0, 0][k]!;
      return {
        pose: 'hurt',
        ground: true,
        eyes: [0, 0, 0, 0.05, 0.2, 0.4, 0.65, 0.85, 0.95][k]!,
        global: { rot, dx, dy: -lift },
        move: {
          head: mv({ rot: [0, -3, -6, -8, -7, -5, -2, 0, 0][k]! }),
          ant1: mv({ rot: [8, -6, -10, -7, -2, 8, 7, 2, 0][k]! }),
          ant2: mv({ rot: [8, -6, -10, -7, -2, 8, 7, 2, 0][k]! }),
          arm: mv({ rot: [8, -10, -17, -17, -11, -5, -1, 0, 0][k]! }),
          leg: mv({ rot: [-6, 8, 12, 11, 6, 3, 1, 0, 0][k]! }),
        },
      };
    }),
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------ the cast
  clips['cast'] = {
    fps: 14,
    loop: false,
    phases: { startup: [0, 2], active: [3, 3], recovery: [4, 6] },
    note: 'drawing 12 (the sword raised): the figure gathers — sinks, draws the sword arm down and in, the antennae fold — and releases: it rises, the arm and the blade are thrown up and forward and the antennae flare, then it settles back into the drawing',
    frames: [
      { pose: 'guard', ground: true, move: { body: mv({ dy: 3 }), head: mv({ dy: 3.5, dx: -1 }), arm: mv({ dx: -1, dy: 5, rot: -4 }), ant1: mv({ rot: -7 }), ant2: mv({ rot: 7 }) } },
      { pose: 'guard', ground: true, move: { body: mv({ dy: 5 }), head: mv({ dy: 6, dx: -2 }), arm: mv({ dx: -2, dy: 9, rot: -7 }), ant1: mv({ rot: -11 }), ant2: mv({ rot: 11 }) } },
      { pose: 'guard', ground: true, move: { body: mv({ dy: 3 }), head: mv({ dy: 3.5, dx: -1 }), arm: mv({ dx: 0, dy: 3, rot: -3 }), ant1: mv({ rot: -6 }), ant2: mv({ rot: 6 }) } },
      { pose: 'guard', ground: true, global: { sy: 1.04, sx: 0.985 }, move: { body: mv({ dy: -2 }), head: mv({ dy: -3, dx: 2 }), arm: mv({ dx: 5, dy: -9, rot: 9 }), ant1: mv({ rot: 12 }), ant2: mv({ rot: -12 }) } },
      { pose: 'guard', ground: true, global: { sy: 1.02 }, move: { body: mv({ dy: -1 }), head: mv({ dy: -1.5, dx: 1 }), arm: mv({ dx: 3, dy: -5, rot: 6 }), ant1: mv({ rot: 8 }), ant2: mv({ rot: -8 }) } },
      { pose: 'guard', ground: true, move: { head: mv({ dy: -0.5 }), arm: mv({ dx: 1.5, dy: -2, rot: 3 }), ant1: mv({ rot: 3 }), ant2: mv({ rot: -3 }) } },
      { pose: 'guard', ground: true },
    ],
  };

  // ------------------------------------------------------------------------------------------------------------------------------------------ drink and interact
  clips['drink'] = {
    fps: 15,
    loop: false,
    standIn: 'the sheet has no drinking: the standing drawing does the gesture (there is no drawing of a bottle; the potion\'s light is the effect\'s)',
    note: 'drawing 1 (standing): the head goes back and the body arches to drink, the throat works once, the head comes forward and the figure straightens',
    frames: [
      { pose: 'idle', ground: true, move: { body: mv({ dy: 1.2 }), head: mv({ dy: 2, rot: 1 }), ant1: mv({ rot: 3 }), ant2: mv({ rot: -3 }) } },
      { pose: 'idle', ground: true, global: { rot: -1.2 }, move: { head: mv({ rot: -6, dy: 0.5, dx: -1 }), ant1: mv({ rot: -5 }), ant2: mv({ rot: 5 }) } },
      { pose: 'idle', ground: true, global: { rot: -2.2 }, move: { head: mv({ rot: -12, dy: -1, dx: -2 }), ant1: mv({ rot: -9 }), ant2: mv({ rot: 9 }) } },
      { pose: 'idle', ground: true, global: { rot: -2.2 }, move: { head: mv({ rot: -12, dy: -2.8, dx: -2 }), ant1: mv({ rot: -10 }), ant2: mv({ rot: 10 }) } },
      { pose: 'idle', ground: true, global: { rot: -1 }, move: { head: mv({ rot: -5, dy: -0.5, dx: -0.8 }), ant1: mv({ rot: -3 }), ant2: mv({ rot: 3 }) } },
      { pose: 'idle', ground: true, move: { body: mv({ dy: -1.4 }), head: mv({ dy: -2.2 }), ant1: mv({ rot: 4 }), ant2: mv({ rot: -4 }) } },
    ],
  };

  clips['interact'] = {
    fps: 20,
    loop: false,
    standIn: 'the sheet has no interaction: the standing drawing leans in and nods (no hand reaching is made up)',
    note: 'drawing 1 (standing): the figure leans in toward what it touches and nods, the antennae perk forward — a short, still gesture (the hero is held for at most 12 ticks)',
    frames: [
      { pose: 'idle', ground: true, global: { rot: 1.8, dx: 0.6 }, move: { head: mv({ rot: 2.5, dy: 0.8, dx: 1 }), ant1: mv({ rot: 4 }), ant2: mv({ rot: 4 }) } },
      { pose: 'idle', ground: true, global: { rot: 3.8, dx: 1.4 }, move: { head: mv({ rot: 5, dy: 1.6, dx: 2 }), ant1: mv({ rot: 7 }), ant2: mv({ rot: 7 }) } },
      { pose: 'idle', ground: true, global: { rot: 3.4, dx: 1.2 }, move: { head: mv({ rot: 4.5, dy: 1.2, dx: 1.8 }), ant1: mv({ rot: 5 }), ant2: mv({ rot: 5 }) } },
      { pose: 'idle', ground: true, global: { rot: 1.6, dx: 0.5 }, move: { head: mv({ rot: 2, dy: 0.5, dx: 0.8 }), ant1: mv({ rot: 2 }), ant2: mv({ rot: 2 }) } },
    ],
  };

  return clips;
}

/** The order the clips are written in the manifest: the states a player meets most first. */
export const CLIP_ORDER: readonly string[] = [
  'idle', 'walk', 'run', 'jump', 'fall', 'land', 'crouch', 'crouchWalk', 'dash',
  'attack1', 'attack2', 'aerialAttack', 'crouchAttack', 'hurt', 'death', 'cast', 'drink', 'interact',
];
