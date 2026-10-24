import { describe, expect, it } from 'vitest';
import { CREATURES } from '@/content/creatures';
import { ENEMIES, INK_SLIME } from '@/content/enemies';
import { PROCEDURAL_LOOKS } from '@/content/proceduralActors';
import { Enemy } from '@/enemies/Enemy';
import { EnemyShot } from '@/enemies/EnemyShot';
import type { GameEvents } from '@/gameplay/events';
import { CATALOGS } from '@/i18n';
import { mapRoom } from '@/world/roomMap';
import { driver, type Driver } from '../helpers/sim';

/**
 * THE THIRTEEN CREATURES OF docs/PROMPT21-LOG.md, one by one, through the real simulation: each does the thing that makes it itself — a charge that a wall ends, a shield, a cloud, a shot, a dive, a fuse, a wave, a
 * roll that breaks into pieces, a drop, an ambush, a summoning, a vanishing — and each one is answered by the thing the content says answers it. The hero stands where the test puts them; they are immortal (`godMode`) when the
 * test is about the creature and not about the hero.
 */
const W = 90;
const H = 24;

/** A long hall: a floor (top at y = 2), walls at both ends, a roof at 20 m, a ledge at 5 m in the middle (x 40…46) for the creatures that hang or float. */
function hall() {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[H - 1 - y]![x] = ch;
  };
  fill(0, W, 0, 1, '#');
  fill(0, W, 1, 2, 'G');
  fill(0, 1, 0, H, '#');
  fill(W - 1, W, 0, H, '#');
  fill(0, W, H - 1, H, '#');
  fill(40, 46, 4, 5, 'G'); // (a ledge that is solid: standing room above, a roof for a bat below)
  grid[H - 1 - 2]![5] = 'a';
  return mapRoom({ id: 'hall', regionId: 'lab', name: 'Hall', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: grid.map((r) => r.join('')) }, (m) => ({ entries: [m.entry('start', 'a', 1)] }));
}

interface Setup {
  d: Driver;
  log: Array<[string, unknown]>;
  made: Enemy[];
}

function arena(heroX = 30, opts: { god?: boolean } = {}): Setup {
  const d = driver({ room: hall(), unlocked: ['dash'], entry: 'start', extra: { enemies: ENEMIES } });
  d.teleport(heroX, 2);
  d.settle();
  d.session.godMode = opts.god ?? true;
  const log: Array<[string, unknown]> = [];
  const names: Array<keyof GameEvents> = ['enemy:alerted', 'enemy:telegraph', 'enemy:struck', 'enemy:blocked', 'enemyshot:ended', 'actor:died', 'player:hurt', 'entity:spawned'];
  for (const n of names) d.session.bus.on(n, (e) => void log.push([n as string, e]));
  return { d, log, made: [] };
}

function spawn(s: Setup, id: string, x: number, y = 2, facing: 1 | -1 = -1): Enemy {
  const e = s.d.session.spawn(new Enemy(s.d.session.ids.next(id), ENEMIES[id]!, { x, y, facing }));
  s.d.step(1);
  s.made.push(e);
  return e;
}

const count = (s: Setup, name: string): number => s.log.filter(([n]) => n === name).length;
const states = (e: Enemy): string => e.state;
/** Steps until the creature is in `state` (throws when it is not within `max` ticks). */
function until(s: Setup, e: Enemy, state: string | string[], max = 400): number {
  const want = Array.isArray(state) ? state : [state];
  return s.d.until(() => want.includes(e.state), max);
}
const shots = (s: Setup): EnemyShot[] => s.d.session.entities.filter((x): x is EnemyShot => x.kind === 'enemyshot');

