import { describe, expect, it } from 'vitest';
import { attachProgressRecorder } from '@/app/progressRecorder';
import { ROOMS, START, WORLD } from '@/content';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import type { ProgressData } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { strikeOnPlayer } from '../helpers/combat';
import { runTo } from '../helpers/hops';
import { arriveIn, beatTheWarden, breakTheSeal, freshWorld, R2_SPIKES_JUMP, toTheEastExit } from '../helpers/journey';
import { driver, type Driver } from '../helpers/sim';
import { R1_CROUCH } from '../helpers/vertical';

/**
 * THE WHOLE SLICE, SAVED AS IT GOES AND RESUMABLE FROM EVERY SAVE (docs/PROMPT6-LOG.md S32): a hero plays the world from a new game to the end with
 * the REAL recorder attached to a real store, so that every save the game made on the way is a point where a person could have closed the page. Then
 * the game is begun again from EACH of those saves — the way a load does — and the rest of the world is played from there: it must always be
 * possible to finish it, and the game that finishes must be, on what is saved, the same one: the same flags, abilities, card, bottles and
 * checkpoint, whatever the save it was resumed from. And again after a defeat right at the resume point: the world that was won stays won
 * (what was opened stays open, what was broken stays broken, what was taken stays taken) and the way on is still there.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const FINAL_FLAGS = ['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt'];

/** What is left of the journey from the entry of a room (where a load puts the hero), reading what the world remembers. */
function finishFrom(d: Driver): void {
  const s = d.session;
  if (s.room.id === 'r1_gate') {
    toTheEastExit(d, { crouchZones: R1_CROUCH });
    arriveIn(d, 'r2_hall');
  }
  if (s.room.id === 'r2_hall') {
    toTheEastExit(d, { jumpAt: R2_SPIKES_JUMP });
    arriveIn(d, 'r3_chamber');
  }
  if (s.room.id === 'r3_chamber') {
    if (!s.flags.has('broken:r3_seal')) breakTheSeal(d); // the card is taken on the way (or was) and the bolt breaks the ward
    toTheEastExit(d);
    arriveIn(d, 'r4_sanctum');
  }
  if (s.room.id === 'r4_sanctum') {
    if (!s.flags.has('defeated:r4_boss')) beatTheWarden(d); // the Warden, and the reward it leaves
    else if (!s.flags.has('taken:air_dash')) {
      runTo(d, 84);
      d.stop();
      d.step(6);
      d.tap('interact');
      d.step(16);
    }
    toTheEastExit(d); // the way out of the world
  }
  d.step(20);
}

/** A game begun from a save, the way the page begins one. */
function loaded(save: ProgressData): Driver {
  const r = restoreFromProgress(save, ROOMS, WORLD.start);
  const d = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, ...r, ...QUICK } });
  d.settle();
  return d;
}

const key = (p: ProgressData): string => JSON.stringify({ ...p, flags: [...p.flags].sort(), abilities: [...p.abilities].sort() });

/**
 * The uninterrupted journey, with every save the REAL recorder made. The recorder saves "right after the tick that made the change" through a microtask,
 * which a synchronous script would never see run: here the microtasks are held and let go at the start of the next tick, which is the same moment.
 */
function playAndSave(): { saves: ProgressData[]; final: ProgressData; d: Driver } {
  const d = freshWorld();
  d.settle();
  const store = new ProgressStore(new MemoryStorage());
  const saves: ProgressData[] = [];
  const original = store.save.bind(store);
  store.save = (data) => {
    saves.push(JSON.parse(JSON.stringify(data)) as ProgressData);
    return original(data);
  };
  const held: Array<() => void> = [];
  const letGo = (): void => {
    while (held.length > 0) held.shift()!();
  };
  const realQueue = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (f: () => void): void => void held.push(f);
  let stop = (): void => {};
  try {
    stop = attachProgressRecorder(d.session, store);
    d.onFrame = letGo;
    finishFrom(d);
    d.onFrame = null;
    letGo();
  } finally {
    stop();
    globalThis.queueMicrotask = realQueue;
  }
  return { saves, final: captureProgress(d.session), d };
}

