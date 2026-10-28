import { describe, expect, it } from 'vitest';
import { FADE } from '@/audio/conductor';
import { BOSS_MUSIC, ZONES, zoneOf } from '@/audio/zoneAudio';
import { BOSSES, ROOMS, WORLD } from '@/content';
import type { RoomDefinition } from '@/world/RoomDefinition';
import { game, INDEX, MIB } from '../../helpers/audioGame';
import { lab } from '../../helpers/lab';
import { Driver, makeSession } from '../../helpers/sim';

/**
 * THE WHOLE WORLD, HEARD (docs/PROMPT22-LOG.md §11): `gameAudio.test.ts` walks the first four rooms; this one walks all sixty-four, fights the seven guardians, and plays the moves of the hero AS THE SIMULATION MAKES THEM — over the real manifest, the real table of
 * places and the real conductor, on a fake Web Audio. What it protects is what a player can hear go wrong over a whole adventure: a zone with the wrong piece or none, a piece or a bed playing twice, a fight whose music does not come in or does not go out,
 * a move of the hero that makes no sound, a sound that is asked for and was never loaded, a world that does not fit in the memory of a phone.
 */
const MEMORY_MIB = 52;
const ARENAS = WORLD.rooms.filter((id) => (ROOMS[id]!.bosses ?? []).length > 0);

describe('the whole world, room by room', () => {
  it('every one of the sixty-four rooms plays the piece and the bed of its place, never twice, within the memory of a phone', async () => {
    const g = await game();
    const worst = { room: '', mib: 0 };
    const problems: string[] = [];
    for (const room of WORLD.rooms) {
      await g.go(room);
      g.rig.timers.fire(); // (what nobody holds any more is let go)
      const place = zoneOf(room);
      const now = [g.music.stats().current, g.ambience.stats().current];
      if (now[0] !== place.track || now[1] !== place.bed) problems.push(`${room}: plays ${JSON.stringify(now)}, its place says ${JSON.stringify([place.track, place.bed])}`);
      const copies = new Map<string, number>();
      for (const s of g.loops()) {
        const id = Object.keys(INDEX?.sounds ?? {}).find((k) => (g.rig.loader.get(k)[0] as unknown) === (s.buffer as unknown)) ?? '?';
        copies.set(id, (copies.get(id) ?? 0) + 1);
      }
      for (const [id, n] of copies) if (n > 1) problems.push(`${room}: ${n} copies of ${id}`);
      const mib = g.rig.loader.bytes / MIB;
      if (mib > worst.mib) Object.assign(worst, { room, mib });
    }
    expect(problems).toEqual([]);
    expect(worst.mib, `the most that is ever in memory (at ${worst.room}), in MiB`).toBeLessThan(MEMORY_MIB);
  });

  it('every room is heard as it is: the small sounds that play are its own, and every one it asks for was in memory', async () => {
    const g = await game();
    const problems: string[] = [];
    for (const room of WORLD.rooms) {
      await g.go(room);
      g.plays.length = 0;
      g.run(40);
      const own = new Set(ZONES[room]?.scatter.map((x) => x.id));
      for (const id of new Set(g.plays.filter((p) => p.startsWith('amb.')))) if (!own.has(id)) problems.push(`${room}: plays ${id}, which is not in its list`);
    }
    expect(problems).toEqual([]);
    expect(g.rig.engine.stats().dropped.notLoaded, 'nothing the places play was missing from memory').toBe(0);
    expect(g.rig.engine.stats().dropped.unknown).toBe(0);
  });
});