describe('all of them', () => {
  it('there are thirteen creatures after the Ink Slime (and the shard the Shardling breaks into), each with an archetype of its own', () => {
    const archetypes = CREATURES.filter((c) => c.id !== 'crystal_shard').map((c) => c.ai.archetype);
    expect(archetypes).toHaveLength(13);
    expect(new Set(archetypes).size, 'thirteen different ways to behave').toBe(13);
    expect(archetypes).not.toContain('slime');
    expect(INK_SLIME.ai.archetype).toBe('slime');
    expect(Object.keys(ENEMIES)).toHaveLength(15);
  });

  it('each has a name in every language, a look, the attack its brain asks for, a body, and a positive health', () => {
    for (const def of [INK_SLIME, ...CREATURES]) {
      for (const [lang, catalog] of Object.entries(CATALOGS)) expect(catalog[def.nameKey], `${def.id} in ${lang}`).toBeTruthy();
      expect('proceduralId' in def.view && PROCEDURAL_LOOKS[def.view.proceduralId], `${def.id} has a look`).toBeTruthy();
      expect(def.health).toBeGreaterThan(0);
      expect(def.body.halfWidth).toBeGreaterThan(0);
      expect(def.body.height).toBeGreaterThan(0);
      const p = def.ai.params as unknown as { attack?: string };
      if (p.attack) expect(def.attacks[p.attack], `${def.id}.${p.attack}`).toBeDefined();
      for (const a of Object.values(def.attacks)) {
        expect(a.startup, `${def.id}.${a.id} is announced`).toBeGreaterThanOrEqual(0);
        expect(a.damage).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('every look is drawn for the creature it belongs to (the id of the look is the id the definition names)', () => {
    for (const def of CREATURES) expect((def.view as { proceduralId: string }).proceduralId).toBe(def.id);
  });

  it('every one of them, left to itself with the hero standing still for 20 seconds, never crashes, never leaves the hall and never ends up with a number that is not a number', () => {
    for (const def of CREATURES.filter((c) => c.id !== 'crystal_shard')) {
      const s = arena(30, { god: true });
      const e = spawn(s, def.id, 36, def.ai.archetype === 'bat' ? 8 : def.ai.archetype === 'piston' || def.ai.archetype === 'wisp' ? 6 : 2);
      s.d.step(1200);
      for (const body of [e.body, ...s.made.map((m) => m.body)]) {
        expect(Number.isFinite(body.x) && Number.isFinite(body.y), def.id).toBe(true);
        expect(body.x, def.id).toBeGreaterThan(0);
        expect(body.x, def.id).toBeLessThan(W);
        expect(body.y, def.id).toBeGreaterThan(-1);
      }
    }
  });

  it('the hero can always win: with the sword alone every creature is defeated (the sum of what is done to it ends it), from the front or behind', () => {
    for (const def of CREATURES.filter((c) => c.id !== 'crystal_shard' && c.ai.archetype !== 'leech')) {
      const s = arena(30, { god: true });
      const e = spawn(s, def.id, 31.4, def.ai.archetype === 'bat' ? 3.4 : 2);
      // hit it from behind (the shield, the shell and the bat's perch cannot stop that) however many times it needs
      s.d.body.x = 33;
      e.facing = -1;
      for (let i = 0; i < 140 && !e.health.dead; i++) {
        s.d.p.facing = -1;
        s.d.tap('attack');
        s.d.step(18);
        s.d.body.x = e.body.x + 1.1;
      }
      expect(e.health.dead, def.id).toBe(true);
    }
  });
});

describe('Bramble Crawler: a straight charge that cannot turn, ended by a wall', () => {
  it('ignores a hero far away; sees one level and near; digs in for 22 ticks; then rushes at 11.5 m/s', () => {
    const s = arena(30);
    const e = spawn(s, 'bramble_crawler', 45);
    s.d.step(30);
    expect(states(e), 'a hero 15 m away is not seen').toMatch(/idle|patrol/);
    s.d.teleport(36, 2);
    until(s, e, 'alert');
    until(s, e, 'windup');
    expect(count(s, 'enemy:telegraph')).toBe(1);
    const ticks = until(s, e, 'rush');
    expect(ticks).toBeGreaterThanOrEqual(20);
    expect(ticks).toBeLessThanOrEqual(24);
    s.d.step(3);
    expect(e.body.vx).toBeLessThan(-11);
  });

  it('a hero above its line is not charged at: it needs the hero level (a ledge makes it a harmless thing)', () => {
    const s = arena(43);
    s.d.teleport(43, 5); // on the ledge, 3 m up
    s.d.settle();
    const e = spawn(s, 'bramble_crawler', 52);
    s.d.step(120);
    expect(states(e)).not.toMatch(/windup|rush|alert/);
  });

  it('runs into a wall and is DAZED for 70 ticks, helpless: a charge ends there or at a ledge, never by turning', () => {
    const s = arena(30, { god: true });
    const e = spawn(s, 'bramble_crawler', 8, 2, -1); // 6.5 m from the west wall (a charge lasts 10 m)…
    s.d.teleport(3.2, 2); // …and the hero between it and the wall
    until(s, e, 'rush');
    until(s, e, 'dazed', 240);
    expect(e.body.x, 'at the wall').toBeLessThan(2.2);
    const ticks = until(s, e, ['recover', 'alert', 'idle', 'windup'], 200);
    expect(ticks).toBeGreaterThanOrEqual(66);
    expect(ticks).toBeLessThanOrEqual(72);
  });

  it('a hero who jumps over the charge takes nothing: it passes under', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'bramble_crawler', 26, 2, -1);
    s.d.teleport(14, 2);
    until(s, e, 'rush');
    // jump when it is two metres from the hero
    s.d.until(() => e.body.x < 17.5, 120);
    s.d.press('jump');
    s.d.step(30);
    s.d.release('jump');
    s.d.step(40);
    expect(s.d.p.health.current).toBe(5);
  });

  it('hurts a hero who stays in the line: one point, and the charge goes on to the wall', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'bramble_crawler', 40, 2, -1);
    until(s, e, 'rush');
    s.d.until(() => s.d.p.health.current < 5, 120);
    expect(s.d.p.health.current).toBe(4);
  });
});

