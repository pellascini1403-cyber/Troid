import { describe, expect, it } from 'vitest';
import { attachProgressRecorder } from '@/app/progressRecorder';
import { buildProfile } from '@/app/profile';
import { ROOMS, START, WORLD } from '@/content';
import { PlayStats } from '@/gameplay/PlayStats';
import { DEFAULT_TRANSITION } from '@/gameplay/RoomTransition';
import { restoreFromProgress } from '@/gameplay/progress';
import { parseProgress, PROGRESS_VERSION } from '@/save/ProgressData';
import { ProgressStore } from '@/save/ProgressStore';
import { MemoryStorage } from '@/save/StorageAdapter';
import { buildMapLayout, mapPoint, mapScene, type MapScene } from '@/world/worldMap';
import { driver, type Driver } from '../helpers/sim';

/**
 * THE MAP OF A GAME BEING PLAYED (docs/PROMPT19-LOG.md), on the REAL world: it shows the rooms the hero has been in — the list the game already counts and the save already keeps — the ways the world's flags have
 * opened, and where the hero stands; and a saved game that is loaded again shows the same map. There is no second record of what was discovered: the map and the profile read the same one.
 */
const T = DEFAULT_TRANSITION;
const WHOLE = T.fadeOut + T.hold + T.fadeIn;
const LAYOUT = buildMapLayout(WORLD, ROOMS);
/** The flags of a hero who has beaten what stood in the way of the first three rooms. */
const OPEN = ['defeated:r1_slime', 'defeated:r2_slime', 'broken:r3_seal'];

interface Game {
  d: Driver;
  stats: PlayStats;
  scene(): MapScene;
}

/** A session on the whole world in `room`, with the counts a game keeps attached to it, and the map read from both the way the menu reads it. */
function game(room = 'r1_gate', entry: string | undefined = undefined, flags: readonly string[] = OPEN, counted: { rooms: string[] } = { rooms: [] }): Game {
  const d = driver({ room: ROOMS[room]!, ...(entry ? { entry } : {}), unlocked: ['dash'], extra: { rooms: ROOMS, flags: [...flags] } });
  d.settle();
  const stats = new PlayStats({ ticks: 0, deaths: 0, kills: 0, rooms: counted.rooms });
  stats.attach(d.session.bus, d.session.room.id);
  const scene = (): MapScene =>
    mapScene(LAYOUT, { visited: stats.snapshot(d.session.now).rooms, flag: (f) => d.session.flags.has(f), room: d.session.room.id, hero: { x: d.body.x, y: d.body.y }, checkpoint: d.session.checkpoint });
  return { d, stats, scene };
}

/** Walks into the exit of the room the hero is in and lets the whole transition play. */
function through(d: Driver, exitId: string): void {
  const r = d.session.room.exits!.find((e) => e.id === exitId)!.rect;
  d.teleport((r.x0 + r.x1) / 2, r.y0);
  d.step(1);
  d.until(() => !d.session.transition.active, WHOLE + 20);
  d.settle();
}
const ids = (s: MapScene): string[] => s.rooms.map((r) => r.id);

