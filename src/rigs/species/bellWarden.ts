import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Motes, flung } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { lens, solid } from '../kit/materials';
import { easeIn, easeOut, TAU, tentacle } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE BELL WARDEN (docs/PROMPT24-LOG.md): the guardian of the spire is a bell that has learned to fly — a great bell of pale metal with a crown of spikes and a face of two heavy-lidded eyes on its shoulder, hung in the air with a ring of
 * little bells that orbit it and chains that dangle from its skirt. It is the only guardian that hovers, and what it drops is the CLAPPER: a dark weight of metal on a rod that hangs inside it, below its lip; shut it is a shadow in the mouth of the bell,
 * and when the Warden is spent it comes down out of the bell and BURNS — a ball of light on its rod, swaying, ringing softly — and that is the place to strike. The dive is the whole bell tipped nose-down and let fall, the little bells streaming
 * after it; the toll is a pendulum swing and the satellites ringing one after the other, each throwing its wave; the chime is the satellites rising and flashing as the columns come up from the floor. Dead, it falls and is struck by the floor, once, and the little bells scatter.
 */

const METAL = mix(PALETTE.worldMist, PALETTE.worldHaze, 0.35);
const RIM = PALETTE.worldGlow;
const HALO = PALETTE.violetGlow;
const DARK = PALETTE.worldNight;
const BELL: readonly Pt[] = [[-104, 40], [-98, 58], [-74, 112], [-54, 166], [-34, 204], [0, 220], [34, 204], [54, 166], [74, 112], [98, 58], [104, 40]];
const SMALL: readonly Pt[] = [[-30, 0], [-26, 14], [-14, 44], [-6, 64], [0, 70], [6, 64], [14, 44], [26, 14], [30, 0]];