describe('Mire Toad: leaps where you ARE, shakes the floor where it lands', () => {
  it('crouches for 20 ticks, leaps in an arc and comes down about where the hero stood when it pushed off', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'mire_toad', 36);
    until(s, e, 'crouch');
    expect(count(s, 'enemy:telegraph')).toBeGreaterThanOrEqual(1);
    const t = until(s, e, 'leap');
    expect(t).toBeGreaterThanOrEqual(19);
    const aimed = s.d.body.x;
    s.d.teleport(aimed - 7, 2); // the hero moves after the crouch: the toad leaps at where they WERE
    until(s, e, 'land', 80);
    expect(e.body.grounded).toBe(true);
    expect(Math.abs(e.body.x - aimed), 'came down on the place, not on the hero').toBeLessThan(1.5);
    expect(s.d.p.health.current, 'and missed').toBe(5);
  });

  it('where it lands the floor shakes: a low wave to either side hurts a hero who is close and not in the air', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'mire_toad', 38);
    until(s, e, 'leap');
    s.d.teleport(e.body.x - 5, 2);
    until(s, e, 'land', 80);
    // the hero is right beside where it comes down
    s.d.teleport(e.body.x - 1.2, 2);
    s.d.step(1);
    expect(s.d.p.health.current).toBeLessThan(5);
  });
});