describe('the seven fights', () => {
  it('has a guardian in each of the seven arenas, and a piece for every one of them', () => {
    expect(ARENAS).toHaveLength(7);
    const defs = ARENAS.map((id) => BOSSES[ROOMS[id]!.bosses![0]!.guardian]!);
    for (const def of defs) expect(BOSS_MUSIC[def.id], def.id).toBe('warden');
    expect(INDEX?.tracks['warden']).toBeDefined();
  });

  for (const arena of ARENAS) {
    const def = BOSSES[ROOMS[arena]!.bosses![0]!.guardian]!;
    it(`${arena}: ${def.id} brings its piece in at the wake, turns it up at the second phase, and the calm of the place comes back after its fall, with the victory between`, async () => {
      const g = await game();
      await g.go(arena);
      const place = zoneOf(arena);
      expect(g.rig.loader.has('boss.wake'), 'the sounds of the boss are in memory once the hero is in the arena').toBe(true);
      expect(g.music.stats().current).toBe(place.track);
      g.bus.emit('boss:started', { id: 'b', defId: def.id, nameKey: 'boss.name', health: 30, maxHealth: 30, x: 40, y: 0 });
      await g.rig.settle();
      g.run(2);
      expect(g.music.stats().current, 'the fight has its piece').toBe(BOSS_MUSIC[def.id]);
      expect(g.music.stats().layers['drive']).toBeCloseTo(0.45, 6);
      expect(g.plays).toContain('boss.wake');
      g.bus.emit('boss:phase', { id: 'b', defId: def.id, phase: 2, x: 40, y: 0 });
      expect(g.music.stats().layers['drive'], 'it burns hotter in the second phase').toBe(1);
      g.bus.emit('boss:defeated', { id: 'b', defId: def.id, x: 40, y: 0 });
      g.run(0.3);
      expect(g.plays).toContain('boss.death');
      g.run(2.5);
      await g.rig.settle();
      g.run(FADE.bossOut + 1);
      expect(g.plays).toContain('stinger.victory');
      expect(g.music.stats().current, 'after the fall the place has its own piece again').toBe(place.track);
      const copies = g.loops().length;
      expect(copies, 'at most a piece and a bed are playing').toBeLessThanOrEqual(3);
    });
  }
});

/**
 * THE MOVES OF THE HERO, AS THE SIMULATION MAKES THEM: a real session in a room drawn for them, with the audio listening to ITS bus. Each move is made with the hands (the way the game plays it) and must be heard — the six that were learned and the
 * things of the world they open.
 */