describe('the map follows the hero through the world', () => {
  it('a new game shows the first room alone, the hero in it, and the way on shut into the unknown', () => {
    const g = game('r1_gate', 'start', []);
    const s = g.scene();
    expect(ids(s)).toEqual(['r1_gate']);
    expect(s.current).toBe('r1_gate');
    expect(s.hero?.room).toBe('r1_gate');
    expect(s.links).toEqual([]);
    expect(s.rooms[0]!.doors[0]).toMatchObject({ exit: 'east', state: 'locked', known: false });
    expect([s.discovered, s.total]).toEqual([1, 108]);
  });

  it('every room the hero walks into joins the map, with the connection to the one before, and the hero is where they stand', () => {
    const g = game();
    through(g.d, 'east');
    expect(g.d.session.room.id).toBe('r2_hall');
    let s = g.scene();
    expect(ids(s)).toEqual(['r1_gate', 'r2_hall']);
    expect(s.current).toBe('r2_hall');
    expect(s.links.map((l) => l.id)).toEqual(['r1_gate:east~r2_hall:west']);
    expect(s.rooms.find((r) => r.id === 'r2_hall')!.pois.map((p) => p.kind)).toEqual(['rest']); // R2's shrine appears with its room
    through(g.d, 'east');
    through(g.d, 'east');
    s = g.scene();
    expect(ids(s)).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
    expect(s.links).toHaveLength(3);
    expect(s.current).toBe('r4_sanctum');
    expect([s.discovered, s.total]).toEqual([4, 108]);
    // the guardian's arena is on the map of a room the hero is in; the way on past it, to a room not yet seen, is a way still shut
    const sanctum = s.rooms.find((r) => r.id === 'r4_sanctum')!;
    expect(sanctum.pois.map((p) => p.kind).sort()).toEqual(['boss', 'rest']);
    expect(sanctum.doors.find((d) => d.exit === 'east')).toMatchObject({ state: 'locked', known: false });
    expect(sanctum.doors.some((d) => d.end), 'the Sanctum is not the end of the world any more').toBe(false);
  });

  it('the hero\'s mark moves with the hero inside the room, and stays inside the room\'s box', () => {
    const g = game('r2_hall', 'west', OPEN, { rooms: ['r1_gate'] });
    const room = LAYOUT.rooms.get('r2_hall')!;
    const near = g.scene().hero!;
    g.d.teleport(60, 0);
    const far = g.scene().hero!;
    expect(far.x).toBeGreaterThan(near.x + 40);
    expect(far).toMatchObject(mapPoint(room, g.d.body.x, g.d.body.y));
    for (const p of [near, far]) {
      expect(p.x).toBeGreaterThanOrEqual(room.rect.x0);
      expect(p.x).toBeLessThanOrEqual(room.rect.x1);
      expect(p.y).toBeGreaterThanOrEqual(room.rect.y0);
      expect(p.y).toBeLessThanOrEqual(room.rect.y1);
    }
  });

  it('a way opens on the map when the world opens it: the flag that is set, and nothing else', () => {
    const g = game('r1_gate', 'start', []);
    const east = (): string => g.scene().rooms[0]!.doors.find((d) => d.exit === 'east')!.state;
    expect(east()).toBe('locked');
    expect(g.scene().rooms[0]!.gates.map((x) => x.open)).toEqual([false]); // the stone door of R1 is drawn shut
    g.d.session.flags.set('defeated:r1_slime');
    expect(east()).toBe('open');
    expect(g.scene().rooms[0]!.gates.map((x) => x.open)).toEqual([true]);
    g.d.session.flags.set('broken:r3_seal'); // another room's flag opens nothing here
    expect(east()).toBe('open');
  });

  it('the places of interest take their state from the world: a ward broken, a guardian fallen, the shrine the hero comes back to', () => {
    const g = game('r2_hall', 'west', ['defeated:r1_slime', 'defeated:r2_slime'], { rooms: ['r1_gate'] });
    const pois = (): Array<{ kind: string; room: string; done: boolean; active: boolean }> => g.scene().rooms.flatMap((r) => r.pois).map((p) => ({ kind: p.kind, room: p.room, done: p.done, active: p.active }));
    // the hero came into R2 by its west door: the shrine they come back to is where they began, not this one
    expect(pois()).toEqual([{ kind: 'rest', room: 'r2_hall', done: false, active: false }]);
    // resting at the shrine of the room makes it the one they come back to — and the map marks it
    const shrine = g.d.session.room.interactables!.find((i) => i.kind === 'rest')!;
    g.d.teleport(shrine.x, shrine.y).settle();
    g.d.step(2);
    g.d.tap('interact');
    g.d.step(14);
    expect(g.d.session.checkpoint).toEqual({ room: 'r2_hall', entry: 'rest' });
    expect(pois()).toEqual([{ kind: 'rest', room: 'r2_hall', done: false, active: true }]);
    // the seal of R3 and the guardian of R4 are marked undone until the world says otherwise
    const late = game('r4_sanctum', 'west', ['defeated:r1_slime', 'defeated:r2_slime', 'broken:r3_seal'], { rooms: ['r1_gate', 'r2_hall', 'r3_chamber'] });
    const lateState = (): Record<string, boolean> => Object.fromEntries(late.scene().rooms.flatMap((r) => r.pois).filter((p) => p.kind !== 'rest').map((p) => [`${p.kind}:${p.room}`, p.done]));
    expect(lateState()).toEqual({ 'seal:r3_chamber': true, 'boss:r4_sanctum': false });
    late.d.session.flags.set('defeated:r4_boss');
    expect(lateState()).toEqual({ 'seal:r3_chamber': true, 'boss:r4_sanctum': true });
  });
});

