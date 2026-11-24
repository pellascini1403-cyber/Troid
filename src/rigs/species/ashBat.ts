import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Motes } from '../kit/features';
import { place, type Kit } from '../kit/kit';
import { ink, lens } from '../kit/materials';
import { easeOut, TAU, tentacle } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE ASH BAT (docs/PROMPT24-LOG.md): it has the brain of the cave bat — it hangs from the roof, it wakes, it dives, it hovers spent, it climbs back — and none of its body: a MOTH of ash. A fuzzy spindle of a body, a big head with two
 * coal eyes and feathered antennae, four broad powdery wings the colour of cold ash with an eye of ember painted on each. Asleep it hangs upside down with its wings folded up over its back like a leaf; the wake opens them wide and the
 * eyes on the wings LIGHT — it looks back at you with four eyes —; the dive is the wings swept in; and every beat of them shakes ash into the air, which falls. Dead, the wings crumble to ash.
 */

const RIM = PALETTE.emberCore;
const HOT = PALETTE.emberHot;
const DEEP = PALETTE.emberDeep;
const ASH = mix(PALETTE.worldMist, PALETTE.worldNight, 0.55);
const ASH_DARK = mix(PALETTE.worldNight, PALETTE.worldDusk, 0.4);
const HOVER_Y = 30;
const PERCH_Y = 44;
const R = 84; // reach of a forewing, cm
/** Points on the outline of a wing (the more of them, the rounder the lobe). */
const N_OUT = 25;