export const BELL_WARDEN_RIG: RigDef = {
  id: 'boss_bell_warden',
  width: 2.4,
  height: 2.2,
  aura: { color: HALO, at: [0, 120], size: 480, base: 0.05 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('bell-warden');
    const bellG = k.group('bell');
    const metal = solid(METAL, RIM, { ramp: 'cap', edge: DARK, width: 4 });

    const chains = k.ribbon({ n: 7, count: 4, width: (u) => 8 * (1 + 0.3 * Math.cos(u * TAU * 5)), color: mix(PALETTE.worldMist, DARK, 0.5), ramp: 'tube', edge: { color: DARK, grow: 0.8 }, rim: { color: RIM, width: 1.4, alpha: 0.8 } }, 'chains');
    const clapper = k.part('clapper', (pen) => {
      pen.line([0, 120], [0, 0]).stroke(DARK, 9, 1);
      pen.line([0, 120], [0, 0]).stroke(mix(METAL, DARK, 0.5), 4, 1);
      pen.shape([[-30, 0], [-34, -22], [-20, -50], [0, -58], [20, -50], [34, -22], [30, 0]], solid(mix(METAL, DARK, 0.55), RIM, { ramp: 'sphere', edge: DARK, width: 2.4 }), { round: 1 });
    });
    const clapperGlow = k.glow(HALO, 160, 0);
    const clapperCore = k.part('clapper-core', (pen) => {
      pen.shape([[-26, 0], [-30, -20], [-18, -44], [0, -50], [18, -44], [30, -20], [26, 0]], { fill: mix(PALETTE.violetDeep, HALO, 0.55), rims: [], alpha: 0.95 }, { round: 1 });
      pen.circle(0, -22, 14).fill(PALETTE.whiteHot);
    });
    const bell = k.part('bell', (pen) =>
      pen.shape(BELL, { ...metal, gloss: lens([-46, 120], 7, 80, 0.06, PALETTE.whiteHot, 0.2).concat(lens([40, 170], 4, 24, 0.1, PALETTE.whiteHot, 0.1)) }, { round: 0.7 }, (p) => {
        const band = mix(METAL, DARK, 0.45);
        p.contour([[-102, 48], [-52, 44], [0, 43], [52, 44], [102, 48]], { closed: false }).stroke(band, 6, 0.9);
        p.contour([[-86, 84], [-44, 80], [0, 79], [44, 80], [86, 84]], { closed: false }).stroke(band, 3.4, 0.8);
        p.contour([[-58, 150], [-30, 146], [0, 145], [30, 146], [58, 150]], { closed: false }).stroke(band, 3.4, 0.8);
        p.contour([[-38, 196], [0, 192], [38, 196]], { closed: false }).stroke(band, 2.6, 0.7);
        p.contour([[50, 42], [44, 70], [58, 96], [50, 124]], { closed: false, round: 0 }).stroke(DARK, 2.6, 0.85);
        p.ellipse(-70, 90, 14, 5).fill(mix(PALETTE.worldGlow, PALETTE.worldSlate, 0.5), 0.35);
      }),
    );
    const mouth = k.part('mouth', (pen) => {
      pen.ellipse(0, 0, 104, 15).fill(PALETTE.enemyInk);
      pen.ellipse(0, 0, 104, 15).stroke(RIM, 3, 0.9);
    });
    const crown = k.part('crown', (pen) => {
      pen.shape([[-22, 0], [-16, 16], [0, 22], [16, 16], [22, 0]], metal, { round: 0.6 });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        pen.hard([[-6 + Math.sin(a) * 14, 14], [Math.sin(a) * 52, 40 + Math.cos(a) * 24], [6 + Math.sin(a) * 14, 14]]).fill(mix(METAL, RIM, 0.35));
      }
      pen.circle(0, 40, 14).stroke(DARK, 6, 1);
      pen.circle(0, 40, 14).stroke(METAL, 3.4, 1);
    });
    const lid = (i: number) => k.part(`lid${i}`, (pen) => pen.shape([[-14, 0], [-14, 14], [0, 18], [14, 14], [14, 0]], solid(mix(METAL, DARK, 0.25), RIM, { ramp: 'vert', edge: DARK, width: 1.6 }), { round: 0.7 }));
    const eyes = [0, 1].map(() => k.part('eye', (pen) => {
      pen.ellipse(0, 0, 12, 14).fill(PALETTE.whiteHot);
      pen.ellipse(1.6, 0, 4.4, 12.4).fill(DARK);
    }));
    const lids = [lid(0), lid(1)];
    const eyeGlow = k.glow(HALO, 110, 0);
    const beacon = new Beacon(k, HALO, 280, PALETTE.whiteHot);
    const sats = Array.from({ length: 6 }, (_, i) => k.part(`sat${i}`, (pen) => pen.shape(SMALL, metal, { round: 0.7 }, (p) => {
      p.contour([[-24, 12], [0, 10], [24, 12]], { closed: false }).stroke(mix(METAL, DARK, 0.45), 2.2, 0.85);
      p.circle(0, 72, 5).stroke(DARK, 3, 1);
    })));
    const satGlow = sats.map(() => k.glow(HALO, 70, 0));
    const rings = [0, 1, 2].map(() => k.part('wave', (pen) => pen.ellipse(0, 0, 70, 9).stroke(HALO, 3.4, 0.95)));
    for (const r of rings) r.blendMode = 'add';
    const dust = new Motes(k, 12, mix(PALETTE.worldHaze, PALETTE.worldMist, 0.4), 22, 0.2);
    const bits = Array.from({ length: 8 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [24 + i * 2, 6], [30, 36], [6, 28]], metal, { round: 0.2 })));
    for (const b of bits) b.visible = false;

    bellG.addChild(clapper, clapperCore, clapperGlow, bell, mouth, crown, ...eyes, ...lids, eyeGlow, beacon);
    // the little bells orbit it: the ones on the far side of the orbit are behind the bell, the near ones in front of it
    const satsBack = k.group('sats-back');
    const satsFront = k.group('sats-front');
    satsFront.addChild(...sats);
    root.addChild(satsBack, chains, bellG, satsFront, ...satGlow, ...rings, dust, ...bits);
    place(mouth, 0, 42);

    const opening = new Opening();
    const waking = new Waking();
    let heat = 0;
    let orbit = k.seed * 6;
    let swing = 0;

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
        const dive = key === 'dive';
        const toll = key === 'toll';
        const chime = key === 'chime';

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.5 * second, roar), 10, dt) : heat;
        orbit += dt * (0.5 + 0.35 * second + (wind ? 1.6 * f.p : 0) + (strike && chime ? 2 : 0) - 0.3 * open);
        const wantSwing = toll ? (wind ? 0.12 * f.p * Math.sin(f.t * 5) + 0.3 * easeIn(f.p) : strike ? 0.34 * Math.cos(f.p * 9) * (1 - f.p * 0.6) : 0) : 0;
        swing = dt > 0 ? damp(swing, wantSwing, 18, dt) : wantSwing;

        // the bell: hung in the air, a slow bob; tipped nose-down along its path in the dive; a pendulum in the toll; tilted back to show its mouth when spent
        const speed = Math.hypot(f.vx, f.vy);
        const pitchDive = dive && (strike || wind) ? Math.max(-0.7, Math.min(0.5, Math.atan2(f.vy, Math.max(0.5, Math.abs(f.vx))) * Math.min(1, speed / 6))) : 0;
        const bob = 5 * Math.sin(f.t * 1.2) * (1 - awake * 0.0) - (dead ? 0 : 0);
        const by = bob - 14 * open - (wind && dive ? -10 * f.p : 0) - (dead ? 130 * easeIn(f.dying) : 0);
        const shake = (roar * 6 + 5 * f.hurt) * Math.sin(f.t * 66) * 0.4 + (wind ? Math.sin(f.t * 54) * 1.8 * f.p : 0);
        place(bellG, shake, by, swing + pitchDive * 0.9 + 0.24 * open + 0.08 * Math.sin(f.t * 0.9) * (1 - open) + (dead ? 1.2 * easeIn(f.dying) : 0) - 0.1 * f.hurt, 1 + (dive && strike ? -0.05 : 0), 1 + (dive && strike ? 0.08 : 0));
        place(crown, 0, 218);

        // the clapper: a shadow in the mouth while it is shut; down out of the bell and ablaze when it is spent
        const drop = open;
        place(clapper, 0, 62 - 70 * drop + 4 * Math.sin(f.t * 3) * drop, 0.1 * Math.sin(f.t * 2) * (0.4 + drop), 1 + 0.25 * drop, 1 + 0.25 * drop);
        clapper.alpha = 1;
        clapperCore.alpha = open;
        place(clapperCore, 0, 62 - 70 * drop + 4 * Math.sin(f.t * 3) * drop, 0.1 * Math.sin(f.t * 2) * (0.4 + drop), 1 + 0.25 * drop, 1 + 0.25 * drop);
        clapperGlow.position.set(0, -(30 - 70 * drop));
        clapperGlow.alpha = Math.min(1, 0.05 * awake + open * 0.95 + 0.4 * (toll && strike ? 1 : 0)) * (dead ? 0 : 1);
        clapperGlow.scale.set((120 + 100 * open) / clapperGlow.texture.width);
        beacon.show(f.t, [0, 40 - 70 * drop + by * 0], open, 0);
        beacon.position.y += 0;

        // the face: heavy-lidded while it waits, wide in the fight, shut in pain
        const lidDown = dead ? 1 : Math.max(0, 0.6 * (1 - awake) + 0.35 - 0.6 * heat - 0.3 * awake) + 0.8 * f.hurt;
        eyes.forEach((e, i) => {
          place(e, i ? 44 : 12, 148, 0, 1 + 0.15 * heat, 1 + 0.15 * heat);
          place(lids[i]!, i ? 44 : 12, 148 + 14 - 14 * (1 - Math.min(1, lidDown)) * 1.0, 0, 1.2, Math.max(0.05, 0.3 + 1.1 * lidDown));
          e.alpha = 0.5 + 0.5 * awake;
        });
        eyeGlow.position.set(28, -148);
        eyeGlow.alpha = Math.min(1, awake * (0.2 + 0.8 * f.heat) + 0.4 * second + roar) * (1 - lidDown * 0.8) * (dead ? 0 : 1);
        eyeGlow.scale.set((100 + 80 * heat) / eyeGlow.texture.width);

        // the little bells: a ring of six that orbit it; they flash and ring one after the other in the toll, rise and flash with the chime, trail the dive
        sats.forEach((s, i) => {
          const a = orbit + (i / 6) * TAU;
          const rx = 168 + 20 * Math.sin(f.t * 0.7 + i) + (chime && (wind || strike) ? 10 : 0);
          const depth = Math.sin(a);
          let x = Math.cos(a) * rx;
          // the orbit is tilted: the near pass swings low, across the skirt, clear of the face; the far pass goes behind the crown
          let y = 112 - depth * 46 + 10 * Math.sin(a * 2) + (chime && wind ? 50 * f.p : 0) + (chime && strike ? 50 : 0);
          if (dive && strike) {
            x -= f.vx * 4 * (1 + i * 0.2) * 0;
            y += 20 * (i % 2 ? 1 : -1);
          }
          const holder = depth > 0 ? satsFront : satsBack;
          if (s.parent !== holder) holder.addChild(s);
          const sc = 0.46 + 0.12 * depth;
          const pop = toll && strike ? Math.max(0, 1 - Math.abs(f.p * 6 - i) * 0.6) : chime && strike ? 1 - f.p : 0;
          place(s, x + shake, y + by, 0.1 * Math.sin(f.t * 2 + i) + (pop > 0 ? 0.4 * Math.sin(f.t * 40) * pop : 0), sc * (1 + 0.15 * pop), sc * (1 + 0.15 * pop));
          s.alpha = (0.65 + 0.35 * (depth + 1) / 2) * (dead ? 1 - Math.min(1, f.dying * 1.4) : awake);
          const g = satGlow[i]!;
          g.position.set(x + shake, -(y + by - 14));
          g.alpha = Math.min(1, pop * 0.95 + 0.1 * second) * (dead ? 0 : 1);
          g.scale.set((50 + 60 * pop) / g.texture.width);
        });

        // the chains that dangle from the skirt
        for (let i = 0; i < 4; i++) {
          const x = -72 + i * 48;
          const pts = tentacle([x, 44 + by], -Math.PI / 2 + 0.06 * Math.sin(f.t * 1.1 + i), 70 + 12 * (i % 2) + 16 * open, 7, 0.25 * Math.sin(f.t * 1.4 + i), 0.12, f.t * 1.6 + i * 1.3);
          chains.setLine(i, pts);
        }
        chains.commit();
        chains.alpha = dead ? 1 - f.dying : awake;

        // the toll: a wave runs out along the floor each way for every strike of the satellites (the floor is far below: they are drawn at the foot of the picture)
        rings.forEach((r, i) => {
          r.visible = toll && strike && f.p > 0.1 * i;
          if (r.visible) {
            const u = Math.max(0, Math.min(1, f.p - i * 0.12));
            r.alpha = (1 - u) * 0.9;
            place(r, 0, -300, 0, 0.5 + 3.4 * easeOut(u), 0.8 + 0.6 * u);
          }
        });
        dust.position.set(0, -50);
        dust.show(f.t, 0, 0, 220, 60, 0.4, (dive && strike ? 0.6 : 0) + (dead && f.dying > 0.5 ? 0.9 : 0) + roar * 0.4);
        bits.forEach((b, i) => {
          b.visible = dead && f.dying > 0.5;
          if (b.visible) {
            const u = Math.min(1, (f.dying - 0.5) * 2);
            flung(b, [(i - 3.5) * 24, 120 + by], [(i - 3.5) * 40, 90 + i * 6], (i - 3.5) * 2.8, 600, -300, u);
            b.alpha = 1 - Math.max(0, (f.dying - 0.8) / 0.2);
          }
        });
        bell.alpha = crown.alpha = mouth.alpha = dead ? 1 - Math.max(0, (f.dying - 0.6) / 0.4) * 0.9 : awake * 0.3 + 0.7;
      },
    };
  },
};
