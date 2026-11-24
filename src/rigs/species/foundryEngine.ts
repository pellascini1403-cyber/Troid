import { damp } from '@/core/math';
import { PALETTE } from '@/presentation/palette';
import { mix, type Pt } from '../kit/geometry';
import { Beacon, Opening, Waking, surge } from '../kit/boss';
import { Motes, flung } from '../kit/features';
import { place, type Kit, type Part } from '../kit/kit';
import { solid } from '../kit/materials';
import { easeIn, easeOut, TAU } from '../kit/motion';
import type { RigDef, RigFrame } from '../types';

/**
 * THE FOUNDRY ENGINE (docs/PROMPT24-LOG.md): a steam locomotive that has become an animal — a long boiler on three spoked drivers that turn as it rolls, a plough of iron bars for a jaw, one great round HEADLAMP for an eye under a heavy
 * brow, a smokestack that breathes, a cab at the back with a lit window, and the rods and the piston that really work the wheels (the crank pins are drawn from the wheel's angle, so the mechanism is never out of step with the wheel).
 * Its weak point is the VENT in the side of the cab: a round hatch of grating, shut, a plate of iron; when it is spent — after a charge into the wall or a march — the hatch flips up on its hinge and a jet of steam goes up out of the hole with a
 * light in it. Charge: the whistle blows on the dome, the wheels spin in place and the headlamp swells, then the whole thing is thrown forward with the smoke streaming back. Pistons: it rears onto its back wheels and comes down.
 * Sparks: the stack glows and spits. March: it stamps, steam bursting from the cylinder on every beat. Dead: the boiler bursts, the stack and the dome and the cab fly one way and the wheels roll off the other.
 */

const IRON = mix(PALETTE.worldSlate, PALETTE.worldNight, 0.5);
const IRON_LIT = mix(PALETTE.worldMist, PALETTE.worldSlate, 0.45);
const PLATE = mix(PALETTE.worldSlate, PALETTE.worldHaze, 0.25);
const DARK = PALETTE.enemyInk;
const RIM = PALETTE.worldGlow;
const FIRE = PALETTE.violetGlow;
const HOT = PALETTE.whiteHot;
const STEAM = mix(PALETTE.worldGlow, PALETTE.whiteHot, 0.45);
const SMOKE = mix(PALETTE.worldDusk, PALETTE.worldMist, 0.4);

const R = 62;
const WHEEL_X: readonly number[] = [-135, -45, 45];
const PIN = 30;
const ROD = 70;
const CROSS_Y = 84;
const VENT: Pt = [-136, 236];
const STACK: Pt = [96, 342];
const DOME: Pt = [-12, 246];

