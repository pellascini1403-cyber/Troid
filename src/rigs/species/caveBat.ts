import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeOut, TAU } from '../kit/motion';
import type { Material } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';
import { wingOutlineLength, wingShape, type WingSpec } from './batWing';

/**
 * THE CAVE BAT (docs/PROMPT24-LOG.md): a real bat — small, furred, with long ears, a sharp little face and two wings made of bones and membrane — drawn in the dark glossy language of the references. It is the only creature of the
 * first half that begins its life HANGING: asleep (`idle` with no phase) it is folded in its own wings and upside down, eyes shut to a line; the `wake` (telegraph) unfolds it — it swings up, the wings rise, the jaw opens, the ears
 * come forward and rings of sound leave the mouth —; the swoop is a dive with the wings swept back and the body pitched along its path; after the blow it hangs in the air flapping (the opening); the climb back is fast, short beats.
 * Hit, the wings flare and the body is thrown back; dead, it tumbles with the wings folded.
 */

const RIM = PALETTE.violetCore;
const MEMBRANE = mix(PALETTE.violetDeep, PALETTE.violetCore, 0.22);
const BONE = mix(PALETTE.violetDeep, PALETTE.violetCore, 0.55);

const HOVER_Y = 27;
const PERCH_Y = 41;

const WING: WingSpec = { arm: [11, 15], fingers: [27, 31, 27, 19], fan: [0.5, 0.02, -0.55, -1.12], scallop: 0.26 };
const N_OUT = wingOutlineLength(WING.fingers.length);

const TORSO: readonly Pt[] = [[2, 12], [7.5, 8.5], [9, 1], [6, -7], [1, -14], [-4.5, -14], [-7.5, -7], [-8.5, 1], [-5.5, 9.5]];
const HEAD: readonly Pt[] = [[-7, 1], [-5.5, 6.5], [1, 8.5], [7.5, 6], [12, 1.2], [13.5, -1.4], [10, -4], [3.5, -5.2], [-4, -4.8]];
const EAR: readonly Pt[] = [[-3.5, 4.5], [-8.5, 12], [-7.5, 29], [-1, 18], [3.5, 7]];
// the folded wings, wrapped round the body like a cloak: what a bat that sleeps looks like
const CLOAK: readonly Pt[] = [[3, 13], [10, 8], [13.5, -2], [9.5, -13], [1.5, -23], [-7, -16], [-11.5, -3], [-8.5, 9]];
const JAW: readonly Pt[] = [[0, 1], [5.5, 0.4], [10.5, -0.6], [9.5, -2.8], [3.6, -3.2], [0, -1.8]];

