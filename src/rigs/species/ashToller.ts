import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, scorched } from '../kit/materials';
import { easeIn, easeOut, Spring } from '../kit/motion';
import type { Pen } from '../kit/paint';
import type { RigDef, RigFrame } from '../types';

/**
 * THE ASH TOLLER (docs/PROMPT24-LOG.md): it keeps the bell's job — a rhythm that stays where it stands and sends a wave along the floor each way — and swaps the bell for a GONG: a great disc of dark bronze hung by two cords in a frame of
 * basalt, a coal for a boss with two slits of ember beside it, and a padded mallet on a long arm that swings from the back post. The swing is the warning: the mallet is drawn back — and further — shaking, the cracks in the disc brightening;
 * the toll is the mallet brought across in one stroke and the disc ringing: it shivers, rings of light run over its face and the waves of ash leave along the floor; then the mallet rebounds and the disc rocks still. Dead, the frame falls.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const BRONZE = mix(PALETTE.worldDusk, PALETTE.emberDeep, 0.4);
const BASALT = mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.5);
const DISC_Y = 100;

export const ASH_TOLLER_RIG: RigDef = {
  id: 'ash_toller',
  width: 1.3,
  height: 1.85,
  shadow: 140,
  aura: { color: RIM, at: [0, DISC_Y], size: 230, base: 0.02 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('ash-toller');
    const disc = k.group('disc');
    const mallet = k.group('mallet');
    const stone = scorched(BASALT, RIM, { gloss: lens([-4, 90], 5, 40, 0.04, HOT, 0.12), width: 2.4 });
    const farStone = scorched(mix(BASALT, PALETTE.worldVoid, 0.5), mix(RIM, PALETTE.worldVoid, 0.6), { width: 1.4 });
    const glaze = (p: Pen, pts: Pt[], w = 2): void => {
      p.contour(pts, { closed: false, round: 0.4 }).stroke(DEEP, w + 1.2, 0.95);
      p.contour(pts, { closed: false, round: 0.4 }).stroke(RIM, w, 0.95);
    };

    const post = (key: string, far: boolean) =>
      k.part(key, (pen) => pen.shape([[-11, 0], [-12, 60], [-10, 150], [-12, 172], [12, 172], [10, 150], [12, 60], [11, 0]], far ? farStone : stone, { round: 0.1 }, (p) => {
        if (far) return;
        p.line([-11, 40], [11, 40]).stroke(PALETTE.enemyInk, 1.6, 0.7);
        p.line([-11, 110], [11, 110]).stroke(PALETTE.enemyInk, 1.6, 0.7);
        glaze(p, [[0, 6], [2, 30], [-1, 52]], 1.4);
      }));
    const postFar = post('post-far', true);
    const postNear = post('post-near', false);
    const foot = (key: string, far: boolean) => k.part(key, (pen) => pen.shape([[-22, 0], [-20, 14], [20, 14], [22, 0]], far ? farStone : stone, { round: 0.2 }));
    const footFar = foot('foot-far', true);
    const footNear = foot('foot-near', false);
    const bar = k.part('bar', (pen) =>
      pen.shape([[-72, 0], [-74, 12], [-60, 16], [60, 16], [74, 12], [72, 0], [60, -4], [-60, -4]], stone, { round: 0.2 }, (p) => {
        for (const x of [-60, -20, 20, 60]) p.line([x, -3], [x, 15]).stroke(PALETTE.enemyInk, 1.4, 0.7);
        p.circle(-66, 14, 5).fill(DEEP);
        p.circle(66, 14, 5).fill(DEEP);
      }),
    );
    const cords = [0, 1].map((i) => k.ribbon({ n: 4, width: () => 3.2, color: mix(PALETTE.worldDusk, PALETTE.enemyInk, 0.3), ramp: 'tube', edge: { color: PALETTE.enemyInk, grow: 0.4 } }, `cord${i}`));

    const face = k.part('face', (pen) => {
      pen.shape([[0, 50], [28, 42], [44, 18], [44, -14], [28, -42], [0, -50], [-28, -42], [-44, -14], [-44, 18], [-28, 42]], scorched(BRONZE, RIM, { gloss: lens([-16, 24], 6, 18, 0.5, HOT, 0.16), width: 3 }), { round: 1 }, (p) => {
        // the grooves cast into the face, the rim, and the cracks that run out from the boss
        p.ellipse(0, 0, 33, 40).stroke(mix(BRONZE, PALETTE.enemyInk, 0.5), 2, 0.8);
        p.ellipse(0, 0, 24, 29).stroke(mix(BRONZE, PALETTE.enemyInk, 0.5), 1.4, 0.7);
        glaze(p, [[10, 14], [24, 28], [30, 40]], 1.6);
        glaze(p, [[-12, -10], [-26, -22], [-30, -34]], 1.6);
        glaze(p, [[16, -12], [30, -6], [40, -10]], 1.3);
      });
    });
    const cracks = k.part('cracks', (pen) => {
      glaze(pen, [[10, 14], [24, 28], [30, 40]], 2.4);
      glaze(pen, [[-12, -10], [-26, -22], [-30, -34]], 2.4);
      glaze(pen, [[16, -12], [30, -6], [40, -10]], 2);
      glaze(pen, [[-14, 8], [-28, 16], [-38, 12]], 2);
    });
    cracks.blendMode = 'add';
    const boss = k.part('boss', (pen) => {
      pen.circle(0, 0, 16).fill(mix(BRONZE, PALETTE.enemyInk, 0.4));
      pen.circle(0, 0, 16).stroke(RIM, 1.6, 0.9);
      pen.circle(0, 0, 11).fill(DEEP);
      pen.circle(0, 0, 8).fill(RIM);
      pen.circle(0, 0, 4.4).fill(HOT);
    });
    const slits = [-1, 1].map(() => k.part('slit', (pen) => {
      pen.shape([[-5, 1], [0, 3.4], [5, 1], [0, -2.4]], { fill: HOT, rims: [] }, { round: 0.5 });
    }));
    const bossGlow = k.glow(HOT, 110, 0);
    const shimmer = [0, 1, 2].map(() => k.part('shimmer', (pen) => pen.ellipse(0, 0, 40, 50).stroke(HOT, 2.6, 0.9)));
    for (const s of shimmer) s.blendMode = 'add';
    disc.addChild(face, cracks, boss, ...slits, bossGlow, ...shimmer);

    const handle = k.part('handle', (pen) => pen.shape([[0, 4], [76, 3], [80, -3], [0, -4]], scorched(mix(BASALT, PALETTE.worldSlate, 0.2), RIM, { width: 1.4 }), { round: 0.2 }));
    const head = k.part('mallet-head', (pen) => pen.shape([[0, 13], [14, 14], [22, 0], [14, -14], [0, -13]], scorched(mix(PALETTE.worldMist, PALETTE.enemyInk, 0.5), RIM, { width: 1.6 }), { round: 0.9 }, (p) => p.ellipse(8, 6, 5, 2.4).fill(HOT, 0.2)));
    mallet.addChild(handle, head);
    place(head, 78, 0);

    const wave = [0, 1].map(() => k.part('wave', (pen) => pen.ellipse(0, 0, 60, 8).stroke(RIM, 3, 0.95)));
    for (const w of wave) w.blendMode = 'add';
    const dust = new Motes(k, 10, mix(PALETTE.worldMist, PALETTE.worldNight, 0.4), 16, 0.2);
    const embers = new Motes(k, 10, HOT, 7, 0.6);
    const chunks = [0, 1, 2, 3].map((i) => k.part(`chunk${i}`, (pen) => pen.shape([[0, 0], [16 + i * 3, 5], [20, 22], [4, 16]], stone, { round: 0.2 })));
    for (const c of chunks) c.visible = false;

    root.addChild(footFar, postFar, bar, ...cords, disc, footNear, postNear, mallet, ...wave, dust, embers, ...chunks);
    place(postFar, -52, 0);
    place(postNear, 56, 0);
    place(footFar, -52, 0);
    place(footNear, 56, 0);
    place(bar, 0, 164);
    place(mallet, -78, 126, 1.25);

    const ring = new Spring(0, 160, 4);
    let swing = 0;
    let tolled = 0;

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const toll = f.anim === 'attack';
        const spent = f.phase === 'recovery';

        // the mallet's angle: raised at rest, drawn further back through the swing (shaking), across the disc in the toll, rebounding after
        let want = 1.25 + 0.04 * Math.sin(f.t * 1.4);
        if (wind) want = 1.25 + 0.55 * easeOut(f.p) + Math.sin(f.t * 48) * 0.035 * f.p;
        else if (toll) want = f.p < 0.22 ? 1.8 - 1.75 * easeIn(f.p / 0.22) : 0.05 + 0.5 * easeOut((f.p - 0.22) / 0.78);
        else if (spent) want = 0.55 + 0.7 * easeOut(Math.min(1, f.p * 1.2));
        if (dead) want = 1.25 + 1.5 * easeIn(f.dying);
        swing = dt > 0 ? damp(swing, want, toll && f.p < 0.22 ? 60 : 14, dt) : want;
        const struck = toll && f.p >= 0.2 && tolled < 1;
        if (toll && f.p < 0.05) tolled = 0;
        if (struck) tolled = 1;
        const strike = toll ? Math.max(0, 1 - Math.abs(f.p - 0.22) * 3.4) : 0;
        const ringing = ring.step(toll && f.p > 0.2 ? 0.07 : 0, dt);

        // the frame: stands; the disc hangs from its cords by the crossbar and rocks with the blow
        place(mallet, -78, 126 + (dead ? -20 * f.dying : 0), swing);
        const rock = ringing * 1.6 + (spent ? 0.02 * Math.sin(f.t * 5) * (1 - f.p) : 0) + 0.012 * Math.sin(f.t * 1.2) - 0.1 * f.hurt;
        const shiver = toll ? Math.sin(f.t * 80) * 1.6 * (1 - Math.abs(f.p - 0.22)) * (f.p > 0.2 ? 1 : 0) : spent ? Math.sin(f.t * 60) * 1.2 * Math.max(0, 1 - f.p * 3) : 0;
        place(disc, shiver - 5 * f.hurt + (dead ? 40 * f.dying : 0), DISC_Y - (dead ? 90 * easeIn(f.dying) : 0), rock + (dead ? 1.3 * f.dying : 0), 1 - 0.04 * strike, 1 + 0.03 * strike);
        cords.forEach((c, i) => {
          const topX = i ? 22 : -22;
          const botX = (i ? 14 : -14) * Math.cos(rock) + 0;
          c.setSpine([[topX, 164], [topX * 0.8 + botX * 0.2, 150], [topX * 0.4 + botX * 0.6, 128], [botX + Math.sin(rock) * 6, DISC_Y + 48]]);
          c.visible = !dead || f.dying < 0.3;
        });

        // the face: the cracks brighten with the swing, the boss and the slits too; rings of light run over it with the toll
        const heat = wind ? easeIn(f.p) : toll ? 1 : spent ? 0.3 * (1 - f.p) : 0.12;
        cracks.alpha = Math.min(1, 0.12 + 0.95 * heat);
        place(boss, 0, 0, 0, 1 + 0.18 * heat);
        const open = dead ? 0.1 : 1 - 0.8 * f.hurt;
        slits.forEach((s, i) => {
          place(s, i ? 22 : -22, 26, i ? -0.2 : 0.2, 1 + 0.5 * f.heat, Math.max(0.1, open) * (1 + 0.6 * f.heat));
          s.alpha = 0.35 + 0.65 * Math.min(1, f.heat + 0.1);
        });
        bossGlow.alpha = Math.min(1, 0.1 + 0.9 * heat + 0.5 * strike) * (dead ? 0 : 1);
        bossGlow.scale.set((80 + 80 * heat) / bossGlow.texture.width);
        shimmer.forEach((s, i) => {
          const u = toll ? Math.max(0, Math.min(1, (f.p - 0.2 - i * 0.12) / 0.5)) : spent ? Math.max(0, Math.min(1, (0.3 - f.p * 0.2 + i * 0.1) / 0.6)) : 0;
          s.visible = u > 0.01 && u < 0.999 && toll;
          s.alpha = (1 - u) * 0.9;
          s.scale.set(0.7 + 0.55 * u);
        });

        // the waves of ash leave along the floor each way with the toll
        wave.forEach((w, i) => {
          w.visible = toll && f.p > 0.22 && f.p < 0.99;
          if (w.visible) {
            const u = Math.max(0, Math.min(1, (f.p - 0.22 - i * 0.1) / 0.7));
            w.alpha = (1 - u) * 0.95;
            place(w, 0, 4, 0, 0.5 + 3 * easeOut(u), 0.7 + 0.5 * easeOut(u));
          }
        });
        dust.position.set(0, 0);
        dust.show(f.t, 0, 14, 160, 30, 0.5, (toll && f.p > 0.25 ? 0.6 : 0) + (dead && f.dying > 0.4 ? 0.7 : 0));
        embers.position.set(0, -DISC_Y);
        embers.show(f.t, 0, 0, 80, 100, 0.8, toll ? 0.9 * strike + 0.3 : wind ? 0.4 * f.p : dead ? 0.8 * (1 - f.dying) : 0.08);
        chunks.forEach((c, i) => {
          c.visible = dead && f.dying > 0.1;
          if (c.visible) {
            flung(c, [(i - 1.5) * 30, 150], [(i - 1.5) * 44, 40 + i * 8], (i - 1.5) * 2.6, 200, 2, Math.min(1, (f.dying - 0.1) * 1.4));
            c.alpha = 1 - Math.max(0, (f.dying - 0.7) / 0.3);
          }
        });
        if (dead) {
          const lean = easeIn(f.dying);
          place(postNear, 56 + 40 * lean, 0, -1.2 * lean);
          place(postFar, -52 - 20 * lean, 0, 0.8 * lean);
          postNear.alpha = postFar.alpha = bar.alpha = 1 - Math.max(0, (f.dying - 0.6) / 0.4);
        } else {
          place(postFar, -52, 0);
          place(postNear, 56, 0);
          postNear.alpha = postFar.alpha = bar.alpha = 1;
        }
      },
    };
  },
};
