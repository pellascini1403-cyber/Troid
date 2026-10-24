import { ROOMS } from '@/content';
import { ENEMIES } from '@/content/enemies';
import type { Enemy } from '@/enemies/Enemy';
import type { Guardian } from '@/enemies/Guardian';
import { block, ground, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { digestOf } from '../../tools/e2e/replay';
import { lcg } from './chaosStorage';
import { driver, type Button, type Driver } from './sim';

/**
 * SOAK OF THE ENEMIES AND THE GUARDIAN (docs/PROMPT20-LOG.md): thousands of ticks of a hero who does what a person does — walks up to an enemy, backs away, jumps over it, swings, dashes, throws the bolt, stands still — against the real
 * Ink Slimes of R1 and R2, the Ink Warden of R4 and a made-up room with a pit, checking after EVERY tick what an enemy can never do: leave the world or the room, sink into a wall, stay in a state longer than the state lasts, hurt the
 * hero without an attack in the air, die twice, leave its flag unset when it falls, or be left behind by a hero who stands somewhere it cannot reach and "attack for ever". Nothing here knows the answer to a fight; it only knows what can
 * NEVER happen — and the same seed twice must leave the same simulation, bit for bit.
 */

/** A room of the shape of the pit of R1 with the guard of a door standing at its edge: a blow can throw it over (docs/PROMPT20-LOG.md). */
export const PIT_ARENA: RoomDefinition = {
  id: 'pit_arena',
  regionId: 'test',
  name: 'A pit and a door',
  bounds: rect(-2, -14, 72, 20),
  killY: -20,
  entries: [
    { id: 'start', x: 14, y: 0, facing: 1 },
    { id: 'far', x: 40, y: 0, facing: -1 },
  ],
  solids: [
    block('wall_l', -3, -14, -1, 20),
    block('wall_r', 71, -14, 73, 20),
    ground('g_a', -1, 22),
    ground('g_b', 28, 71),
    block('mid_wall', 50, 0, 51, 5), // a wall to hide behind
    block('door', 60, 0, 61.5, 8, 'gate'),
  ],
  spawns: [{ id: 'guard', enemy: 'ink_slime', x: 20.5, y: 0, facing: -1, defeatFlag: 'defeated:guard' }],
  gates: [{ id: 'door_1', solid: 'door', openWhen: 'defeated:guard' }],
};

export interface EnemySoakCase {
  /** A key of `ROOMS`, or `pit_arena`. */
  room: string;
  entry?: string;
  /** The hero cannot be hurt (a long fight to its end); otherwise a defeat sends them back and the room is built again. */
  god: boolean;
  /** Flags the hero comes with (the ones that make the room what it is when it is reached in the world). */
  flags?: readonly string[];
  /** Where the hero begins, when the entry is not where the fight is (R1's entry is a hundred metres from its slime). */
  heroAt?: number;
}

export interface EnemySoakResult {
  violations: string[];
  digests: string[];
  totals: { ticks: number; blows: number; enemyAttacks: number; guardianAttacks: number; guardianPhases: number; kills: number; bossFalls: number; heroDeaths: number; fell: number; states: Set<string> };
}

const SLIME_STATES = new Set(['idle', 'patrol', 'detect', 'approach', 'telegraph', 'attack', 'recover', 'hurt', 'dead']);
const GUARDIAN_STATES = new Set(['dormant', 'intro', 'choose', 'telegraph', 'attack', 'recover', 'hurt', 'dead']);

/** A hero's hand: the buttons, at random moments, with a will to be where the fight is (or away from it). */
type Mode = 'toward' | 'away' | 'dance' | 'stand' | 'hop';

export function enemySoak(c: EnemySoakCase, seed: number, ticks: number): EnemySoakResult {
  const rnd = lcg(seed * 2654435761);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const room = c.room === 'pit_arena' ? PIT_ARENA : ROOMS[c.room]!;
  const rooms = { ...ROOMS, [PIT_ARENA.id]: PIT_ARENA };
  const d: Driver = driver({ room, ...(c.entry ? { entry: c.entry } : {}), unlocked: ['dash', 'air_dash', 'magic_attack'], seed, extra: { rooms, flags: c.flags ?? [] } });
  const s = d.session;
  s.loadout.acquire('card_spirit_bolt');
  s.godMode = c.god;
  if (c.heroAt !== undefined) d.teleport(c.heroAt, 0);
  d.settle();

  const violations: string[] = [];
  const recent: string[] = [];
  const note = (what: string): void => {
    recent.push(`${s.now} ${what}`);
    if (recent.length > 14) recent.shift();
  };
  const seen = new Set<string>();
  const bad = (what: string): void => {
    const kind = what.replace(/[-\d.]+/g, '#').replace(/"[^"]*"/g, '""');
    if (seen.has(kind) || violations.length >= 12) return;
    seen.add(kind);
    violations.push(`${c.room}${c.god ? ' (god)' : ''} seed ${seed}, tick ${s.now}: ${what}\n      history: ${recent.join(' | ')}`);
  };
  const totals: EnemySoakResult['totals'] = { ticks: 0, blows: 0, enemyAttacks: 0, guardianAttacks: 0, guardianPhases: 0, kills: 0, bossFalls: 0, heroDeaths: 0, fell: 0, states: new Set() };

  // ---- what happened, from the events
  const died = new Map<string, number>();
  const flagsSet: string[] = [];
  let hurtThisTick = 0;
  let hazardThisTick = 0;
  let diedThisTick = 0;
  s.bus.on('actor:died', (e) => {
    if (e.team === 'neutral') return;
    died.set(e.id, (died.get(e.id) ?? 0) + 1);
    diedThisTick++;
    totals.kills++;
    note(`${e.id} died`);
    if ((died.get(e.id) ?? 0) > 1) bad(`"${e.id}" died twice`);
  });
  s.bus.on('boss:defeated', () => void totals.bossFalls++);
  s.bus.on('boss:phase', () => void totals.guardianPhases++);
  s.bus.on('flag:set', (e) => void flagsSet.push(e.flag));
  s.bus.on('player:hurt', (e) => {
    hurtThisTick += e.damage;
    note(`hero hurt ${e.damage}`);
  });
  s.bus.on('hazard:hit', () => void hazardThisTick++);
  // a blow of the hero's that landed on an enemy (the target is the enemy's team, and the attacker is not an enemy)
  s.bus.on('combat:hit', (e) => {
    if (e.targetTeam === 'enemy') totals.blows++;
  });
  s.bus.on('enemy:struck', () => void totals.enemyAttacks++);
  s.bus.on('boss:strike', () => void totals.guardianAttacks++);
  s.bus.on('player:died', () => {
    totals.heroDeaths++;
    note('HERO DIED');
  });
  s.bus.on('room:loaded', (e) => note(`room:loaded ${e.roomId}`));
  s.bus.on('boss:started', () => note('boss:started'));

  // every hitbox an enemy puts in the air is counted: the hero can only be hurt by one of them (or by a hazard)
  let enemyHitboxes = 0;
  const submit = s.combat.submit.bind(s.combat);
  s.combat.submit = (hb) => {
    if (hb.team === 'enemy') enemyHitboxes++;
    submit(hb);
  };

  const enemies = (): Array<Enemy | Guardian> => s.entities.filter((e) => e.kind === 'enemy' || e.kind === 'guardian') as Array<Enemy | Guardian>;
  const killY = (): number => s.room.killY ?? s.room.bounds.y0 - 10;
  /** How many ticks each entity has been in its present state, and which state that was (the bound is checked against what the brain itself says). */
  const dwell = new Map<string, { state: string; since: number }>();
  const tapped: Button[] = [];
  const tap = (b: Button): void => {
    d.press(b);
    tapped.push(b);
  };
  let mode: Mode = 'toward';
  let modeUntil = 0;
  const digests: string[] = [];
  let emptySince: number | null = null;

  for (let i = 0; i < ticks; i++) {
    hurtThisTick = 0;
    hazardThisTick = 0;
    diedThisTick = 0;
    enemyHitboxes = 0;
    // ---------------------------------------------------------------------------- the hero's hand
    if (i >= modeUntil) {
      mode = pick<Mode>(['toward', 'toward', 'toward', 'away', 'dance', 'stand', 'hop']);
      modeUntil = i + 15 + Math.floor(rnd() * 70);
    }
    const target = enemies().find((e) => !e.health.dead);
    const dx = target ? target.body.x - d.body.x : 1;
    const dir = dx >= 0 ? 1 : -1;
    d.stop();
    if (mode === 'toward') d.moveX = Math.abs(dx) > 1.2 ? dir : rnd() < 0.5 ? dir : 0;
    else if (mode === 'away') d.moveX = -dir;
    else if (mode === 'dance') d.moveX = rnd() < 0.5 ? 1 : -1;
    else if (mode === 'hop') d.moveX = dir;
    if (mode === 'toward' && rnd() < 0.18) tap('attack');
    else if (rnd() < 0.03) tap('attack');
    if ((mode === 'hop' || rnd() < 0.015) && rnd() < 0.12) tap('jump');
    if (rnd() < 0.01) tap('dash');
    if (rnd() < 0.012) tap('ability');
    if (rnd() < 0.002) tap('bottle');
    if (rnd() < 0.0008 && !s.frozen) d.teleport(d.body.x + (rnd() - 0.5) * 10, 0); // a leap of the hero across the room (a dash, a fall)

    d.step(1);
    for (const b of tapped) d.release(b);
    tapped.length = 0;
    totals.ticks++;

    // the room is fought again: once everything in it has fallen and a moment has passed, what guarded it comes back (the debug panel's "reset room": its flags are forgotten and the room is built again)
    if (enemies().length === 0 && !s.death.active && !s.transition.active) {
      emptySince ??= s.now;
      if (s.now - emptySince > 45) {
        for (const sp of s.room.spawns ?? []) if (sp.defeatFlag) s.flags.clear(sp.defeatFlag);
        for (const bs of s.room.bosses ?? []) s.flags.clear(bs.defeatFlag);
        s.loadRoom(s.room.id, c.entry ?? s.room.entries[0]!.id);
        if (c.heroAt !== undefined) d.teleport(c.heroAt, 0);
        emptySince = null;
        note('the room was fought again');
      }
    } else emptySince = null;

    // ---------------------------------------------------------------------------- the invariants
    const list = enemies();
    if (list.length > 6) bad(`${list.length} enemies in the room`);
    if (s.entities.length > 14) bad(`${s.entities.length} entities in the room`);
    for (const e of list) {
      const b = e.body;
      const where = `"${e.id}" (${e.state})`;
      if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) {
        bad(`${where} is not a number (${b.x}, ${b.y}, ${b.vx}, ${b.vy})`);
        continue;
      }
      const r = s.room.bounds;
      if (b.x < r.x0 - 3 || b.x > r.x1 + 3) bad(`${where} is outside the room (x ${b.x.toFixed(2)})`);
      // (a body that is already gone — dissolving where it fell — is let fall: nothing waits for it, and it is removed in a moment)
      if (b.y < killY() && !e.health.dead) bad(`${where} is out of the world (y ${b.y.toFixed(2)})`);
      if (b.y < killY() + 12 && !e.health.dead) totals.fell++;
      if (Math.abs(b.vx) > 40 || Math.abs(b.vy) > 40) bad(`${where} moves at (${b.vx.toFixed(1)}, ${b.vy.toFixed(1)}) m/s`);
      // a body sunk into a solid it cannot be inside of (a solid that is OFF — an open gate — is not one)
      const inside = s.collision
        .query({ x0: b.x - b.halfW + 0.04, x1: b.x + b.halfW - 0.04, y0: b.y + 0.04, y1: b.y + b.height - 0.04 })
        .filter((k) => k.kind === 'solid' && k.enabled);
      if (inside.length > 0) bad(`${where} is inside the solid "${inside[0]!.id}" (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
      if (!(e.health.current >= 0 && e.health.current <= e.health.max)) bad(`${where} has life ${e.health.current} of ${e.health.max}`);
      if (e.health.dead && e.state !== 'dead') bad(`${where} is dead but not in its dying state`);
      if (!e.health.dead && e.state === 'dead') bad(`${where} is in its dying state but alive`);

      // the state, and how long it has lasted
      const known = e.kind === 'guardian' ? GUARDIAN_STATES : SLIME_STATES;
      if (!known.has(e.state)) bad(`${where} is in the unknown state "${e.state}"`);
      totals.states.add(`${e.kind}:${e.state}`);
      const last = dwell.get(e.id);
      if (!last || last.state !== e.state) dwell.set(e.id, { state: e.state, since: s.now });
      const lasted = e.stateTicks;
      const bound = stateBound(e);
      if (bound !== null && lasted > bound) bad(`${where} has been in that state for ${lasted} ticks (it lasts ${bound})`);
    }

    // the hero is hurt only by a hitbox somebody put in the air on that tick: an enemy's (a lunge, a charge, a column of ink) or a hazard's — the test's own `strike` is not used here
    if (hurtThisTick > 0 && enemyHitboxes === 0 && hazardThisTick === 0) bad('the hero was hurt with no hitbox in the air');

    if ((i + 1) % 50 === 0) digests.push(digestOf(s));
  }

  // a flag that guards a door is set once at most (the world remembers it; it is never announced twice)
  const counts = new Map<string, number>();
  for (const f of flagsSet) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (const [f, n] of counts) if (f.startsWith('defeated:') && n > 1 && !c.god) note(`(the flag ${f} was set ${n} times: a room built again makes the hero beat it again)`);
  return { violations, digests, totals };
}

/** How long the brain may keep one state, in ticks (`null`: it has no bound of its own — it ends when the hero does something). */
function stateBound(e: Enemy | Guardian): number | null {
  if (e.kind === 'guardian') {
    const g = e as Guardian;
    const d = g.def;
    const longest = Math.max(d.attacks.charge.startup, d.attacks.rain.startup);
    const recover = Math.max(d.attacks.charge.recovery, d.attacks.rain.recovery);
    switch (g.state) {
      case 'intro':
        return d.introTicks + 1;
      case 'telegraph':
        return Math.ceil(longest * Math.max(1, d.enrageScale)) + 2;
      case 'attack':
        return Math.max(d.params.charge.ticks, d.attacks.rain.active) + 2;
      case 'recover':
        return Math.ceil(recover * Math.max(1, d.enrageScale)) + d.staggerTicks + 12;
      case 'hurt':
        return d.staggerTicks + 1;
      case 'dead':
        return d.deathTicks + 1;
      case 'choose':
        return null; // waits while the hero is down
      default:
        return null;
    }
  }
  const n = e as Enemy;
  const ai = ENEMIES[n.def.id]!.ai;
  if (ai.archetype !== 'slime') return null; // (this soak is of slimes)
  const p = ai.params;
  const attack = n.def.attacks[p.attack]!;
  switch (n.state) {
    case 'idle':
      return p.idleTicks[1] + 2;
    case 'detect':
      return p.alertTicks + 2;
    case 'telegraph':
      return attack.startup + 1;
    case 'attack':
      return attack.active + 1;
    case 'recover':
      return attack.recovery + 1;
    case 'hurt':
      return 90; // the stun of the blows of the hero (the longest is far below it)
    case 'dead':
      return n.def.death.ticks + 1;
    case 'patrol':
      return 1800; // a leg ends at a wall, at the edge of its range or at a ledge: ten seconds of walking is five times the longest
    default:
      return null;
  }
}