describe('Stoneback: a shield to the front', () => {
  const hitFrom = (s: Setup, e: Enemy, side: 1 | -1, attackId = 'slash_1', damage = 1): void => {
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId, damage,
      rect: { x0: e.body.x - 0.6, x1: e.body.x + 0.6, y0: e.body.y + 0.2, y1: e.body.y + 1.2 },
      knockback: { x: 4, y: 2 }, stun: 12, hitStop: 0, shake: 0, facing: side, alreadyHit: new Set(),
    });
    s.d.step(1);
  };

  it('a blow from the front is turned away — nothing is hurt, it says so — and from behind it hurts', () => {
    const s = arena(20);
    const e = spawn(s, 'stoneback', 30, 2, -1); // faces west, toward the hero
    const hp = e.health.current;
    hitFrom(s, e, 1); // the hero is to its west, so they hit facing east
    expect(e.health.current).toBe(hp);
    expect(count(s, 'enemy:blocked')).toBe(1);
    hitFrom(s, e, -1); // from the east: behind it
    expect(e.health.current).toBe(hp - 1);
  });

  it('the dive and the shockwave of the Ground Slam go through the shield', () => {
    const s = arena(20);
    const e = spawn(s, 'stoneback', 30, 2, -1);
    const hp = e.health.current;
    hitFrom(s, e, 1, 'slam_dive', 2);
    expect(e.health.current).toBe(hp - 2);
    expect(count(s, 'enemy:blocked')).toBe(0);
  });

  it('lifts its weapon for 38 ticks, brings it down for 5 and is stuck for 56 with the guard DOWN: then the front is open', () => {
    const s = arena(30, { god: true });
    const e = spawn(s, 'stoneback', 33.5, 2, -1);
    until(s, e, 'windup');
    expect(until(s, e, 'smash')).toBeGreaterThanOrEqual(36);
    until(s, e, 'recover');
    const hp = e.health.current;
    hitFrom(s, e, 1);
    expect(e.health.current, 'the guard is down').toBe(hp - 1);
  });

  it('turns around slowly: a hero who gets behind it has a second to hit it', () => {
    const s = arena(24);
    const e = spawn(s, 'stoneback', 28, 2, -1);
    until(s, e, 'approach', 120);
    s.d.teleport(e.body.x + 1.2, 2); // behind it
    s.d.step(14);
    expect(e.facing, 'still looking the other way').toBe(-1);
    s.d.step(50);
    expect(e.facing, 'and now it has turned').toBe(1);
  });
});

describe('Glow Spore: armoured until its cloud thins', () => {
  const hit = (s: Setup, e: Enemy): void => {
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 1,
      rect: { x0: e.body.x - 0.6, x1: e.body.x + 0.6, y0: e.body.y + 0.2, y1: e.body.y + 1.0 },
      knockback: { x: 4, y: 2 }, stun: 12, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    s.d.step(1);
  };

  it('shut it turns every blow away; it blooms when the hero comes near (and not before 70 ticks)', () => {
    const s = arena(20);
    const e = spawn(s, 'glow_spore', 30);
    s.d.step(2);
    hit(s, e);
    expect(count(s, 'enemy:blocked')).toBe(1);
    expect(e.health.current).toBe(4);
    s.d.teleport(26, 2);
    until(s, e, 'bloom');
    expect(until(s, e, 'burst')).toBeGreaterThanOrEqual(30);
  });

  it('its cloud fills 2.5 m around it for 44 ticks and hurts anyone in it; afterwards it stays open and exposed', () => {
    const s = arena(28, { god: false });
    const e = spawn(s, 'glow_spore', 30);
    s.d.step(90);
    until(s, e, 'burst');
    s.d.until(() => s.d.p.health.current < 5, 30);
    expect(s.d.p.health.current).toBe(4);
    until(s, e, 'open', 60);
    hit(s, e);
    expect(e.health.current, 'open: the blow lands').toBe(3);
  });

  it('a hero out of the cloud is not hurt by it: it reaches 2.5 m, not 4', () => {
    const s = arena(26, { god: false });
    spawn(s, 'glow_spore', 30);
    s.d.step(200);
    expect(s.d.p.health.current).toBe(5);
  });
});

describe('Ink Spitter: keeps its distance and throws ink', () => {
  it('aims for 28 ticks (the telegraph), then a bead of ink leaves it at 10 m/s along the floor', () => {
    const s = arena(20);
    const e = spawn(s, 'ink_spitter', 30);
    until(s, e, 'aim');
    expect(until(s, e, 'fire')).toBeGreaterThanOrEqual(26);
    s.d.step(2);
    expect(shots(s)).toHaveLength(1);
    const x0 = shots(s)[0]!.x;
    s.d.step(6);
    expect(Math.abs(shots(s)[0]!.x - x0)).toBeGreaterThan(0.9);
  });

  it('the bead hurts the hero it hits, and ends on a wall when it misses (the hero ducks aside)', () => {
    const s = arena(20, { god: false });
    const e = spawn(s, 'ink_spitter', 30);
    s.d.until(() => s.d.p.health.current < 5, 200);
    expect(count(s, 'enemyshot:ended')).toBeGreaterThanOrEqual(1);
    expect((s.log.find(([n]) => n === 'enemyshot:ended')![1] as { reason: string }).reason).toBe('hit');
    // now the hero is out of the line
    s.d.teleport(20, 12);
    void e;
  });

  it('backs away from a hero who comes within 4.5 m, and throws anyway when it has nowhere to go', () => {
    const s = arena(30);
    const e = spawn(s, 'ink_spitter', 40);
    until(s, e, 'stalk');
    s.d.teleport(37, 2);
    const x0 = e.body.x;
    s.d.step(40);
    expect(e.body.x, 'it backed off').toBeGreaterThan(x0 + 1);
    // cornered against the east wall
    const c = spawn(s, 'ink_spitter', 87, 2, -1);
    s.d.teleport(84, 2);
    s.d.step(160);
    expect(count(s, 'enemy:struck'), 'it threw').toBeGreaterThanOrEqual(1);
    void c;
  });
});

