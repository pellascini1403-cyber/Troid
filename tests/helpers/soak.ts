import { ROOMS } from '@/content';
import { createPlayerStatus } from '@/gameplay/PlayerStatus';
import type { GameSession } from '@/gameplay/GameSession';
import type { Projectile } from '@/gameplay/Projectile';
import { DEFAULT_REACH, REACH_HYSTERESIS } from '@/interaction/Interactable';
import { digestOf } from '../../tools/e2e/replay';
import { strikeOnPlayer } from './combat';
import { driver, type Button, type Driver } from './sim';

/**
 * SOAK of the whole player layer (docs/PROMPT5-LOG.md S20): thousands of ticks of RANDOM play — every button at random moments, hits
 * from outside (some of them lethal), deaths and respawns, room reloads, falls out of the world, teleports next to every object that can be interacted with, the
 * card taken off in the middle of a cast, the bar set to arbitrary values — through the real session, checking after EVERY tick the
 * invariants the HUD and the rules lean on. Nothing here knows the answer to a scenario; it only knows what can NEVER happen:
 * magic or life outside their bars or changing without a cause, two bottles recharging at once, a bottle that appears or vanishes,
 * an icon on a dead player or on an object out of reach, a status snapshot that disagrees with the simulation, a number that is
 * not a number. And the same seed twice must leave the same simulation, bit for bit.
 */
const STATES = new Set(['free', 'crouch', 'dash', 'attack', 'cast', 'drink', 'interact', 'hurt', 'dead']);
const PHASES = new Set(['none', 'dying', 'fadeOut', 'hold', 'fadeIn']);
const ROOM_IDS = Object.keys(ROOMS);
const COST = 30;
const REGEN_PER_TICK = 6 / 60;

/** A small seeded generator (Numerical Recipes LCG): the soak must replay identically. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

interface Tally {
  hurt: number;
  died: number;
  healed: number;
  used: number;
  recharged: number;
  added: number;
  refilled: number;
  spent: number;
  magicReset: boolean;
  casts: number;
  denied: number;
  drunk: number;
  performed: number;
  respawned: boolean;
  loaded: boolean;
  /** The hero rested at a shrine: life, magic and bottles are given back (docs/PROMPT6-LOG.md S24). */
  rested: boolean;
}
const fresh = (): Tally => ({ hurt: 0, died: 0, healed: 0, used: 0, recharged: 0, added: 0, refilled: 0, spent: 0, magicReset: false, casts: 0, denied: 0, drunk: 0, performed: 0, respawned: false, loaded: false, rested: false });

export interface Totals {
  ticks: number;
  casts: number;
  denied: number;
  drunk: number;
  refusedDrinks: number;
  performed: number;
  deaths: number;
  loads: number;
  hits: number;
  states: Set<string>;
  recharged: number;
}

export interface Result {
  violations: string[];
  digests: string[];
  totals: Totals;
}

/** What a test may look at after every tick of a soak: the session, and which tick it is. It must not touch the simulation. */
export type SoakHook = (session: GameSession, tick: number) => void;

/**
 * One run of random play: `ticks` ticks from `seed`, every invariant checked after each one. `hook` (optional) runs right after the
 * checks of each tick — a view that wants to be exercised by the same chaos (the HUD) — and must not change the simulation.
 */