export const CAVE_BAT_RIG: RigDef = {
  id: 'cave_bat',
  width: 0.9,
  height: 0.55,
  aura: { color: PALETTE.violetCore, at: [0, HOVER_Y], size: 130, base: 0.1 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('cave-bat');
    const body = k.group('body');
    root.addChild(body);

    const skin: Material = ink(RIM, { gloss: lens([-3.5, 3], 4.6, 2.1, -0.5, PALETTE.violetGlow, 0.3) });
    const darkSkin: Material = ink(mix(RIM, PALETTE.enemyInk, 0.45), { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.25), width: 1.4 });

    // ------------------------------------------------------------------------------------------- wings
    const wing = (tag: string, tint: number, boneRim: number, bone: number) => {
      const patch = k.patch({ n: N_OUT, color: tint, ramp: 'fade', alpha: 0.95, edgeV: 0.42 }, `${tag}-membrane`);
      const bones = k.ribbon(
        { n: 3, count: 1 + WING.fingers.length, width: (u, line) => (line === 0 ? 4 - 1.8 * u : 2.1 - 1.3 * u), color: bone, ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.55 }, rim: { color: boneRim, width: 0.8, alpha: 0.85 } },
        `${tag}-bones`,
      );
      const claw = k.part(`${tag}-thumb`, (pen) => pen.shape([[0, 0], [1.4, 1.6], [3.4, 3.6], [1.8, 0.6]], { fill: PALETTE.worldHaze, rims: [] }, { sharp: [2] }));
      const node = k.group(`${tag}-wing`);
      node.addChild(patch, bones, claw);
      return { node, patch, bones, claw };
    };
    const far = wing('far', mix(MEMBRANE, PALETTE.enemyInk, 0.45), mix(BONE, PALETTE.enemyInk, 0.4), mix(BONE, PALETTE.enemyInk, 0.55));
    const near = wing('near', MEMBRANE, mix(PALETTE.violetCore, PALETTE.violetGlow, 0.4), BONE);

    const poseWing = (w: ReturnType<typeof wing>, S: Pt, H: Pt, phi: number, spread: number): void => {
      const s = wingShape(S, H, phi, spread, WING);
      w.patch.setPolygon(s.outline, s.W);
      w.bones.setLine(0, [s.S, [(s.S[0] + s.E[0] * 2 + s.W[0]) / 4, (s.S[1] + s.E[1] * 2 + s.W[1]) / 4], s.W]);
      for (let i = 0; i < s.tips.length; i++) w.bones.setLine(1 + i, [s.W, s.mids[i]!, s.tips[i]!]);
      w.bones.commit();
      place(w.claw, s.W[0], s.W[1], phi + 1.2, 1.1);
    };

    // ------------------------------------------------------------------------------------------- body
    const feet = [0, 1].map((i) =>
      k.part(`claw${i}`, (pen) => pen.shape([[0, 0], [1.3, -2.6], [0.6, -5.4], [-0.9, -2.8]], { fill: PALETTE.worldHaze, rims: [] }, { sharp: [2] })),
    );
    const torso = k.part('torso', (pen) => pen.shape(TORSO, skin));
    // the lighter fur of the chest: a ragged shield of strokes that follow the form
    const chest = k.part('chest', (pen) =>
      pen.shape([[2, 9], [6.5, 5], [7, -1], [4.5, -4.5], [3, -9], [1.5, -3.5], [0.5, -9.5], [-0.5, -2], [-2, 4]], { fill: mix(PALETTE.enemyInk, PALETTE.violetDeep, 0.5), alpha: 0.75 }, { sharp: [4, 6] }),
    );

    const cloak = k.part('cloak', (pen) =>
      pen.shape(CLOAK, ink(PALETTE.violetGlow, { fill: mix(PALETTE.violetDeep, PALETTE.enemyInk, 0.35), width: 1.8, gloss: lens([-4, 4], 5, 2.6, -0.6, PALETTE.violetGlow, 0.22) }), { sharp: [4] }, (p) =>
        // the fold lines of the membrane
        p.contour([[2, 9], [4, 0], [1.5, -10], [1.5, -19]], { closed: false, round: 1 }).stroke(PALETTE.violetCore, 0.8, 0.6),
      ),
    );

    const head = k.group('head');
    const earFar = k.part('ear-far', (pen) => pen.shape(EAR, darkSkin, { sharp: [2] }));
    const earNear = k.part('ear-near', (pen) =>
      pen.shape(EAR, ink(RIM), { sharp: [2] }, (p) => p.shape([[-2.3, 7], [-5.8, 13], [-5.2, 24], [-1.3, 16]], { fill: mix(PALETTE.violetDeep, PALETTE.violetCore, 0.4), alpha: 0.75 })),
    );
    const skull = k.part('head', (pen) => pen.shape(HEAD, ink(RIM, { gloss: lens([-1, 3.4], 3.6, 1.6, -0.35, PALETTE.violetGlow, 0.28) }), { sharp: [5] }));
    const jaw = k.part('jaw', (pen) => pen.shape(JAW, ink(RIM, { width: 1.4 })));
    const fangU = k.part('fang-up', (pen) => pen.shape([[0, 0], [1, 0], [0.5, -3.2]], { fill: PALETTE.whiteHot, rims: [] }, { sharp: [0, 1, 2], round: 0 }));
    const fangL = k.part('fang-low', (pen) => pen.shape([[0, 0], [1, 0], [0.5, 3.0]], { fill: PALETTE.whiteHot, rims: [] }, { sharp: [0, 1, 2], round: 0 }));
    const eyeN = k.part('eye-n', (pen) => pen.ellipse(0, 0, 1.8, 3).fill(PALETTE.whiteHot));
    const eyeF = k.part('eye-f', (pen) => pen.ellipse(0, 0, 1.4, 2.4).fill(PALETTE.whiteHot));
    const glowN = k.glow(PALETTE.violetGlow, 16, 0);
    const glowF = k.glow(PALETTE.violetGlow, 12, 0);
    const rings = [0, 1, 2].map(() => k.part('shriek', (pen) => pen.arc(0, 0, 10, -0.9, 0.9).stroke(PALETTE.violetGlow, 1.6, 0.9)));
    for (const r of rings) r.blendMode = 'add';

    head.addChild(earFar, skull, jaw, fangU, fangL, earNear, eyeF, eyeN, glowF, glowN, ...rings);
    body.addChild(far.node, ...feet, torso, chest, near.node, cloak, head);

    // the rest pose of the head on the body, and of the eyes on the head
    place(head, 7, 12);
    place(earFar, -1, 5, 0.1, 0.92);
    place(earNear, 1, 5.5);
    place(jaw, 4, -3.3);
    place(fangU, 8.6, -3.5);
    place(fangL, 7.8, -1.1);
    place(eyeN, 5, 2.4);
    place(eyeF, 9.4, 3.2);
    glowN.position.set(5, -2.4);
    glowF.position.set(9.4, -3.2);
    for (const r of rings) place(r, 13, -1.4);
    place(feet[0]!, -2.6, -13.2);
    place(feet[1]!, 2.6, -13.2);

    // ------------------------------------------------------------------------------------------- state
    let flapPhase = k.seed * 7;
    let hz = 3.4;
    let per = 1;
    let pitch = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const hanging = f.anim === 'idle' && f.phase === 'none';
        per = dt > 0 ? damp(per, hanging ? 1 : 0, hanging ? 4.5 : 7, dt) : per;

        // how fast it beats: slow while it opens, quick when it climbs, frantic when it is hit, still while it sleeps
        const wantHz = hanging ? 0.4 : f.anim === 'run' ? 6 : f.anim === 'hurt' ? 8 : f.anim === 'telegraph' ? 1.7 : f.anim === 'attack' ? 0.9 : dead ? 0 : 3.6;
        hz = dt > 0 ? damp(hz, wantHz, 7, dt) : hz;
        flapPhase += dt * hz;
        const fl = Math.sin(flapPhase * TAU);
        const fl2 = Math.sin((flapPhase - 0.09) * TAU);

        // the wings: folded round the body asleep, up and wide for the warning, swept back for the dive, beating otherwise
        const open = easeOut(Math.min(1, f.anim === 'telegraph' ? f.p : hanging ? 0 : 1));
        const beatPhi = 2.3 + 1.0 * fl;
        const beatPhi2 = 2.5 + 1.0 * fl2;
        const raised = 1.32 + 0.1 * Math.sin(f.t * 22) * f.heat;
        const swept = 3.3 + 0.06 * Math.sin(f.t * 40);
        let phiN = beatPhi;
        let phiF = beatPhi2;
        let spN = 0.82 + 0.16 * Math.sin((flapPhase + 0.12) * TAU);
        let spF = spN * 0.96;
        if (f.anim === 'telegraph') {
          phiN = lerp(-1.75, raised, open) + 0.05 * fl;
          phiF = lerp(-1.7, raised + 0.62, open) + 0.05 * fl;
          spN = lerp(0.06, 1, open);
          spF = lerp(0.06, 0.94, open);
        } else if (f.anim === 'attack') {
          phiN = swept - 0.2;
          phiF = swept + 0.15;
          spN = 0.56;
          spF = 0.5;
        } else if (dead) {
          const fold = Math.min(1, f.dying * 3);
          phiN = lerp(beatPhi, -1.1, fold);
          phiF = lerp(beatPhi2, -1.0, fold);
          spN = lerp(0.8, 0.1, fold);
          spF = spN;
        } else if (f.anim === 'hurt') {
          phiN = 1.35 + 0.5 * fl;
          phiF = 1.55 + 0.5 * fl2;
          spN = 1;
          spF = 1;
        }
        const spreadN = lerp(spN, 0.07, per);
        const spreadF = lerp(spF, 0.06, per);
        poseWing(near, [-2.5, 8], [-4.5, -8], lerp(phiN, -1.75, per), spreadN);
        poseWing(far, [-5, 9], [-6.5, -7], lerp(phiF, -1.7, per), spreadF);
        // folded, the wings are a cloak (a leaf of membrane round the body) and not a sheaf of bones
        const wingVis = Math.min(1, Math.max(0, (spreadN - 0.1) / 0.3));
        near.node.visible = far.node.visible = wingVis > 0.02;
        near.node.alpha = far.node.alpha = wingVis;
        const folded = Math.max(per, f.anim === 'telegraph' ? 1 - Math.min(1, open * 1.7) : 0);
        cloak.visible = folded > 0.02;
        cloak.alpha = folded;

        // the body: head down when asleep (it swings up through the front as it wakes), pitched along its path when it flies
        const speed = Math.hypot(f.vx, f.vy);
        const wantPitch = speed > 0.8 ? Math.max(-1.2, Math.min(0.9, Math.atan2(f.vy, Math.max(Math.abs(f.vx), 0.6)) * Math.min(1, speed / 3.5))) : 0;
        pitch = dt > 0 ? damp(pitch, f.anim === 'attack' ? wantPitch * 1.15 : wantPitch * 0.6, 9, dt) : pitch;
        const bob = hanging ? 0.35 * Math.sin(f.t * 1.4) : 2.2 * Math.sin(flapPhase * TAU - 0.9) * (1 - per) * (dead ? 0 : 1);
        const tumble = dead ? f.dying * 7.5 : 0;
        const rot = -Math.PI * per + pitch * (1 - per) - 0.55 * f.hurt + tumble;
        place(body, 0, lerp(HOVER_Y, PERCH_Y, per) + bob, rot);
        // hanging, it looks ahead all the same: the head curls up and sits below the shoulders, on the side it faces
        place(head, lerp(7, -3.5, per), lerp(12, 12.5, per), 0.9 * Math.PI * per);

        // the face: ears forward with the warning and flat when hurt, the jaw open to shriek and to bite
        const mouth = 0.62 * f.heat * (f.anim === 'telegraph' ? 1 : 0.6) + 0.5 * f.strike;
        const earTilt = 0.4 * f.heat - 0.7 * f.hurt - 0.25 * per;
        place(jaw, 4, -3.3, -mouth, 1);
        place(fangL, 7.8 + 0.4 * mouth, -1.1 - 0.6 * mouth, -mouth);
        earNear.rotation = -earTilt;
        earFar.rotation = -(0.1 + earTilt * 0.9);
        const eyeOpen = dead ? 0.1 : lerp(1, 0.14, per) * (1 - 0.8 * f.hurt);
        eyeN.scale.set(1.05 + 0.5 * f.heat, Math.max(0.05, eyeOpen) * (1 + 0.35 * f.heat));
        eyeF.scale.set(1 + 0.45 * f.heat, Math.max(0.05, eyeOpen) * (1 + 0.3 * f.heat));
        const eyeLight = dead ? 0 : (0.3 + 0.9 * f.heat) * eyeOpen;
        glowN.alpha = Math.min(1, eyeLight * 0.8);
        glowF.alpha = Math.min(1, eyeLight * 0.6);
        glowN.scale.set((13 + 12 * f.heat) / glowN.texture.width);
        glowF.scale.set((10 + 9 * f.heat) / glowF.texture.width);

        // rings of sound leave the mouth through the warning
        const shriek = f.anim === 'telegraph' ? Math.min(1, f.p * 2.2) : 0;
        for (let i = 0; i < rings.length; i++) {
          const u = (f.since * 1.7 + i / rings.length) % 1;
          const r = rings[i]!;
          r.visible = shriek > 0.05;
          r.alpha = (1 - u) * 0.9 * shriek;
          r.scale.set(0.55 + u * 2.2);
        }
      },
    };
  },
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