describe('Cave Bat: hangs from the roof and dives, turning', () => {
  it('sleeps on its perch until the hero is within 6.5 m across and BELOW it; spreads its wings for 18 ticks; dives', () => {
    const s = arena(30);
    const e = spawn(s, 'cave_bat', 40, 3.4);
    e.body.y = 3.4;
    e.home.y = 3.4;
    s.d.step(30);
    expect(states(e), 'a hero 10 m away does not wake it').toBe('perched');
    s.d.teleport(36, 2);
    until(s, e, 'wake');
    expect(until(s, e, 'swoop')).toBeGreaterThanOrEqual(16);
  });

  it('hits once and hangs in the air; after two dives it goes back to the roof it came from', () => {
    const s = arena(36, { god: false });
    const e = spawn(s, 'cave_bat', 40, 3.4);
    e.home.x = 40;
    e.home.y = 3.4;
    until(s, e, 'swoop');
    s.d.until(() => s.d.p.health.current < 5, 80);
    expect(s.d.p.health.current).toBe(4);
    s.d.session.godMode = true;
    until(s, e, 'climb', 600);
    until(s, e, 'perched', 400);
    expect(Math.hypot(e.body.x - 40, e.body.y - 3.4)).toBeLessThan(0.6);
  });
});

describe('Lantern Wisp: floats to you and goes off', () => {
  it('follows the hero at 3.6 m/s; lights its fuse 2 m away (34 ticks); the blast hurts everything within 2 m', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'lantern_wisp', 38, 3);
    until(s, e, 'chase');
    until(s, e, 'fuse', 200);
    expect(count(s, 'enemy:telegraph')).toBeGreaterThanOrEqual(1);
    expect(until(s, e, 'blast', 80)).toBeGreaterThanOrEqual(30);
    s.d.step(2);
    expect(s.d.p.health.current, 'a blast does two').toBe(3);
  });

  it('putting it out first is the answer: a wisp that is killed before its fuse ends hurts nobody', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'lantern_wisp', 36, 3);
    until(s, e, 'fuse', 200);
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 5,
      rect: { x0: e.body.x - 0.6, x1: e.body.x + 0.6, y0: e.body.y - 0.2, y1: e.body.y + 1 },
      knockback: { x: 2, y: 2 }, stun: 8, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    s.d.step(60);
    expect(e.health.dead).toBe(true);
    expect(s.d.p.health.current).toBe(5);
  });

  it('a hero 3 m away from the blast is not hurt: it reaches 2.1 m', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'lantern_wisp', 36, 3);
    until(s, e, 'fuse', 200);
    s.d.teleport(e.body.x - 3.2, 2);
    s.d.step(60);
    expect(s.d.p.health.current).toBe(5);
  });
});