export function soak(seed: number, ticks: number, hook?: SoakHook): Result {
  const rnd = lcg(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const d: Driver = driver({ room: ROOMS['r1_gate']!, unlocked: ['dash'], seed, extra: { rooms: ROOMS } });
  const s = d.session;
  // since S28 the Spirit Bolt card is not in R1 (it lies in R3): half of the seeds begin as the hero that comes back with it, the others without,
  // so both worlds — a bar that can be spent and one that is refused — are exercised from the first tick (and the card is still found by interacting)
  if (seed % 2 === 0) {
    s.loadout.acquire('card_spirit_bolt');
    s.flags.set('taken:card_spirit_bolt');
  }
  const violations: string[] = [];
  // the last few things that happened, so that a violation says how it came about
  const recent: string[] = [];
  const note = (what: string): void => {
    recent.push(`${s.now} ${what}`);
    if (recent.length > 14) recent.shift();
  };
  const seen = new Set<string>();
  const bad = (what: string): void => {
    const kind = what.replace(/[-\d.]+/g, '#');
    if (seen.has(kind) || violations.length >= 12) return; // the first of each kind, with its history
    seen.add(kind);
    violations.push(`seed ${seed}, tick ${s.now}: ${what}\n      history: ${recent.join(' | ')}`);
  };
  const totals: Totals = { ticks: 0, casts: 0, denied: 0, drunk: 0, refusedDrinks: 0, performed: 0, deaths: 0, loads: 0, hits: 0, states: new Set(), recharged: 0 };

  // ---- what happened during the tick that just ran (the events are synchronous: they land before `step` returns)
  let t = fresh();
  s.bus.on('player:hurt', (e) => void (t.hurt += e.damage, totals.hits++));
  s.bus.on('player:died', () => void (t.died++, totals.deaths++));
  s.bus.on('bottle:drunk', (e) => void (t.healed += e.healed, t.drunk++, totals.drunk++));
  s.bus.on('bottle:denied', () => void totals.refusedDrinks++);
  s.bus.on('bottle:changed', (e) => {
    if (e.type === 'used') t.used++;
    else if (e.type === 'recharged') (t.recharged++, totals.recharged++);
    else if (e.type === 'added') t.added++;
    else if (e.type === 'refilled') t.refilled++;
  });
  s.bus.on('magic:changed', (e) => {
    if (e.reason === 'spend') t.spent += -e.delta;
    else if (e.reason === 'set' || e.reason === 'restore') t.magicReset = true;
  });
  s.bus.on('skill:cast', (e) => void (t.casts++, totals.casts++, e.cost !== COST && bad(`a cast cost ${e.cost}`)));
  s.bus.on('skill:denied', () => void (t.denied++, totals.denied++));
  s.bus.on('interaction:performed', () => void (t.performed++, totals.performed++));
  s.bus.on('death:respawned', () => void (t.respawned = true));
  s.bus.on('checkpoint:set', () => void (t.rested = true));
  s.bus.on('room:loaded', () => void (t.loaded = true, totals.loads++));
  s.bus.on('player:hurt', (e) => note(`hurt ${e.damage}`));
  s.bus.on('player:died', () => note('DIED'));
  s.bus.on('death:started', () => note('death:started'));
  s.bus.on('death:fadeOut', () => note('death:fadeOut'));
  s.bus.on('death:respawned', () => note('death:respawned'));
  s.bus.on('death:fadeIn', () => note('death:fadeIn'));
  s.bus.on('room:loaded', (e) => note(`room:loaded ${e.roomId}`));

  const status = createPlayerStatus();
  const p = s.player;
  const taken = new Set<string>();
  let unequippedAt = -Infinity;
  let prevMagic = s.magic.current;
  let prevHealth = p.health.current;
  let prevReady = s.bottles.readyCount;
  const digests: string[] = [];

  const holdFlip = (b: 'jump' | 'attack' | 'ability', prob: number): void => {
    if (rnd() < prob) d.press(b);
    else if (rnd() < prob * 3) d.release(b);
  };
  // a tap lasts exactly the tick that is about to run (`Driver.tap` would run a tick of its own, outside the checks)
  const tapped: Button[] = [];
  const tap = (b: Button): void => {
    d.press(b);
    tapped.push(b);
  };

  for (let i = 0; i < ticks; i++) {
    t = fresh(); // everything that happens from here to the end of the tick — the harness' own doing included — is accounted for
    // ---------------------------------------------------------------------------- random play
    if (i % 12 === 0) {
      d.moveX = pick([-1, 0, 1, 1, 0]);
      d.moveY = rnd() < 0.3 ? -1 : 0;
    }
    holdFlip('jump', 0.03);
    holdFlip('attack', 0.03);
    holdFlip('ability', 0.015);
    if (rnd() < 0.012) tap('dash');
    if (rnd() < 0.02) tap('ability');
    if (rnd() < 0.015) tap('interact');
    if (rnd() < 0.012) {
      d.bottleSlot = rnd() < 0.5 ? -1 : Math.floor(rnd() * 4);
      tap('bottle');
    }
    if (rnd() < 0.004) tap('drop');
    // a hit from outside: now and then a lethal one
    const roll = rnd();
    if (roll < 0.006) strikeOnPlayer(d, { damage: 1 });
    else if (roll < 0.0075) strikeOnPlayer(d, { damage: 9 });
    // next to something that can be interacted with (this is how the card, the lever and the doors get exercised)
    if (rnd() < 0.006 && !p.health.dead && !s.frozen) {
      const things = s.room.interactables ?? [];
      if (things.length) {
        const o = pick(things);
        d.teleport(o.x + (rnd() - 0.5) * 2, o.y);
      }
    }
    if (rnd() < 0.002 && !s.frozen) p.body.y = (s.room.killY ?? s.room.bounds.y0 - 10) - 1; // out of the world, in whatever state (casting, drinking, dying…)
    if (rnd() < 0.0008) s.loadRoom(pick(ROOM_IDS));
    if (rnd() < 0.0004) {
      s.loadout.equip(null); // the card is taken off, maybe in the middle of a cast (which, already begun, is finished)…
      unequippedAt = s.now;
    }
    if (rnd() < 0.0004 && s.loadout.has('card_spirit_bolt')) s.loadout.equip('card_spirit_bolt'); // …and put back
    if (rnd() < 0.0006) s.magic.set(rnd() * 140 - 20); // anything, including values outside the bar
    if (rnd() < 0.0003) s.magic.restore();

    // ---------------------------------------------------------------------------- one tick
    d.step(1);
    for (const b of tapped) d.release(b);
    tapped.length = 0;
    d.bottleSlot = -1;
    totals.ticks++;
    totals.states.add(p.controller.state);

    // ---------------------------------------------------------------------------- the invariants
    const b = p.body;
    if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) bad(`the body is not a number (${b.x}, ${b.y}, ${b.vx}, ${b.vy})`);
    const r = s.room.bounds;
    if (b.x < r.x0 - 5 || b.x > r.x1 + 5 || b.y < (s.room.killY ?? -50) - 12) bad(`the body is outside the world (${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);
    if (!STATES.has(p.controller.state)) bad(`unknown state "${p.controller.state}"`);
    if (!PHASES.has(s.death.phase)) bad(`unknown death phase "${s.death.phase}"`);

    // the magic: inside its bar, and it only changes for a reason
    const m = s.magic.current;
    if (!(m >= 0 && m <= s.magic.max)) bad(`magic ${m} is outside 0…${s.magic.max}`);
    if (!t.magicReset) {
      const delta = m - prevMagic;
      if (t.spent > 0) {
        if (Math.abs(delta + t.spent) > 1e-9) bad(`magic went ${prevMagic} → ${m} (a spend of ${t.spent})`);
      } else if (delta < -1e-9 || delta > REGEN_PER_TICK + 1e-9) bad(`magic changed by ${delta} with nothing spent`);
    }
    if (t.casts > 0 && !s.loadout.equipped && s.now - unequippedAt > 8) bad('a cast with no card equipped (and none taken off while it was being prepared)');
    if (t.casts > 0 && Math.abs(t.spent - COST * t.casts) > 1e-9) bad(`${t.casts} cast(s) but ${t.spent} spent`);
    if (t.denied > 0 && m >= COST + REGEN_PER_TICK + 1e-9) bad(`a cast was denied with ${m} magic`);
    prevMagic = m;

    // the life: inside its bar, and it only changes for a reason (a hit, a bottle, or a respawn that gives it back)
    const h = p.health.current;
    if (!(Number.isInteger(h) && h >= 0 && h <= p.health.max)) bad(`life ${h} is outside 0…${p.health.max}`);
    if (!t.respawned && !t.loaded && !t.rested) {
      const expected = t.died > 0 ? 0 : Math.max(0, Math.min(p.health.max, prevHealth - t.hurt + t.healed));
      if (h !== expected) bad(`life went ${prevHealth} → ${h} (hurt ${t.hurt}, healed ${t.healed}, died ${t.died})`);
    }
    prevHealth = h;
    if (p.health.dead && s.death.phase === 'none') bad('dead with no defeat flow running');
    if (p.health.dead && p.controller.state !== 'dead') bad(`dead but "${p.controller.state}"`);
    if (t.drunk > 1) bad('two bottles drunk in one tick');

    // the bottles: 3–4 slots, one recharging at a time, none appears or vanishes
    const slots = s.bottles.slots;
    if (slots.length < 3 || slots.length > s.bottles.maxSlots) bad(`${slots.length} bottle slots`);
    const recharging = slots.filter((x) => x.state === 'recharging');
    if (recharging.length > 1) bad(`${recharging.length} bottles recharging at once`);
    if (recharging.length === 0 && slots.some((x) => x.state === 'empty')) bad('an empty bottle that is not waiting to recharge');
    for (const x of slots) {
      if (x.state === 'recharging' ? !(x.progress >= 0 && x.progress < s.bottles.rechargeLength) : x.progress !== 0) bad(`bottle ${x.state} with progress ${x.progress}`);
    }
    const ready = s.bottles.readyCount;
    if (ready - prevReady !== t.recharged + t.added + t.refilled - t.used) bad(`ready bottles ${prevReady} → ${ready} (recharged ${t.recharged}, added ${t.added}, refilled ${t.refilled}, used ${t.used})`);
    if (t.used !== t.drunk) bad(`${t.used} bottle(s) used but ${t.drunk} drunk`);
    prevReady = ready;

    // the status snapshot (the only door of the HUD) agrees with the simulation
    s.status(status);
    if (status.life.current !== h || status.life.max !== p.health.max) bad('status.life disagrees');
    if (status.magic.current !== m) bad('status.magic disagrees');
    if (status.card.equipped !== (s.loadout.equipped !== null)) bad('status.card disagrees');
    if (status.card.state === 'noMagic' && m >= COST) bad('card dimmed with enough magic');
    if (status.card.cooldown01 < 0 || status.card.cooldown01 > 1) bad(`card cooldown ${status.card.cooldown01}`);
    if (status.bottles.length !== slots.length) bad('status.bottles has another length');
    status.bottles.forEach((x, k) => {
      if (x.state !== slots[k]?.state || x.fill01 < 0 || x.fill01 > 1) bad(`status.bottles[${k}] ${x.state} ${x.fill01}`);
    });
    if ((status.drink.slot >= 0) !== (p.controller.state === 'drink')) bad(`status.drink.slot ${status.drink.slot} while "${p.controller.state}"`);
    if (status.drink.slot >= slots.length || status.drink.progress01 < 0 || status.drink.progress01 > 1) bad(`status.drink ${status.drink.slot} / ${status.drink.progress01}`);
    if (status.interaction.active !== (s.interaction.current !== null)) bad('status.interaction disagrees');
    if (status.bottleUseful !== (!p.health.dead && h < p.health.max && ready > 0)) bad('status.bottleUseful disagrees');

    // the icon: never on a dead player, never on something that cannot be used, never on something out of reach
    const cur = s.interaction.current;
    if (cur) {
      const reach = cur.reach ?? DEFAULT_REACH;
      if (p.health.dead) bad('an interaction icon on a dead player');
      if (!s.interaction.isAvailable(cur.id)) bad(`the icon is on "${cur.id}", which is not available`);
      if (Math.abs(b.x - cur.x) > reach.x + REACH_HYSTERESIS + 1e-9 || Math.abs(b.y - cur.y) > reach.y + REACH_HYSTERESIS + 1e-9) bad(`the icon is on "${cur.id}", out of reach`);
    }

    // the world: a thing that was taken stays taken; a projectile is a bounded, real number
    for (const f of s.flags.list()) if (f.startsWith('taken:') || f.startsWith('defeated:')) taken.add(f);
    for (const f of taken) if (!s.flags.has(f)) bad(`the flag "${f}" vanished`);
    const bolts = s.entities.filter((e) => e.kind === 'projectile') as Projectile[];
    if (bolts.length > 6) bad(`${bolts.length} bolts in flight`);
    for (const bolt of bolts) if (!Number.isFinite(bolt.x) || !Number.isFinite(bolt.y)) bad('a bolt is not a number');

    if ((i + 1) % 50 === 0) digests.push(digestOf(s));
    hook?.(s, i);
  }
  return { violations, digests, totals };
}