describe('what was discovered is saved with the game and comes back with it', () => {
  async function played(): Promise<{ storage: MemoryStorage; game: Game }> {
    const storage = new MemoryStorage();
    const store = new ProgressStore(storage);
    const g = game('r1_gate', 'start');
    attachProgressRecorder(g.d.session, store, { stats: g.stats, now: () => 1_760_000_000_000 });
    through(g.d, 'east');
    through(g.d, 'east');
    g.d.session.flags.set('a_flag_to_force_a_save');
    await Promise.resolve();
    await store.flush();
    return { storage, game: g };
  }

  it('the save holds the rooms the hero has been in (the same list the profile counts), sorted, and nothing else about the map', async () => {
    const { storage, game: g } = await played();
    const saved = parseProgress((await storage.get('troid.progress')) ?? '')!;
    expect(saved.stats.rooms).toEqual(['r1_gate', 'r2_hall', 'r3_chamber']);
    expect(saved.saveVersion).toBe(PROGRESS_VERSION);
    expect(Object.keys(saved).sort()).toEqual(['abilities', 'at', 'bottleSlots', 'cards', 'checkpoint', 'flags', 'saveVersion', 'savedAt', 'stats']);
    // map and profile read the one record
    const profile = buildProfile(g.d.session, g.stats.snapshot(g.d.session.now), 1);
    expect(profile.rooms.visited).toBe(g.scene().discovered);
  });

  it('a loaded game shows the same map: the rooms, the connections, the open ways and where the hero comes in', async () => {
    const { storage, game: before } = await played();
    const saved = parseProgress((await storage.get('troid.progress')) ?? '')!;
    const restored = restoreFromProgress(saved, ROOMS, START);
    const after = game(restored.startRoom, restored.startEntry, restored.flags, restored.stats);
    const a = before.scene();
    const b = after.scene();
    expect(ids(b)).toEqual(ids(a));
    expect(b.links.map((l) => l.id)).toEqual(a.links.map((l) => l.id));
    expect(b.rooms.map((r) => r.doors.map((d) => d.state))).toEqual(a.rooms.map((r) => r.doors.map((d) => d.state)));
    expect(b.current).toBe(restored.startRoom);
    expect(b.hero?.room).toBe(restored.startRoom);
    // …and the fourth room, which the hero had not been to, is still not there
    expect(ids(b)).not.toContain('r4_sanctum');
  });

  it('the map discovered on a loaded game keeps growing from where it was (the loaded list is the start, not a copy that is lost)', async () => {
    const { storage } = await played();
    const restored = restoreFromProgress(parseProgress((await storage.get('troid.progress')) ?? '')!, ROOMS, START);
    const g = game(restored.startRoom, restored.startEntry, restored.flags, restored.stats);
    expect(ids(g.scene())).toEqual(['r1_gate', 'r2_hall', 'r3_chamber']);
    through(g.d, 'east');
    expect(g.d.session.room.id).toBe('r4_sanctum');
    expect(ids(g.scene())).toEqual(['r1_gate', 'r2_hall', 'r3_chamber', 'r4_sanctum']);
  });

  it('a save from before the profile existed (version 1) still gives a map: the two rooms it knew of', () => {
    const v1 = JSON.stringify({ saveVersion: 1, at: { room: 'r2_hall', entry: 'west' }, checkpoint: { room: 'r1_gate', entry: 'start' }, flags: ['defeated:r1_slime'], abilities: ['dash'], cards: { owned: [], equipped: null }, bottleSlots: 3 });
    const restored = restoreFromProgress(parseProgress(v1)!, ROOMS, START);
    const g = game(restored.startRoom, restored.startEntry, restored.flags, restored.stats);
    expect(ids(g.scene())).toEqual(['r1_gate', 'r2_hall']);
    expect(g.scene().current).toBe('r2_hall');
  });

  it('a save that names a room the world does not have shows the rooms it does, and the game does not break on the rest', () => {
    const g = game('r1_gate', 'start', [], { rooms: ['r1_gate', 'the_moon', 'r3_chamber'] });
    expect(ids(g.scene())).toEqual(['r1_gate', 'r3_chamber']); // r3 is on the map (it was visited) even though the way to it is not
    expect(g.scene().discovered).toBe(2);
  });
});