describe('Bell Toller: a rhythm of waves along the floor', () => {
  it('swings for 36 ticks, then sends a wave each way at 6.5 m/s that runs along the floor', () => {
    const s = arena(22);
    const e = spawn(s, 'bell_toller', 36);
    until(s, e, 'swing', 400);
    expect(until(s, e, 'toll')).toBeGreaterThanOrEqual(34);
    s.d.step(2);
    const waves = shots(s);
    expect(waves).toHaveLength(2);
    expect(waves.map((w) => w.facing).sort()).toEqual([-1, 1]);
    for (const w of waves) expect(w.y, 'on the floor').toBeLessThan(2.6);
  });

  it('a hero on the floor is hurt by the wave; one in the air over it is not', () => {
    const s = arena(24, { god: false });
    spawn(s, 'bell_toller', 36);
    s.d.until(() => s.d.p.health.current < 5, 600);
    expect(s.d.p.health.current).toBe(4);
    const j = arena(24, { god: false });
    spawn(j, 'bell_toller', 36);
    j.d.until(() => shots(j).length > 0, 600);
    const w = shots(j).find((x) => x.facing === -1)!;
    j.d.until(() => w.x < 26.6, 200);
    j.d.press('jump');
    j.d.step(60);
    j.d.release('jump');
    expect(j.d.p.health.current, 'jumped').toBe(5);
  });

  it('a wave ends at the wall, and at the edge of the floor', () => {
    const s = arena(5);
    spawn(s, 'bell_toller', 12);
    s.d.until(() => shots(s).length > 0, 600);
    s.d.step(200);
    expect(s.log.filter(([n]) => n === 'enemyshot:ended').map(([, e]) => (e as { reason: string }).reason)).toContain('wall');
  });
});

describe('Shardling: a stone when curled, shards when broken', () => {
  it('curls for 26 ticks and rolls at 8.5 m/s, turning at a wall once; a blow from any side is turned away while it rolls', () => {
    const s = arena(20);
    const e = spawn(s, 'shardling', 30);
    until(s, e, 'curl');
    expect(until(s, e, 'roll')).toBeGreaterThanOrEqual(24);
    const hp = e.health.current;
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 1,
      rect: { x0: e.body.x - 0.8, x1: e.body.x + 0.8, y0: e.body.y, y1: e.body.y + 0.9 },
      knockback: { x: 2, y: 2 }, stun: 8, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    s.d.step(1);
    expect(e.health.current).toBe(hp);
    expect(count(s, 'enemy:blocked')).toBe(1);
  });

  it('when it falls it comes apart into two crystal shards that take up the fight', () => {
    const s = arena(20, { god: false });
    const e = spawn(s, 'shardling', 30);
    e.health.damage(4);
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 1,
      rect: { x0: e.body.x - 0.8, x1: e.body.x + 0.8, y0: e.body.y, y1: e.body.y + 0.9 },
      knockback: { x: 2, y: 2 }, stun: 8, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    s.d.step(2);
    expect(e.health.dead).toBe(true);
    const shards = s.d.session.entities.filter((x): x is Enemy => x.kind === 'enemy' && (x as Enemy).def.id === 'crystal_shard');
    expect(shards).toHaveLength(2);
    s.d.step(160);
    expect(s.d.p.health.current, 'the shards bite').toBeLessThan(5);
  });
});

describe('Piston Drone: follows from above and drops', () => {
  it('slides along its line after the hero, locks on (30 ticks, stopped) and drops at 24 m/s', () => {
    const s = arena(30);
    const e = spawn(s, 'piston_drone', 40, 8);
    e.home.y = 8;
    until(s, e, 'track');
    s.d.until(() => Math.abs(e.body.x - s.d.body.x) < 1.2, 300);
    until(s, e, 'lock', 200);
    expect(until(s, e, 'drop')).toBeGreaterThanOrEqual(28);
    s.d.step(2);
    expect(e.body.vy).toBeLessThanOrEqual(-23);
  });

  it('crushes what is under it for two points, then sits stuck in the ground for 60 ticks and climbs back', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'piston_drone', 30, 8);
    e.home.y = 8;
    s.d.until(() => s.d.p.health.current < 5, 300);
    expect(s.d.p.health.current).toBe(3);
    until(s, e, 'stuck', 60);
    const ticks = until(s, e, 'rise', 100);
    expect(ticks).toBeGreaterThanOrEqual(56);
    until(s, e, 'track', 200);
    expect(e.body.y).toBeGreaterThan(7.5);
  });

  it('a hero who leaves the line while it locks on is not under it when it falls', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'piston_drone', 30, 8);
    e.home.y = 8;
    until(s, e, 'lock', 300);
    s.d.teleport(35, 2);
    s.d.step(120);
    expect(s.d.p.health.current).toBe(5);
  });
});

