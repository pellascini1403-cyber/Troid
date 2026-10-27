import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import { parseProgress, serializeProgress, type ProgressData } from '@/save/ProgressData';
import { arriveIn, beatTheWarden, breakTheSeal, freshWorld, R2_SPIKES_JUMP, toTheEastExit } from '../helpers/journey';
import { driver, type Driver } from '../helpers/sim';
import { R1_CROUCH } from '../helpers/vertical';

/**
 * SAVE → CLOSE → REOPEN → CONTINUE, through the first chapter of the adventure (docs/PROMPT20-LOG.md; the zones after it have their own saves in `worldSaves.test.ts`): the game is played from a new game to the Collapsed Nave by the scripted player, and at every way into a room the game is
 * saved, written out as the TEXT the browser keeps, read back as a cold start reads it, and a NEW session is begun from it — the player of the script goes on with that one. If anything a game needs were missing from a
 * save (a flag, an ability, a card, the bottles, the place), the next stretch of the journey would not be possible.
 *
 * And at ARBITRARY moments: a save made at any tick of the journey — in the middle of a fade between two rooms, in the middle of the fight with the guardian — is a game that can be continued.
 */

/** What a cold start does with what is on disk: its text, read back. */
const onDisk = (saved: ProgressData): ProgressData => {
  const text = serializeProgress(saved);
  const back = parseProgress(text);
  expect(back, 'what was written can be read back').not.toBeNull();
  expect(serializeProgress(back!), 'and reads back as exactly what was written').toBe(text);
  return back!;
};

/** The game as a cold start builds it from a save: the options `Game2D` gives the session. */
function resume(saved: ProgressData, seed = 1): Driver {
  const restored = restoreFromProgress(saved, ROOMS, WORLD.start);
  const d = driver({ room: ROOMS[restored.startRoom]!, entry: restored.startEntry, unlocked: restored.unlocked, seed, extra: { rooms: ROOMS, ...restored } });
  d.settle();
  return d;
}

/** The stretches of the journey, each ending where the next one begins: on arriving in a room. */
const STRETCHES: Array<{ name: string; play: (d: Driver) => void }> = [
  { name: 'R1: the hurdle, the pit, the crawl, the slime, the door', play: (d) => (toTheEastExit(d, { crouchZones: R1_CROUCH }), arriveIn(d, 'r2_hall')) },
  { name: 'R2: the ditch and its spikes, the slime beyond', play: (d) => (toTheEastExit(d, { jumpAt: R2_SPIKES_JUMP }), arriveIn(d, 'r3_chamber')) },
  { name: 'R3: the climb, the card, the bolt that breaks the seal, the lane', play: (d) => (breakTheSeal(d), toTheEastExit(d), arriveIn(d, 'r4_sanctum')) },
  { name: 'R4: the arena, the Warden, the Air Dash, the way on', play: (d) => (beatTheWarden(d), toTheEastExit(d), arriveIn(d, 'ru_nave')) },
];

/**
 * What a game IS, read from the session itself — not from a save of it: the place, the checkpoint, the memory of the world (without the volatile flags of a fight), what the hero can do, the cards and the bottles.
 * A reopened game is compared with the game that was saved by THIS, so a save that forgot something cannot agree with itself.
 */
const live = (d: Driver): unknown => ({
  at: d.session.arrival,
  checkpoint: d.session.checkpoint,
  flags: d.session.flags.list().filter((f) => !f.startsWith('~')),
  abilities: d.session.abilities.serialize(),
  cards: d.session.loadout.serialize(),
  bottleSlots: d.session.bottles.slots.length,
});