/** The outline of a broad wing as a fan from the shoulder: `phi` where it points, `s` how open (0 shut, 1 spread), with a scalloped edge. */
function wingOutline(phi: number, s: number, reach: number, out: Pt[]): Pt[] {
  out.length = 0;
  const half = 0.25 + 0.95 * s; // half the width of the fan, radians
  const n = N_OUT - 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n; // 0 leading edge → 1 trailing edge
    const a = phi + half - 2 * half * u;
    // the edge is a lobe with scallops: longest toward the tip, short toward the body, a notch between each scallop
    const lobe = 0.6 + 0.4 * Math.sin(u * Math.PI) ** 0.8;
    const scallop = 1 - 0.09 * (0.5 - 0.5 * Math.cos(u * TAU * 3));
    const r = reach * lobe * scallop * (0.62 + 0.38 * s);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

export const ASH_BAT_RIG: RigDef = {
  id: 'ash_bat',
  width: 1,
  height: 0.6,
  aura: { color: RIM, at: [0, HOVER_Y], size: 150, base: 0.06 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('ash-bat');
    const body = k.group('body');
    const fuzz = ink(RIM, { fill: mix(PALETTE.enemyInk, PALETTE.worldDusk, 0.4), width: 1.8, gloss: lens([-2, 7], 5, 2, -0.3, HOT, 0.18) });

    // a wing is a patch (the scalloped membrane of ash), its veins, and the eye of ember painted on it
    const wing = (tag: string, tint: number) => {
      const patch = k.patch({ n: N_OUT + 1, color: tint, ramp: 'soft', alpha: 0.97 }, `${tag}-patch`);
      const veins = k.ribbon({ n: 3, count: 4, width: (u) => 1.8 - 1.1 * u, color: mix(tint, DEEP, 0.5), ramp: 'flat', alpha: 0.7 }, `${tag}-veins`);
      const edge = k.ribbon({ n: N_OUT + 1, width: () => 1.7, color: RIM, ramp: 'flat', alpha: 0.7 }, `${tag}-edge`);
      const eyespot = k.part(`${tag}-eyespot`, (pen) => {
        pen.circle(0, 0, 9).fill(mix(PALETTE.enemyInk, DEEP, 0.4));
        pen.circle(0, 0, 6.6).fill(DEEP);
        pen.circle(0, 0, 4.6).fill(RIM);
        pen.circle(0, 0, 2.5).fill(HOT);
        pen.circle(-1, 1, 1).fill(PALETTE.whiteHot, 0.8);
      });
      const glow = k.glow(HOT, 30, 0);
      const node = k.group(`${tag}-wing`);
      node.addChild(patch, veins, edge, eyespot, glow);
      return { node, patch, veins, edge, eyespot, glow };
    };
    const hindFar = wing('hind-far', mix(ASH_DARK, PALETTE.enemyInk, 0.4));
    const foreFar = wing('fore-far', mix(ASH, PALETTE.enemyInk, 0.45));
    const hindNear = wing('hind-near', ASH_DARK);
    const foreNear = wing('fore-near', ASH);
    const dustA = new Motes(k, 10, mix(PALETTE.worldMist, PALETTE.worldHaze, 0.3), 7, 0.1);

    const torso = k.part('torso', (pen) => pen.shape([[-4, 16], [8, 10], [11, -2], [7, -16], [-2, -22], [-9, -12], [-10, 2]], fuzz, { round: 1.1 }, (p) => {
      // the tufts of fuzz down the thorax
      for (let i = 0; i < 5; i++) p.hard([[5 - i * 0.5, 10 - i * 6], [11 + 4 - i, 8 - i * 6], [6, 5 - i * 6]]).fill(mix(ASH_DARK, PALETTE.worldMist, 0.3), 0.8);
    }));
    const head = k.group('head');
    const skull = k.part('skull', (pen) => pen.shape([[-8, 0], [-6, 8], [3, 10], [11, 4], [11, -4], [3, -8], [-5, -6]], fuzz, { round: 1 }));
    const eyeBig = k.part('eye', (pen) => {
      pen.ellipse(0, 0, 4.6, 5.4).fill(DEEP);
      pen.ellipse(0, 0, 3.4, 4.2).fill(HOT);
      pen.ellipse(-1, 1.4, 1.2, 1.4).fill(PALETTE.whiteHot, 0.9);
    });
    const eyeGlow = k.glow(HOT, 30, 0);
    const antennae = [0, 1].map((i) => k.ribbon({ n: 6, width: (u) => 2.4 - 1.8 * u, color: mix(ASH, PALETTE.enemyInk, 0.2), ramp: 'tube', rim: { color: RIM, width: 0.8, alpha: 0.9 } }, `antenna${i}`));
    const legs = k.part('legs', (pen) => {
      for (const x of [-3, 2, 7]) pen.contour([[x, -20], [x + 1, -28], [x - 2, -34]], { closed: false }).stroke(PALETTE.enemyInk, 2.4, 1);
    });

    head.addChild(skull, eyeBig, eyeGlow);
    body.addChild(hindFar.node, foreFar.node, legs, torso, ...antennae, head, hindNear.node, foreNear.node);
    root.addChild(body, dustA);
    place(skull, 0, 0);
    place(eyeBig, 5, 1);
    eyeGlow.position.set(5, -1);

    const outline: Pt[] = [];
    let flap = k.seed * 7;
    let hz = 3;
    let per = 1;
    let pitch = 0;
    const shoulder: Pt = [-2, 6];

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const hanging = f.anim === 'idle' && f.phase === 'none';
        per = dt > 0 ? damp(per, hanging ? 1 : 0, hanging ? 4 : 7, dt) : per;
        const wantHz = hanging ? 0.35 : f.anim === 'run' ? 5.5 : f.anim === 'hurt' ? 7 : f.anim === 'telegraph' ? 1.4 : f.anim === 'attack' ? 1.2 : dead ? 0.3 : 3.2;
        hz = dt > 0 ? damp(hz, wantHz, 6, dt) : hz;
        flap += dt * hz;
        const fl = Math.sin(flap * TAU);
        const fl2 = Math.sin((flap - 0.1) * TAU);

        // the wings: folded up over the back asleep, spread wide and level for the wake (the eyes light), swept back for the dive, beating otherwise
        const open = easeOut(Math.min(1, f.anim === 'telegraph' ? f.p : hanging ? 0 : 1));
        let phiF = 1.9 + 0.95 * fl;
        let phiH = 2.7 + 0.8 * fl2;
        let sF = 0.78 + 0.18 * Math.sin((flap + 0.1) * TAU);
        let sH = sF * 0.9;
        if (f.anim === 'telegraph') {
          phiF = 2.0 - 0.0 * open + 0.06 * fl;
          phiH = 2.8;
          sF = 0.1 + 0.9 * open;
          sH = 0.1 + 0.8 * open;
        } else if (f.anim === 'attack') {
          phiF = 2.95;
          phiH = 3.3;
          sF = 0.5;
          sH = 0.45;
        } else if (dead) {
          const fold = Math.min(1, f.dying * 2.4);
          phiF = 1.9 + (-0.4 - 1.9) * fold;
          phiH = 2.7 + (-0.5 - 2.7) * fold;
          sF = 0.8 * (1 - fold) + 0.1;
          sH = sF;
        } else if (f.anim === 'hurt') {
          phiF = 1.4 + 0.6 * fl;
          phiH = 2.2 + 0.5 * fl2;
          sF = 1;
          sH = 0.9;
        }
        const fold = (a: number, b: number): number => a + (b - a) * per;
        const setWing = (w: ReturnType<typeof wing>, phi: number, s: number, reach: number, foreWing: boolean, far: boolean): void => {
          const o = wingOutline(phi, s, reach, outline);
          const pts: Pt[] = [[0, 0], ...o.map((p) => [p[0], p[1]] as Pt)];
          const poly = pts.slice(0, N_OUT + 1).map((p) => [shoulder[0] + p[0], shoulder[1] + p[1]] as Pt);
          w.patch.setPolygon(poly, [shoulder[0], shoulder[1]]);
          const tips = [0.2, 0.45, 0.65, 0.88].map((u) => poly[Math.min(N_OUT, Math.round(u * N_OUT))]!);
          tips.forEach((t, i) => w.veins.setLine(i, [shoulder, [(shoulder[0] + t[0]) / 2, (shoulder[1] + t[1]) / 2], t]));
          w.veins.commit();
          w.edge.setSpine(poly);
          const c = poly[Math.round(N_OUT / 2)]!;
          place(w.eyespot, shoulder[0] + (c[0] - shoulder[0]) * 0.74, shoulder[1] + (c[1] - shoulder[1]) * 0.74, phi, 0.6 + 0.5 * s * (foreWing ? 1 : 0.8), 0.6 + 0.5 * s * (foreWing ? 1 : 0.8));
          w.eyespot.visible = s > 0.35;
          const lit = (f.anim === 'telegraph' ? easeOut(f.p) : f.anim === 'attack' ? 1 : 0.18) * (far ? 0.7 : 1) * (s > 0.35 ? 1 : 0);
          w.glow.position.set(w.eyespot.position.x, w.eyespot.position.y);
          w.glow.alpha = Math.min(1, lit) * (dead ? 0 : 1);
          w.glow.scale.set((24 + 26 * lit) / w.glow.texture.width);
        };
        const reachF = R * (1 - 0.0 * per);
        setWing(hindFar, fold(phiH + 0.15, 1.7), fold(sH * 0.9, 0.12), R * 0.62, false, true);
        setWing(foreFar, fold(phiF + 0.2, 1.65), fold(sF * 0.95, 0.12), reachF * 0.95, true, true);
        setWing(hindNear, fold(phiH, 1.6), fold(sH, 0.14), R * 0.66, false, false);
        setWing(foreNear, fold(phiF, 1.55), fold(sF, 0.16), reachF, true, false);

        const speed = Math.hypot(f.vx, f.vy);
        const wantPitch = speed > 0.8 ? Math.max(-1.1, Math.min(0.8, Math.atan2(f.vy, Math.max(Math.abs(f.vx), 0.6)) * Math.min(1, speed / 3.5))) : 0;
        pitch = dt > 0 ? damp(pitch, f.anim === 'attack' ? wantPitch * 1.1 : wantPitch * 0.55, 8, dt) : pitch;
        const bob = hanging ? 0.4 * Math.sin(f.t * 1.2) : 2.6 * Math.sin(flap * TAU - 0.8) * (1 - per) * (dead ? 0 : 1);
        const tumble = dead ? f.dying * 5 : 0;
        place(body, 0, fold(HOVER_Y, PERCH_Y) + bob - (dead ? 6 * f.dying : 0), -Math.PI * per + pitch * (1 - per) - 0.5 * f.hurt + tumble);
        place(head, fold(7, -3), fold(14, 14.5), 0.9 * Math.PI * per - 0.1);
        const antLift = 0.5 * f.heat - 0.4 * per - 0.3 * f.hurt;
        antennae.forEach((a, i) => {
          const base: Pt = [9 + i * 2, 20 + i * 0.5];
          a.setSpine(tentacle([base[0], base[1]], 1.15 - i * 0.3 + antLift, 30 - i * 4, 6, 0.9 + 0.2 * Math.sin(f.t * 2 + i), 0.12, f.t * 3 + i));
        });
        legs.alpha = per;
        const eyeOpen = dead ? 0.1 : lerpN(1, 0.2, per) * (1 - 0.8 * f.hurt);
        eyeBig.scale.set(1 + 0.3 * f.heat, Math.max(0.1, eyeOpen));
        eyeGlow.alpha = Math.min(1, (0.25 + 0.8 * f.heat) * eyeOpen) * (dead ? 0 : 1);
        eyeGlow.scale.set((24 + 24 * f.heat) / eyeGlow.texture.width);
        // ash shaken from the wings: more with every beat, and a cloud when they crumble
        dustA.position.set(0, -(HOVER_Y - 6));
        dustA.show(f.t, 0, 0, 90, 70, 0.55, dead ? Math.min(1, f.dying * 3) * (1 - f.dying) * 1.5 : hanging ? 0.08 : 0.3 + 0.3 * Math.abs(fl));
        const crumble = dead ? Math.min(1, f.dying * 1.6) : 0;
        for (const w of [hindFar, foreFar, hindNear, foreNear]) w.node.alpha = 1 - crumble;
      },
    };
  },
};

const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;