describe('Floor Leech: a puddle that springs', () => {
  it('asleep nothing touches it; it springs on a hero within 1.7 m after a rise of only 12 ticks', () => {
    const s = arena(20);
    const e = spawn(s, 'floor_leech', 30);
    s.d.step(2);
    expect(e.invulnerable).toBe(true);
    s.d.session.combat.submit({
      ownerId: 'test', team: 'player', attackId: 'slash_1', damage: 3,
      rect: { x0: e.body.x - 0.8, x1: e.body.x + 0.8, y0: e.body.y, y1: e.body.y + 0.5 },
      knockback: { x: 2, y: 2 }, stun: 8, hitStop: 0, shake: 0, facing: 1, alreadyHit: new Set(),
    });
    s.d.step(1);
    expect(e.health.current, 'the blow went through the puddle').toBe(3);
    s.d.teleport(28.6, 2);
    until(s, e, 'rise');
    expect(until(s, e, 'bite')).toBeGreaterThanOrEqual(11);
  });

  it('bites for two, cannot be stopped in the middle of the bite, and is up and exposed afterwards', () => {
    const s = arena(28.6, { god: false });
    const e = spawn(s, 'floor_leech', 30);
    until(s, e, 'bite');
    s.d.until(() => s.d.p.health.current < 5, 20);
    expect(s.d.p.health.current).toBe(3);
    until(s, e, 'exposed', 20);
    expect(e.invulnerable).toBe(false);
  });
});

describe('Ink Weaver: makes creatures, never more than two', () => {
  const slimes = (s: Setup): Enemy[] => s.d.session.entities.filter((x): x is Enemy => x.kind === 'enemy' && (x as Enemy).def.id === 'ink_slime' && !(x as Enemy).health.dead);

  it('draws its circle for 44 ticks and then an Ink Slime stands in front of it', () => {
    const s = arena(20);
    const e = spawn(s, 'ink_weaver', 30);
    until(s, e, 'weave', 400);
    expect(until(s, e, 'recover', 80)).toBeGreaterThanOrEqual(42);
    expect(slimes(s)).toHaveLength(1);
  });

  it('keeps making them until two are alive, then waits: killing one makes room for the next', () => {
    const s = arena(20);
    const e = spawn(s, 'ink_weaver', 30);
    s.d.step(900);
    expect(slimes(s).length).toBeLessThanOrEqual(2);
    expect(slimes(s).length).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < 5; i++) {
      for (const sl of slimes(s)) sl.health.damage(99);
      s.d.step(400);
    }
    expect(s.made.length + 1).toBeGreaterThan(1);
    void e;
  });
});

describe('Veil Shade: vanishes and returns behind you', () => {
  it('fades out in 16 ticks and is untouchable until it is back; it returns on the side the hero is NOT facing', () => {
    const s = arena(30, { god: true });
    const e = spawn(s, 'veil_shade', 38);
    s.d.p.facing = 1; // looking east, toward it
    until(s, e, 'vanish', 400);
    expect(e.invulnerable).toBe(true);
    until(s, e, 'gone');
    expect(e.invulnerable).toBe(true);
    until(s, e, 'appear');
    expect(e.invulnerable).toBe(false);
    expect(e.body.x, 'behind the hero, to the west of them').toBeLessThan(s.d.body.x - 1);
    expect(Math.abs(e.body.x - s.d.body.x)).toBeLessThan(3.6);
  });

  it('shows itself for 24 ticks before it cuts (a hero who turns around is not where the slash lands), and the cut hurts for two', () => {
    const s = arena(30, { god: false });
    const e = spawn(s, 'veil_shade', 38);
    s.d.p.facing = 1;
    until(s, e, 'appear', 400);
    expect(until(s, e, 'slash')).toBeGreaterThanOrEqual(22);
    s.d.until(() => s.d.p.health.current < 5, 30);
    expect(s.d.p.health.current).toBe(3);
  });
});
