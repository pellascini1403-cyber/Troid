import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Leg, Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { solid } from '../kit/materials';
import { easeOut, footCycle, TAU } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE CRYSTAL SHARD (docs/PROMPT24-LOG.md): the small, fast one — a splinter of crystal that scuttles on six needle legs, one bright eye in its facet, always trembling a little because it is too alive to be still. It is the creature
 * that the Shardling leaves behind, so it is made of the same stuff in a handful of cuts: a faceted wedge for a body, a prism for a head, six legs, and glints that fly off it. Where the big ones telegraph with a slow curl, this one
 * has no time: it rattles, its facets flash, and it darts. Dead, it bursts into glitter.
 */

const CRYSTAL = mix(PALETTE.worldHaze, PALETTE.worldGlow, 0.45);
const RIM = PALETTE.whiteHot;
const BODY: readonly Pt[] = [[-17, 9], [-8, 22], [6, 24], [19, 14], [22, 6], [11, 0], [-9, 1]];

export const CRYSTAL_SHARD_RIG: RigDef = {
  id: 'crystal_shard',
  width: 0.6,
  height: 0.45,
  shadow: 52,
  aura: { color: PALETTE.violetGlow, at: [0, 14], size: 90, base: 0.1 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('crystal-shard');
    const body = k.group('body');
    const facet = solid(CRYSTAL, RIM, { ramp: 'vert', edge: mix(PALETTE.worldSlate, PALETTE.enemyInk, 0.6), width: 1.8 });
    const farFacet = solid(mix(CRYSTAL, PALETTE.worldSlate, 0.55), mix(RIM, PALETTE.worldSlate, 0.5), { ramp: 'vert', edge: PALETTE.enemyInk, width: 1 });
    const foot = (pen: Pen, l2: number): void => {
      pen.hard([[l2 - 1, 1.6], [l2 + 5, 0], [l2 - 1, -1.6]]).fill(CRYSTAL);
    };
    const mk = (i: number) => new Leg(k, `leg${i}`, { l1: 8, l2: 9, w0: 3.6, w1: 2.8, w2: 1.6, mat: i < 3 ? farFacet : facet, foot });
    const legs = [0, 1, 2, 3, 4, 5].map(mk);
    const torso = k.part('torso', (pen) =>
      pen.shape(BODY, facet, { sharp: [1, 3], round: 0.35 }, (p) => {
        p.hard([[-12, 8], [-5, 21], [3, 10]]).fill(RIM, 0.32);
        p.hard([[8, 22], [19, 13], [10, 6]]).fill(PALETTE.worldSlate, 0.3);
        p.hard([[-2, 4], [6, 22], [14, 8]]).fill(PALETTE.violetGlow, 0.18);
        p.line([-14, 9], [16, 12]).stroke(PALETTE.violetGlow, 1, 0.6);
      }),
    );
    const head = k.part('head', (pen) => pen.shape([[-5, -3], [-3, 6], [8, 9], [16, 4], [14, -4], [3, -6]], facet, { sharp: [3] }, (p) => p.hard([[-2, 4], [8, 8], [3, 0]]).fill(RIM, 0.35)));
    const spikes = [0, 1, 2].map((i) => k.part(`spike${i}`, (pen) => pen.hard([[-3, 0], [0, 10 + i * 3], [3, 0]]).fill(mix(CRYSTAL, RIM, 0.4))));
    const eye = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 3.4, 3.8).fill(PALETTE.whiteHot);
      pen.ellipse(0.8, 0, 1.4, 3.4).fill(PALETTE.enemyInk);
    });
    const eyeGlow = k.glow(PALETTE.violetGlow, 24, 0);
    const flash = k.glow(PALETTE.whiteHot, 50, 0);
    const glitter = new Motes(k, 10, PALETTE.whiteHot, 6, 0.8);
    const bits = [0, 1, 2, 3, 4, 5].map((i) => k.part(`bit${i}`, (pen) => pen.hard([[0, 0], [4 + i % 3, 3], [2, 9 + i % 2 * 3], [-3, 4]]).fill(CRYSTAL)));
    for (const b of bits) b.visible = false;

    body.addChild(torso, ...spikes, head, eye, eyeGlow, flash, glitter, ...bits);
    root.addChild(legs[0]!.root, legs[1]!.root, legs[2]!.root, body, legs[3]!.root, legs[4]!.root, legs[5]!.root);
    spikes.forEach((s, i) => place(s, -8 + i * 8, 22 - i * 0.5 - (i === 2 ? 3 : 0), -0.2 + i * 0.25));

    let walk = k.seed * 3;
    let hop = 0;
    let tremble = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const dart = f.anim === 'attack';
        const moving = (Math.abs(f.vx) > 0.2 || dart) && !dead;

        walk += dt * (dart ? 6 : moving ? 1.4 + Math.abs(f.vx) * 0.7 : 0);
        tremble = dt > 0 ? damp(tremble, wind ? 1 : dart ? 0.4 : 0.18, 14, dt) : tremble;
        hop += dt * (moving ? 6.5 : 0);
        const jig = Math.sin(f.t * 47) * 0.45 * tremble + Math.sin(f.t * 31 + 1) * 0.35 * tremble;
        const bounce = moving ? 2.4 * Math.abs(Math.sin(hop)) : 0;
        const lean = (dart ? -0.12 : 0) + (wind ? 0.1 * f.p : 0) - 0.25 * f.hurt - (dead ? 0.6 * f.dying : 0);
        place(body, jig - 3 * f.hurt, 14 + bounce + (wind ? -3 * f.p : 0) + (dead ? -10 * easeOut(f.dying) : 0), lean, 1 + (dart ? 0.12 : 0), 1 + (wind ? -0.08 * f.p : 0) - (dead ? 0.6 * f.dying : 0));
        place(head, 20, 8 + (f.anim === 'alert' ? 3 * (1 - f.p) : 0), -0.05 + (wind ? 0.15 * f.p : 0));
        place(eye, 25, 12, 0, 1 + 0.45 * f.heat, Math.max(0.1, 1 - 0.85 * f.hurt) * (1 + 0.3 * f.heat));
        eyeGlow.position.set(26, -12);
        eyeGlow.alpha = Math.min(1, 0.25 + 0.85 * f.heat) * (dead ? 0 : 1);
        eyeGlow.scale.set((18 + 22 * f.heat) / eyeGlow.texture.width);
        // the facets flash through the warning: a white pulse on the whole body that quickens
        flash.position.set(2, -14);
        flash.alpha = wind ? 0.35 + 0.55 * Math.abs(Math.sin(f.t * (14 + 22 * f.p))) * f.p : 0;
        flash.scale.set((46 + 30 * f.heat) / flash.texture.width);
        spikes.forEach((s, i) => (s.rotation = -(-0.2 + i * 0.25) - 0.18 * f.heat * (i - 1) + 0.05 * Math.sin(f.t * 40 + i) * tremble));

        // six needle legs, three a side, scuttling out of step
        const hips = [-10, 2, 12] as const;
        legs.forEach((leg, i) => {
          const far = i < 3;
          const c = footCycle(walk + (i % 2 ? 0 : 0.5) + (far ? 0.25 : 0), 9, 5);
          const hipH = 12 + bounce;
          leg.root.position.set(hips[i % 3]! + (far ? -2 : 0), -hipH);
          leg.reach((moving ? c.x : 0) + (far ? 6 : 3) - (wind ? 2 : 0), -hipH + 2 + (moving ? c.y : 0) + (dead ? 5 * f.dying : 0), i % 3 === 0 ? -1 : 1);
        });

        // the glints that fly off it, and what it breaks into
        glitter.position.set(0, -14);
        glitter.show(f.t, 0, 0, 50, 40, 1.2, wind ? 0.5 * f.p : dart ? 0.7 : dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.6 : 0.12);
        bits.forEach((b, i) => {
          b.visible = dead && f.dying > 0.05;
          if (b.visible) {
            const a = (i / 6) * TAU;
            flung(b, [0, 12], [Math.cos(a) * 36, 26 + Math.sin(a) * 18], 4 + i, 150, 2, Math.min(1, (f.dying - 0.05) * 1.5));
            b.alpha = 1 - Math.max(0, (f.dying - 0.6) / 0.4);
          }
        });
        if (dead) {
          const gone = Math.min(1, f.dying * 2.2);
          torso.alpha = head.alpha = 1 - gone;
        } else torso.alpha = head.alpha = 1;
      },
    };
  },
};