describe('the whole slice, from a new game to the end of the world', () => {
  const run = playAndSave();

  it('is finished by a scripted hero: four rooms, the card, the seal, the Warden and the way out — alive, with every flag the world gives and no volatile one', () => {
    const s = run.d.session;
    expect(s.room.id).toBe('r4_sanctum');
    expect(s.exitsReached.has('east'), 'the way out of the world was reached').toBe(true);
    expect(run.d.p.health.dead).toBe(false);
    expect(s.flags.list().sort()).toEqual(FINAL_FLAGS);
    expect(s.abilities.has('air_dash') && s.abilities.has('magic_attack') && s.abilities.has('dash')).toBe(true);
    expect(s.loadout.equipped?.id).toBe('card_spirit_bolt');
  });

  it('saves as it goes: each room the hero enters, each thing won — and what it saved last is what the game was', () => {
    // the saves are, in order, growing: nothing won is ever un-won by a later save
    expect(run.saves.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < run.saves.length; i++) {
      const before = new Set(run.saves[i - 1]!.flags);
      for (const f of before) expect(run.saves[i]!.flags, `save ${i} keeps ${f}`).toContain(f);
    }
    const places = run.saves.map((p) => `${p.at.room}:${p.at.entry}`);
    for (const room of ['r2_hall', 'r3_chamber', 'r4_sanctum']) expect(places, `a save at the door of ${room}`).toContain(`${room}:west`);
    expect(key(run.saves[run.saves.length - 1]!)).toBe(key(run.final));
    expect(run.saves.every((p) => p.flags.every((f) => !f.startsWith('~'))), 'no save ever holds a volatile flag').toBe(true);
    expect(run.final.checkpoint, 'nobody rested: the checkpoint is still the start of the world').toEqual({ room: START.room, entry: START.entry });
  });

  // the saves that differ: one per distinct state of the world
  const distinct = run.saves.filter((p, i) => run.saves.findIndex((q) => key(q) === key(p)) === i);

  it('there are saves at every stage the hero could have stopped at', () => {
    expect(distinct.length).toBeGreaterThanOrEqual(8);
    const stages = new Set(distinct.map((p) => `${p.at.room}|${p.flags.length}`));
    expect(stages.size).toBe(distinct.length);
  });

  it('the game begun from EACH of those saves can always be finished — and finishes as the same game (same flags, abilities, card, bottles and checkpoint)', () => {
    for (const save of distinct) {
      const d = loaded(save);
      const where = `${save.at.room}:${save.at.entry} with ${save.flags.length} flags`;
      expect(d.session.room.id, where).toBe(save.at.room);
      finishFrom(d);
      expect(d.session.exitsReached.has('east'), `${where}: the end was reached`).toBe(true);
      expect(d.p.health.dead, `${where}: alive`).toBe(false);
      expect(key(captureProgress(d.session)), `${where}: the same game at the end`).toBe(key(run.final));
    }
  });

  it('a defeat right after a load changes nothing that was won: the hero comes back at the checkpoint, the world is as it was left, and the way on is still there', () => {
    // every other save (one in two keeps this affordable: the walk back to R4 is the whole world again) — including the first and the last
    const picks = distinct.filter((_, i) => i % 2 === 0 || i === distinct.length - 1);
    for (const save of picks) {
      const d = loaded(save);
      const where = `${save.at.room} with ${save.flags.length} flags`;
      d.p.health.damage(d.p.health.current - 1);
      strikeOnPlayer(d, { damage: 99 }); // the last point of life, to a blow: the defeat begins as it does in play
      d.step(1);
      expect(d.p.health.dead, `${where}: the hero fell`).toBe(true);
      d.until(() => !d.session.death.active, 400);
      d.step(10);
      expect(d.p.health.dead, `${where}: and came back`).toBe(false);
      expect([d.session.room.id, d.session.arrival.entry], `${where}: at the checkpoint (nobody rested: the start)`).toEqual([START.room, START.entry]);
      for (const f of save.flags) expect(d.session.flags.has(f), `${where}: ${f} stays won`).toBe(true);
      expect(captureProgress(d.session).cards, `${where}: and the cards`).toEqual(save.cards);
      finishFrom(d);
      expect(d.session.exitsReached.has('east'), `${where}: the end is still there to be reached`).toBe(true);
      expect(key(captureProgress(d.session)), `${where}: the same game at the end`).toBe(key(run.final));
    }
  });
});