describe('the first chapter with a save, a close and a reopen at every way into a room', () => {
  it('is finished: the game that is reopened is the game that was saved, and every stretch can be played from it', () => {
    let d = freshWorld();
    d.settle();
    const roomsAt: string[] = [];
    STRETCHES.forEach((stretch, i) => {
      stretch.play(d);
      const game = live(d);
      const saved = onDisk(captureProgress(d.session));
      roomsAt.push(saved.at.room);
      if (i < STRETCHES.length - 1) {
        // closed and reopened: a new session from the text on disk
        const reopened = resume(saved);
        expect(live(reopened), `${stretch.name}: the reopened game is the game that was saved`).toEqual(game);
        expect(reopened.session.room.id, `${stretch.name}: it opens in the room it was saved in`).toBe(saved.at.room);
        expect(reopened.p.health.dead).toBe(false);
        expect(reopened.p.health.current, 'with the life the hero had… and a full one at least (a game is entered alive)').toBeGreaterThan(0);
        expect(reopened.session.flags.list().some((f) => f.startsWith('~')), 'no volatile flag came back').toBe(false);
        d = reopened;
      }
    });
    expect(roomsAt, 'saved on arriving in each room, the Nave included').toEqual(['r2_hall', 'r3_chamber', 'r4_sanctum', 'ru_nave']);
    // the end of the chapter: everything the Ruins give
    expect(d.session.flags.list().sort()).toEqual(['broken:r3_seal', 'defeated:r1_slime', 'defeated:r2_slime', 'defeated:r4_boss', 'taken:air_dash', 'taken:card_spirit_bolt']);
    expect(d.session.abilities.has('air_dash')).toBe(true);
    expect(d.session.loadout.equipped?.id).toBe('card_spirit_bolt');
    expect(d.p.health.dead).toBe(false);
  });

  it('what was won is never lost on the way: every flag of a save is in every later save', () => {
    let d = freshWorld();
    d.settle();
    let before = new Set<string>();
    for (const [i, stretch] of STRETCHES.entries()) {
      stretch.play(d);
      const saved = onDisk(captureProgress(d.session));
      for (const f of before) expect(saved.flags, `${stretch.name}: "${f}" is still there`).toContain(f);
      before = new Set(saved.flags);
      if (i < STRETCHES.length - 1) d = resume(saved);
    }
  });

  it('a game saved when the hero reached R4 can be reopened as many times as anyone likes, and is always the same game', () => {
    const d = freshWorld();
    d.settle();
    STRETCHES.slice(0, 3).forEach((s) => s.play(d));
    const saved = onDisk(captureProgress(d.session));
    const a = resume(saved);
    const b = resume(saved);
    a.step(120);
    b.step(120);
    expect(captureProgress(a.session).flags).toEqual(captureProgress(b.session).flags);
    expect(a.body.x).toBeCloseTo(b.body.x, 9);
    expect(a.session.rng.state).toBe(b.session.rng.state);
  });
});

describe('a save made at ANY moment of the journey is a game that can be continued', () => {
  it('in the middle of a fade between rooms, of a fight with the guardian, of a fall: it opens somewhere valid, alive, with what was won', () => {
    const d = freshWorld();
    d.settle();
    const seen = { saves: 0, mid: new Set<string>() };
    // saved on every 37th tick of the journey (a prime: it never lines up with the script's own rhythm), through the text on disk, and OPENED
    d.onFrame = () => {
      const s = d.session;
      if (s.now % 37 !== 0 || s.now === 0) return;
      const game = live(d);
      const saved = onDisk(captureProgress(s));
      seen.saves++;
      if (s.transition.active) seen.mid.add('a fade between two rooms');
      if (s.entities.some((e) => e.kind === 'guardian') && s.flags.has('~fight:r4_boss')) seen.mid.add('the fight with the guardian');
      if (s.death.active) seen.mid.add('a defeat');
      const reopened = resume(saved);
      expect(reopened.p.health.dead, `tick ${s.now}: opened alive`).toBe(false);
      expect(reopened.session.room.entries.some((e) => e.id === saved.at.entry), `tick ${s.now}: at an entry of the room`).toBe(true);
      const was = game as { flags: string[]; abilities: string[]; cards: unknown; bottleSlots: number };
      const now = live(reopened) as typeof was;
      expect(now.flags, `tick ${s.now}: with what was won`).toEqual(was.flags);
      expect(now.abilities, `tick ${s.now}: with what the hero can do`).toEqual(was.abilities);
      expect(now.cards, `tick ${s.now}: with the cards`).toEqual(was.cards);
      expect(now.bottleSlots, `tick ${s.now}: and the bottles`).toBe(was.bottleSlots);
      expect(reopened.session.flags.list().some((f) => f.startsWith('~')), `tick ${s.now}: with no fight left over`).toBe(false);
      // the first ticks of the reopened game are ordinary ones
      reopened.step(5);
      expect(reopened.p.health.dead).toBe(false);
    };
    STRETCHES.forEach((s) => s.play(d));
    expect(seen.saves, 'a save was made every 37 ticks of a journey of thousands').toBeGreaterThan(100);
    expect([...seen.mid].sort(), 'including in the middle of the things that move the world').toEqual(['a fade between two rooms', 'the fight with the guardian']);
  });
});