describe('the moves and the mechanisms, as the simulation makes them', () => {
  const ALL = ['dash', 'air_dash', 'double_jump', 'wall_jump', 'ground_slam'];

  async function hero(room: RoomDefinition, entry: string, abilities: string[] = ALL) {
    const session = makeSession({ room, unlocked: abilities, entry });
    session.loadout.acquire('card_spirit_bolt');
    const g = await game({ bus: session.bus as never, room: 'r1_gate' });
    const d = new Driver(session);
    /** One stretch of play: the simulation and the audio clock go on together (the sound of a moment is heard after it). */
    const play = (n: number): void => {
      for (let i = 0; i < n; i++) {
        d.step(1);
        g.run(1 / 60);
      }
    };
    play(40); // the landing at the entry
    const heard = (what: () => void, ticks = 24): string[] => {
      g.rig.ctx.advance(5); // past every cooldown of what was heard before
      g.plays.length = 0;
      what();
      play(ticks);
      return [...g.plays];
    };
    return { g, d, play, heard };
  }

  it('every sound the hero\'s moves ask for is one of the core sounds, which are always in memory', () => {
    for (const id of ['hero.dash.ground', 'hero.dash.air', 'hero.jump', 'hero.jump.air', 'hero.land.heavy', 'hero.slash.1', 'hero.slash.air', 'hero.slash.crouch', 'magic.cast.start', 'magic.cast.release', 'hit.bolt', 'interact.activate', 'gate.open', 'seal.break', 'seal.reject']) {
      expect(INDEX?.sounds[id]?.group, id).toBe('core');
    }
  });

  it('the dash, the air dash, the double jump, the wall jump, the Spirit Bolt and the slash each sound', async () => {
    const { d, heard, play } = await hero(lab(), 'start');
    expect(heard(() => d.right().tap('dash')), 'the dash on foot').toContain('hero.dash.ground');
    d.stop();
    play(40);
    expect(heard(() => d.tap('jump'), 4), 'the jump').toContain('hero.jump');
    play(10);
    expect(d.body.grounded, 'in the air for the second jump').toBe(false);
    expect(heard(() => d.tap('jump'), 4), 'the second jump, in the air').toContain('hero.jump.air');
    play(4);
    expect(heard(() => d.left().tap('dash'), 4), 'the dash in the air').toContain('hero.dash.air');
    d.stop();
    play(200);
    expect(heard(() => d.tap('attack')), 'the first slash').toContain('hero.slash.1');
    play(40);
    const bolt = heard(() => d.tap('ability'), 30);
    expect(bolt, 'the Spirit Bolt gathers').toContain('magic.cast.start');
    expect(bolt, 'and leaves').toContain('magic.cast.release');
  });

  it('the wall jump sounds: the kick off the wall is an air jump', async () => {
    const { d, heard, play } = await hero(lab(), 'shaft');
    d.left().step(40);
    d.press('jump').step(24);
    d.release('jump');
    d.until(() => d.p.controller.wallSliding, 120);
    expect(heard(() => d.tap('jump'), 6), 'the kick off the wall').toContain('hero.jump.air');
    d.stop();
    play(10);
  });

  it('the Ground Slam sounds where it lands: a heavy landing, and the camera shakes (the dive and the hover are silent: a sound of their own is still to be made)', async () => {
    const { g, d, heard, play } = await hero(lab(), 'slam');
    d.press('jump').step(20);
    d.release('jump').step(10);
    let shook = 0;
    d.session.bus.on('player:slammed', (e) => (shook += e.shake));
    const sounds = heard(() => {
      d.moveY = -1;
      d.tap('attack');
    }, 70);
    expect(shook, 'the wave shook the camera').toBeGreaterThan(0);
    expect(sounds, 'the landing it makes is heard as a heavy one').toContain('hero.land.heavy');
    d.stop();
    play(30);
    expect(g.rig.engine.stats().dropped.unknown).toBe(0);
  });

  it('a lever sounds, the door it opens sounds, and the cracked floor the slam breaks sounds: the mechanisms of the world are heard', async () => {
    // the lever of the Root Cellar and its lift
    const cellar = await hero(ROOMS['rt_cellar']!, 'west');
    cellar.d.teleport(9.5, 7).step(30);
    expect(cellar.heard(() => cellar.d.tap('interact')), 'the lever').toContain('interact.activate');
    // the Nave: the crack in the floor, broken by the slam
    const nave = await hero(ROOMS['ru_nave']!, ROOMS['ru_nave']!.entries[0]!.id);
    nave.d.teleport(47.5, 7).step(2);
    const sounds = nave.heard(() => {
      nave.d.moveY = -1;
      nave.d.tap('attack');
    }, 120);
    expect(nave.d.session.flags.has('broken:ru_nave_crack'), 'the slam broke the floor').toBe(true);
    expect(sounds, 'the floor breaks with the sound of a seal').toContain('seal.break');
    expect(sounds, 'and the way it held opens').toContain('gate.open');
  });

  it('lands on every kind of cue the simulation can raise without a sound missing from memory or from the manifest', async () => {
    const { g, d, play } = await hero(lab(), 'start');
    // a long, rough stretch of play: moves, blows, hurts, the bottle
    d.right().step(50);
    d.tap('jump');
    play(60);
    d.tap('attack');
    play(30);
    d.session.player.health.damage(2);
    d.tap('bottle');
    play(60);
    d.stop();
    expect(g.rig.engine.stats().dropped.unknown, 'no cue was left without a sound').toBe(0);
    expect(g.rig.engine.stats().dropped.notLoaded, 'no sound was asked for that was not in memory').toBe(0);
  });
});