export const FOUNDRY_ENGINE_RIG: RigDef = {
  id: 'boss_engine',
  width: 3.6,
  height: 3.6,
  shadow: 400,
  aura: { color: FIRE, at: [0, 170], size: 560, base: 0.03 },
  ownsDeath: true,
  build(k: Kit) {
    const root = k.group('foundry-engine');
    const hull = k.group('hull');
    const gear = k.group('gear');
    const plate = solid(PLATE, RIM, { ramp: 'vert', edge: DARK, width: 3 });
    const iron = solid(IRON, RIM, { ramp: 'vert', edge: DARK, width: 2.2 });
    const lit = solid(IRON_LIT, RIM, { ramp: 'vert', edge: DARK, width: 1.6 });

    // ------------------------------------------------------------------------------------------ running gear
    const chassis = k.part('chassis', (pen) => pen.shape([[-180, 54], [-186, 96], [-120, 114], [150, 114], [186, 90], [176, 56], [100, 46], [-120, 44]], iron, { round: 0.2 }, (p) => {
      for (const x of [-100, -10, 80]) p.line([x, 56], [x, 108]).stroke(DARK, 3, 0.6);
    }));
    const wheel = () => k.part('wheel', (pen) => {
      pen.circle(0, 0, R - 4).fill(DARK, 0.62);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        pen.line([Math.cos(a) * 12, Math.sin(a) * 12], [Math.cos(a) * (R - 8), Math.sin(a) * (R - 8)]).stroke(DARK, 11, 1);
        pen.line([Math.cos(a) * 12, Math.sin(a) * 12], [Math.cos(a) * (R - 8), Math.sin(a) * (R - 8)]).stroke(IRON_LIT, 7, 1);
      }
      pen.circle(0, 0, R - 3).stroke(DARK, 11, 1);
      pen.circle(0, 0, R - 3).stroke(PLATE, 7, 1);
      pen.arc(0, 0, R - 1, 0.35, 2.6).stroke(RIM, 2.4, 0.9);
      // the counterweight (a bright wedge opposite the crank pin) and the hub
      pen.hard([[-6, -6], [-50, -22], [-50, 22], [-6, 6]]).fill(mix(IRON, PLATE, 0.3), 0.95);
      pen.circle(0, 0, 14).fill(DARK);
      pen.circle(0, 0, 11).fill(PLATE);
      pen.circle(0, 0, 5).fill(RIM, 0.8);
      pen.circle(PIN, 0, 8).fill(DARK);
      pen.circle(PIN, 0, 5.4).fill(mix(PLATE, HOT, 0.4));
    });
    const wheels = WHEEL_X.map(wheel);
    const bar = (key: string, h = 5) => k.part(key, (pen) => pen.shape([[0, -h], [0, h], [100, h], [100, -h]], lit, { round: 0.15 }));
    const couple = [bar('couple0'), bar('couple1')];
    const mainRod = bar('main-rod', 4.6);
    const pistonRod = bar('piston-rod', 3.4);
    const guide = k.part('guide', (pen) => pen.shape([[0, -2], [0, 2], [100, 2], [100, -2]], iron, { round: 0.1 }));
    const cross = k.part('crosshead', (pen) => pen.shape([[-9, -9], [-9, 9], [9, 9], [9, -9]], plate, { round: 0.2 }));
    const cylinder = k.part('cylinder', (pen) => pen.shape([[-30, -16], [-30, 16], [30, 18], [38, 12], [38, -12], [30, -16]], plate, { round: 0.25 }, (p) => {
      p.line([-14, -16], [-14, 16]).stroke(DARK, 2.4, 0.7);
      p.line([10, -16], [10, 16]).stroke(DARK, 2.4, 0.7);
    }));
    const plough = k.part('plough', (pen) => pen.shape([[0, -36], [66, -54], [74, -26], [30, 0], [0, 0]], plate, { round: 0.12, sharp: [0, 1, 2] }, (p) => {
      for (const x of [14, 30, 46, 62]) p.line([x, -4 - x * 0.32], [x + 6, -42 - x * 0.18]).stroke(DARK, 3.4, 0.9);
    }));

    // ------------------------------------------------------------------------------------------ the hull
    const stack = k.part('stack', (pen) => pen.shape([[-17, 0], [-13, 62], [-24, 94], [-24, 106], [24, 106], [24, 94], [13, 62], [17, 0]], plate, { round: 0.25, sharp: [2, 3, 4, 5] }, (p) => {
      p.line([-23, 98], [23, 98]).stroke(DARK, 3, 0.8);
      p.ellipse(0, 106, 22, 4).fill(DARK, 0.9);
    }));
    const dome = k.part('dome', (pen) => pen.shape([[-38, 0], [-34, 24], [-12, 40], [12, 40], [34, 24], [38, 0]], plate, { round: 0.8 }, (p) => p.line([-30, 8], [30, 8]).stroke(DARK, 2.6, 0.7)));
    const cab = k.part('cab', (pen) => pen.shape([[-188, 96], [-190, 292], [-176, 322], [-96, 322], [-84, 290], [-86, 96]], plate, { round: 0.1, sharp: [1, 2, 3, 4] }, (p) => {
      // roof overhang and the rivets down the edge
      p.hard([[-196, 318], [-80, 318], [-84, 332], [-192, 332]]).fill(iron.fill, 1);
      p.line([-196, 318], [-80, 318]).stroke(RIM, 2, 0.7);
      for (let i = 0; i < 6; i++) p.circle(-90, 110 + i * 34, 2.4).fill(DARK, 0.8);
    }));
    const window = k.part('window', (pen) => pen.shape([[-176, 276], [-176, 312], [-106, 312], [-106, 276]], { fill: DARK, edge: { color: RIM, width: 3 }, rims: [] }, { round: 0.15 }));
    const fireGlow = k.glow(FIRE, 120, 0);
    const boiler = k.part('boiler', (pen) => pen.shape([[-96, 116], [-100, 170], [-92, 226], [-40, 246], [70, 246], [128, 232], [160, 206], [166, 166], [158, 128], [120, 110], [-40, 106]], { ...plate, gloss: [{ at: [-10, 214], rx: 120, ry: 7, rot: 0, color: HOT, alpha: 0.2 }, { at: [100, 190], rx: 26, ry: 4, rot: 0.2, color: HOT, alpha: 0.14 }] }, { round: 0.7 }, (p) => {
      // the bands round it, the rivets along them, the plates of the barrel
      for (const x of [-64, 4, 74, 128]) {
        p.line([x, 112], [x - 2, 242]).stroke(DARK, 5, 0.85);
        p.line([x, 112], [x - 2, 242]).stroke(IRON_LIT, 2.4, 0.9);
        for (let i = 0; i < 6; i++) p.circle(x + 7, 130 + i * 20, 2.3).fill(DARK, 0.75);
      }
      p.contour([[-92, 150], [20, 140], [150, 148]], { closed: false }).stroke(DARK, 2, 0.35);
      p.contour([[-92, 200], [20, 192], [150, 196]], { closed: false }).stroke(DARK, 2, 0.35);
    }));
    const cracks = k.part('cracks', (pen) => {
      for (const c of [[[-70, 130], [-50, 170], [-64, 200], [-40, 236]], [[30, 118], [20, 160], [42, 196], [28, 240]], [[96, 124], [110, 168], [96, 208]]] as Pt[][]) {
        pen.contour(c, { closed: false, round: 0 }).stroke(FIRE, 5, 0.5);
        pen.contour(c, { closed: false, round: 0 }).stroke(HOT, 1.6, 0.9);
      }
    });
    const door = k.part('door', (pen) => pen.shape([[0, -76], [16, -58], [20, 0], [14, 66], [0, 80], [-14, 66], [-20, 0], [-14, -58]], plate, { round: 0.6 }, (p) => {
      for (let i = 0; i < 8; i++) p.circle(Math.cos((i / 8) * TAU) * 12, Math.sin((i / 8) * TAU) * 60 * 0.82 + 2, 2.2).fill(DARK, 0.8);
    }));
    const lamp = k.part('lamp', (pen) => {
      pen.shape([[-30, 0], [-28, 22], [-6, 34], [20, 26], [30, 0], [20, -26], [-6, -34], [-28, -22]], { fill: mix(PALETTE.violetDeep, FIRE, 0.45), ramp: 'sphere', edge: { color: DARK, width: 4 }, rims: [{ color: HOT, width: 3, alpha: 0.9 }] }, { round: 1 });
      pen.circle(2, 0, 15).fill(HOT, 0.9);
    });
    const lampGlow = k.glow(FIRE, 180, 0);
    const brow = k.part('brow', (pen) => pen.shape([[-38, 0], [-34, 14], [-4, 24], [36, 18], [48, 0], [8, 8], [-14, 6]], iron, { round: 0.2, sharp: [4] }));
    const gauge = k.part('gauge', (pen) => {
      pen.circle(0, 0, 17).fill(PLATE);
      pen.circle(0, 0, 17).stroke(DARK, 4, 1);
      pen.circle(0, 0, 13).fill(DARK);
      pen.arc(0, 0, 10, -0.7, 3.8).stroke(mix(FIRE, HOT, 0.3), 2.2, 0.8);
    });
    const needle = k.part('needle', (pen) => pen.line([0, 0], [0, 12]).stroke(HOT, 2.6, 1));
    const ventHole = k.part('vent-hole', (pen) => {
      pen.circle(0, 0, 28).fill(DARK);
      pen.circle(0, 0, 28).stroke(RIM, 3, 0.9);
    });
    const ventGlow = k.glow(FIRE, 110, 0);
    const ventLid = k.part('vent-lid', (pen) => pen.shape([[-28, 0], [-30, -19], [-20, -46], [0, -56], [20, -46], [30, -19], [28, 0]], plate, { round: 0.7 }, (p) => {
      for (const y of [-12, -24, -36]) p.line([-22, y], [22, y]).stroke(DARK, 2.6, 0.85);
      p.circle(0, -2, 3.8).fill(DARK);
    }));
    const beacon = new Beacon(k, FIRE, 150, mix(FIRE, HOT, 0.25));
    const whistle = new Motes(k, 8, STEAM, 36, 0.4);
    const ventSteam = new Motes(k, 14, STEAM, 62, 0.8);
    const smoke = new Motes(k, 16, SMOKE, 78, 0.3);
    const spits = new Motes(k, 12, HOT, 20, 0.6);
    const cylSteam = new Motes(k, 8, STEAM, 40, 0.1);
    const burst = k.glow(HOT, 420, 0);
    const bits = Array.from({ length: 8 }, (_, i) => k.part(`bit${i}`, (pen) => pen.shape([[0, 0], [28 + i * 3, 8], [34, 34], [8, 40]], plate, { round: 0.15 })));
    for (const b of bits) b.visible = false;

    hull.addChild(stack, cab, window, fireGlow, boiler, cracks, dome, door, lamp, lampGlow, brow, gauge, needle, ventHole, ventGlow, ventLid, beacon);
    gear.addChild(chassis, ...wheels, ...couple, guide, mainRod, pistonRod, cross, hull, cylinder, plough);
    root.addChild(gear, smoke, whistle, ventSteam, spits, cylSteam, burst, ...bits);
    place(stack, STACK[0], STACK[1] - 106);
    place(dome, DOME[0], DOME[1]);
    place(cab, 0, 0);
    place(window, 0, 0);
    place(boiler, 0, 0);
    place(door, 172, 178);
    place(lamp, 184, 186);
    place(brow, 172, 224);
    place(gauge, 56, 214);
    place(needle, 56, 214);
    place(ventHole, VENT[0], VENT[1]);
    place(chassis, 0, 0);
    wheels.forEach((w, i) => place(w, WHEEL_X[i]!, R));
    place(cylinder, 128, 84);
    place(guide, 70, CROSS_Y);
    place(plough, 150, 68);
    hull.pivot.set(-45, -80);

    const opening = new Opening();
    const waking = new Waking();
    let ang = k.seed * TAU;
    let spin = 0;
    let heat = 0;
    let scattered = false;

    /** A bar from `a` to `b` (the bar part is 100 cm long). */
    const link = (part: Part, a: Pt, b: Pt): void => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      place(part, a[0], a[1], Math.atan2(dy, dx), Math.hypot(dx, dy) / 100, 1);
    };

    return {
      root,
      update(f: RigFrame) {
        const dt = f.dt;
        const dead = f.anim === 'death';
        const wind = f.anim === 'telegraph';
        const strike = f.anim === 'attack';
        const key = f.attackKey ?? '';
        const charge = key === 'charge';
        const pistons = key === 'pistons';
        const sparks = key === 'sparks';
        const march = key === 'march';
        const open = opening.update(f);
        const awake = waking.update(f);
        const roar = surge(f);
        const second = f.enraged ? 1 : 0;
        const third = f.hpFrac < 0.3 ? 1 : 0;

        heat = dt > 0 ? damp(heat, Math.max(wind ? easeIn(f.p) : strike ? 1 : 0, 0.35 * second + 0.2 * third, roar), 10, dt) : heat;

        // the drivers: they turn with the ground it covers, and they spin in place when it gathers itself to charge
        const ground = (f.vx * 100) / R;
        const skid = (charge && wind ? 17 * easeIn(f.p) : 0) + (march && (wind || strike) ? 5 : 0);
        spin = dt > 0 ? damp(spin, (dead ? 0 : ground) + skid, 10, dt) : spin;
        ang -= spin * dt;
        wheels.forEach((w, i) => place(w, WHEEL_X[i]!, R, ang));
        const pin = (i: number): Pt => [WHEEL_X[i]! + Math.cos(ang) * PIN, R + Math.sin(ang) * PIN];
        link(couple[0]!, pin(0), pin(1));
        link(couple[1]!, pin(1), pin(2));
        const p2 = pin(2);
        const dy = CROSS_Y - p2[1];
        const xc = p2[0] + Math.sqrt(Math.max(0, ROD * ROD - dy * dy));
        link(mainRod, p2, [xc, CROSS_Y]);
        place(cross, xc, CROSS_Y);
        place(pistonRod, xc, CROSS_Y, 0, Math.max(0.05, 140 - xc) / 100, 1);
        place(guide, 70, CROSS_Y, 0, 0.7, 1);

        // the hull: idling shudder, rearing onto its back wheels for the pistons, a gathering for the charge, slumped when it is spent
        const idle = (0.5 + 0.5 * second) * awake * Math.sin(f.t * 41) * 0.5;
        const shake = idle + (roar * 5 + 5 * f.hurt) * Math.sin(f.t * 60) * 0.5 + (march && strike ? 2.4 * Math.sin(f.p * 40) : 0);
        let pitch = 0.004 * Math.sin(f.t * 1.1) - 0.03 * open - 0.02 * (1 - awake);
        if (charge) pitch += wind ? 0.05 * easeOut(f.p) : strike ? -0.035 : 0;
        if (pistons) pitch += wind ? 0.13 * easeIn(f.p) : strike ? -0.07 * Math.max(0, 1 - f.p * 2.5) : 0;
        if (march) pitch += wind ? 0.06 * easeOut(f.p) : strike ? -0.02 : 0;
        if (sparks && wind) pitch += 0.03 * f.p;
        const bounce = (march && strike ? -5 * Math.abs(Math.sin(f.p * 20)) : 0) + (dead ? -40 * easeIn(f.dying) : 0) - 5 * open;
        place(hull, -45 + shake, 80 + bounce, dead ? 0 : pitch);
        place(plough, 150, 68, -0.12 * (charge ? Math.max(wind ? easeOut(f.p) : 1, heat) : 0) + 0.04 * open);

        // the eye: dim while it waits, swelling with the warning, a flare in the charge; the brow comes down on it
        lamp.alpha = 0.55 + 0.45 * awake;
        lampGlow.position.set(184, -186);
        lampGlow.alpha = Math.min(1, awake * (0.12 + 0.88 * heat) + 0.35 * second + roar) * (dead ? 0 : 1);
        lampGlow.scale.set((140 + 140 * heat + 60 * second) / lampGlow.texture.width, (140 + 110 * heat + 40 * second) / lampGlow.texture.width);
        place(brow, 172, 224 - 4 * heat, -0.06 * heat);
        place(lamp, 184, 186, 0, 1 + 0.1 * heat, 1 + 0.1 * heat);

        // the cab: a firebox light in the window, bright in the second and third phases, and cracks in the boiler where it leaks
        fireGlow.position.set(-141, -294);
        fireGlow.alpha = Math.min(1, awake * (0.2 + 0.4 * heat) + 0.3 * second + 0.2 * third + 0.6 * roar) * (dead ? 0 : 1);
        fireGlow.scale.set((90 + 50 * heat) / fireGlow.texture.width);
        cracks.alpha = Math.min(1, 0.9 * (second + third * 0.5) * 0.6 + 0.5 * heat * second + 0.8 * roar) * (dead ? 0 : 1);
        place(needle, 56, 214, 2.3 - 3.9 * Math.min(1, 0.12 + heat * 0.7 + 0.2 * second + 0.08 * Math.sin(f.t * 9) * heat));

        // the vent: a hatch on a hinge that flips up when it is spent, steam out of the hole with a light in it
        ventHole.alpha = 1;
        place(ventLid, VENT[0], VENT[1] + 28, -1.65 * open + 0.1 * Math.sin(f.t * 3) * open);
        ventGlow.position.set(VENT[0], -VENT[1]);
        ventGlow.alpha = Math.min(1, open * 0.75 + 0.04 * awake) * (dead ? 0 : 1);
        ventGlow.scale.set((64 + 22 * Math.sin(f.t * 8) * open) / ventGlow.texture.width);
        beacon.show(f.t, VENT, open, 0);
        ventSteam.position.set(VENT[0], -(VENT[1] + 10));
        ventSteam.show(f.t, 0, 0, 90, 220, 0.9, open * 0.95 + 0.1 * Math.sin(f.t * 3) * open);

        // the stack, the whistle, the cylinder: the smoke of an idling engine, thick and black in the fight; sparks from the stack in the sparks attack; steam out of the cylinder on every stroke
        smoke.position.set(STACK[0], -STACK[1]);
        smoke.show(f.t, 0, 0, 60, 260, 0.32 + 0.3 * heat, awake * (0.35 + 0.5 * heat + 0.2 * second) * (dead ? 0 : 1));
        spits.position.set(STACK[0], -STACK[1]);
        spits.show(f.t, 10, 0, 70, 190, 1.6, sparks ? (wind ? 0.35 * f.p : strike ? 1 : 0) : second * 0.1 * awake);
        whistle.position.set(DOME[0], -(DOME[1] + 40));
        whistle.show(f.t, 0, 0, 40, 130, 1.2, (charge || march) && wind ? 0.9 * f.p : roar * 0.8);
        cylSteam.position.set(168, -90);
        cylSteam.show(f.t, 0, 0, 60, 70, 2.2, ((march && strike) || (charge && wind) ? 0.9 : 0) + (pistons && (wind || strike) ? 0.7 : 0));

        // the death: the boiler lets go — a flash, the stack and the dome and the cab thrown one way, the wheels rolling off the other
        burst.position.set(20, -176);
        burst.alpha = dead ? Math.max(0, 1 - Math.abs(f.dying - 0.2) * 5) : 0;
        burst.scale.set((200 + 520 * Math.min(1, f.dying * 4)) / burst.texture.width);
        if (dead) {
          scattered = true;
          const g = Math.max(0, (f.dying - 0.15) / 0.85);
          const u = Math.min(1, g * 1.1);
          flung(stack, [STACK[0], STACK[1] - 106], [60, 250], 3.4, 520, 0, u);
          flung(dome, DOME, [-20, 280], -2.8, 520, 0, u);
          flung(cab, [0, 0], [-90, 120], -0.9, 520, -20, u);
          flung(door, [172, 178], [160, 60], 2.2, 520, 40, u);
          flung(lamp, [184, 186], [180, 90], 3, 520, 24, u);
          flung(plough, [150, 68], [140, 50], 1.4, 520, 10, u);
          wheels.forEach((w, i) => flung(w, [WHEEL_X[i]!, R], [(i - 1) * 140, 40 + i * 20], (i - 1) * 7, 520, R, u));
          const fade = 1 - Math.max(0, (f.dying - 0.5) / 0.5);
          boiler.alpha = chassis.alpha = hull.alpha = fade;
          for (const c of [...couple, mainRod, pistonRod, cross, guide, cylinder]) c.visible = false;
          bits.forEach((b, i) => {
            b.visible = g > 0.02;
            if (b.visible) {
              flung(b, [-40 + i * 24, 180], [(i - 3.5) * 70, 120 + (i % 3) * 60], (i - 3.5) * 2.2, 560, 6, u);
              b.alpha = fade;
            }
          });
        } else {
          if (scattered) {
            // back from a death (only a lab pose does this): every piece goes home
            scattered = false;
            place(stack, STACK[0], STACK[1] - 106);
            place(dome, DOME[0], DOME[1]);
            place(cab, 0, 0);
            place(door, 172, 178);
            wheels.forEach((w, i) => place(w, WHEEL_X[i]!, R));
          }
          boiler.alpha = chassis.alpha = hull.alpha = 1;
          for (const c of [...couple, mainRod, pistonRod, cross, guide, cylinder]) c.visible = true;
          for (const b of bits) b.visible = false;
        }
      },
    };
  },
};
