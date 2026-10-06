import { describe, expect, it } from 'vitest';
import { ROOMS, WORLD } from '@/content';
import { INK_WARDEN } from '@/content/enemies';
import { resolveCameraView } from '@/camera/cameraZones';
import { captureProgress, restoreFromProgress } from '@/gameplay/progress';
import type { GameEvents } from '@/gameplay/events';
import type { Guardian } from '@/enemies/Guardian';
import { strike, strikeOnPlayer } from '../helpers/combat';
import { fightTheWarden } from '../helpers/fighter';
import { runTo } from '../helpers/hops';
import { driver, type Driver, type MakeOptions } from '../helpers/sim';

/**
 * The Ink Warden in the REAL sanctum (docs/PROMPT6-LOG.md S29): the arena is a closed room for the length of the fight — the hero's feet crossing
 * x = 27.5 wake the Warden and both doors shut — and nobody leaves it but by winning (the doors open, the reward appears, the way out of the world
 * works) or by losing (back at the shrine of the vestibule, the Warden whole and dormant again, the doors open, nothing duplicated). The fight is
 * proven WINNABLE by a scripted fighter on many seeds, saved correctly (no volatile flag ever reaches a save) and reproducible bit for bit.
 */
const QUICK = { death: { dying: 6, fadeOut: 4, hold: 4, fadeIn: 4, skipAfter: 1 } };
const FLAGS = ['defeated:r1_slime', 'defeated:r2_slime', 'taken:card_spirit_bolt', 'broken:r3_seal'];
const FIGHT = '~fight:r4_boss';
const DEFEATED = 'defeated:r4_boss';
const R4 = ROOMS.r4_sanctum!;

function r4(entry = 'west', opts: { flags?: string[]; seed?: number; extra?: MakeOptions['extra'] } = {}): Driver {
  const d = driver({ room: R4, entry, unlocked: ['dash'], seed: opts.seed ?? 1, extra: { rooms: ROOMS, flags: opts.flags ?? FLAGS, ...QUICK, ...opts.extra } });
  d.settle();
  return d;
}
const boss = (d: Driver): Guardian | undefined => d.session.entities.find((e): e is Guardian => e.kind === 'guardian');
const doors = (d: Driver): boolean[] => ['door_w', 'door_e'].map((id) => d.session.collision.get(id)!.enabled);
const watch = (d: Driver, types: readonly (keyof GameEvents)[]): string[] => {
  const log: string[] = [];
  for (const t of types) d.session.bus.on(t, ((p: unknown) => void log.push(`${t}${p && typeof p === 'object' ? ' ' + JSON.stringify(p) : ''}`)) as never);
  return log;
};
/** Into the arena through the open west door: the Warden wakes. */
function wake(d: Driver): void {
  runTo(d, 30);
  d.stop();
  d.step(3);
}
const fall = (d: Driver): void => {
  d.p.health.damage(d.p.health.current - 1);
  strikeOnPlayer(d, { damage: 99 });
  d.step(1);
  expect(d.p.health.dead).toBe(true);
  d.until(() => !d.session.death.active, 600);
  d.step(10);
};

describe('the sanctum before the fight', () => {
  it('the Warden waits dormant in its arena, the doors are open and the vestibule is quiet: the shrine is the last place to rest', () => {
    const d = r4();
    expect(boss(d)?.state).toBe('dormant');
    expect([boss(d)!.x, boss(d)!.facing]).toEqual([58, -1]);
    expect(doors(d)).toEqual([false, false]);
    expect(d.session.flags.has(FIGHT)).toBe(false);
    d.step(300);
    expect(boss(d)!.state, 'it does not wake by itself').toBe('dormant');
  });

  it('arriving from R3 or from the shrine never wakes it: both entries are outside the arena', () => {
    for (const entry of ['west', 'rest']) {
      const d = r4(entry);
      d.step(120);
      expect(boss(d)!.state, entry).toBe('dormant');
    }
  });

  it('the vestibule is free to walk: up to the west door, and the shrine rests the hero, who comes back here after a defeat', () => {
    const d = r4('west');
    runTo(d, 14);
    d.stop();
    d.step(4);
    d.tap('interact');
    d.step(14);
    expect(d.session.checkpoint).toEqual({ room: 'r4_sanctum', entry: 'rest' });
  });
});

describe('the fight begins', () => {
  it('the hero\'s feet crossing x = 27.5 wake it: announced once, the fight flag up, BOTH doors shut — and the hero is inside, not under a door', () => {
    const d = r4();
    const log = watch(d, ['boss:started', 'gate:changed']);
    d.teleport(27.4, 0).settle();
    d.step(3);
    expect(boss(d)!.state, 'at 27.4 it still sleeps').toBe('dormant');
    expect(doors(d)).toEqual([false, false]);
    d.teleport(27.6, 0).settle();
    d.step(3);
    expect(boss(d)!.state).toBe('intro');
    expect(log.filter((l) => l.startsWith('boss:started'))).toHaveLength(1);
    expect(d.session.flags.has(FIGHT)).toBe(true);
    expect(doors(d)).toEqual([true, true]);
    expect(log.filter((l) => l.startsWith('gate:changed')).map((l) => JSON.parse(l.slice('gate:changed '.length)).gateId).sort()).toEqual(['arena_door_e', 'arena_door_w']);
    expect(d.body.x, 'the hero is 1 m beyond the door').toBeGreaterThan(26.5 + 0.35);
  });

  it('nobody leaves while it lasts: the hero cannot walk back out of the west door, nor on through the east one — and the way out of the world does nothing', () => {
    const d = r4();
    wake(d);
    d.left();
    d.step(240);
    expect(d.body.x, 'the west door holds').toBeGreaterThan(26.5);
    d.stop();
    d.teleport(64.5, 0).settle();
    d.right();
    d.step(120);
    expect(d.body.x, 'the east door holds').toBeLessThan(65.5);
    d.stop();
    expect(d.session.exitsReached.size).toBe(0);
  });

  it('the camera is held to the arena for the fight (the zone has no flag to wait for yet): the view cannot show the vestibule or the reward chamber', () => {
    const d = r4();
    wake(d);
    const v = resolveCameraView(R4, d.session.flags, d.body.x, d.body.y);
    expect(v.zone).toBe('arena');
    expect(v.bounds.x0).toBeGreaterThanOrEqual(25);
    expect(v.bounds.x1).toBeLessThanOrEqual(67);
  });
});

describe('losing', () => {
  it('a defeat in the fight brings the hero back to the shrine: the Warden is dormant and WHOLE, the doors are open, the fight flag is gone — and there is ONE Warden', () => {
    const d = r4('rest'); // the hero comes in at the shrine (their checkpoint)
    wake(d);
    d.until(() => boss(d)!.state === 'telegraph', 400);
    strike(d, { team: 'player', rect: { x0: boss(d)!.x - 0.4, x1: boss(d)!.x + 0.4, y0: 0.3, y1: 1.4 }, damage: 3, attackId: 'test_blow', hitStop: 0 });
    d.step(1);
    expect(boss(d)!.health.current).toBeLessThan(INK_WARDEN.health);
    fall(d);
    expect(d.session.room.id).toBe('r4_sanctum');
    expect(d.session.entities.filter((e) => e.kind === 'guardian')).toHaveLength(1);
    expect(boss(d)!.state).toBe('dormant');
    expect(boss(d)!.health.current).toBe(INK_WARDEN.health);
    expect([boss(d)!.x, boss(d)!.facing]).toEqual([58, -1]);
    expect(doors(d)).toEqual([false, false]);
    expect(d.session.flags.has(FIGHT)).toBe(false);
    expect(d.body.x, 'at the shrine').toBeCloseTo(14.8, 1);
    expect(d.p.health.current).toBe(d.p.health.max);
    expect(d.session.flags.has(DEFEATED)).toBe(false);
  });

  it('a defeat after a rest at the shrine comes back to R4 (not to R1 or R2): the boss checkpoint', () => {
    const d = r4('west');
    runTo(d, 14);
    d.stop();
    d.step(4);
    d.tap('interact');
    d.step(14);
    wake(d);
    fall(d);
    expect(d.session.room.id).toBe('r4_sanctum');
    expect(d.session.checkpoint).toEqual({ room: 'r4_sanctum', entry: 'rest' });
  });

  it('the fight can be tried again, as often as it takes, and begins the same way', () => {
    const d = r4();
    for (let i = 0; i < 3; i++) {
      wake(d);
      expect(boss(d)!.state).toBe('intro');
      expect(doors(d)).toEqual([true, true]);
      fall(d);
      expect(boss(d)!.state).toBe('dormant');
      expect(doors(d)).toEqual([false, false]);
      d.teleport(4, 0).settle();
    }
  });
});

describe('winning', () => {
  it('the fighter beats it: the Warden falls, its flag is set for good, the fight flag drops, both doors open, the camera lets go', () => {
    const d = r4();
    const log = watch(d, ['boss:defeated', 'actor:died', 'gate:changed']);
    wake(d);
    const r = fightTheWarden(d);
    expect(r.won).toBe(true);
    expect(d.p.health.dead).toBe(false);
    expect(d.session.flags.has(DEFEATED)).toBe(true);
    expect(d.session.flags.has(FIGHT)).toBe(false);
    expect(doors(d)).toEqual([false, false]);
    expect(log.filter((l) => l.startsWith('boss:defeated'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('actor:died')).length).toBe(1);
    expect(log.filter((l) => l.startsWith('gate:changed') && l.includes('"open":true')).length).toBe(2);
    expect(resolveCameraView(R4, d.session.flags, 40, 0).zone, 'the camera is free again').toBeNull();
    d.step(120);
    expect(boss(d), 'the body is gone').toBeUndefined();
  });

  it('the reward appears only now: the Air Dash lies in the chamber, is taken once, and the hero can dash twice in the air', () => {
    const d = r4('west', { flags: [...FLAGS, DEFEATED] });
    d.teleport(84, 0).settle();
    d.step(3);
    expect(d.session.abilities.has('air_dash')).toBe(false);
    expect(d.session.interaction.current?.id).toBe('reward_air_dash');
    d.tap('interact');
    d.step(16);
    expect(d.session.abilities.has('air_dash')).toBe(true);
    expect(d.session.flags.has('taken:air_dash')).toBe(true);
    expect(d.session.interaction.current).toBeNull();
    d.tap('interact');
    d.step(10);
    expect(d.session.abilities.serialize().filter((a) => a === 'air_dash'), 'taken once').toHaveLength(1);
  });

  it('before the Warden falls there is nothing to pick up in the chamber (a hero cannot get there anyway: the doors)', () => {
    const d = r4();
    d.teleport(84, 0).settle();
    d.step(3);
    expect(d.session.interaction.current).toBeNull();
    d.tap('interact');
    d.step(10);
    expect(d.session.abilities.has('air_dash')).toBe(false);
  });

  it('the way out of the world works only after the Warden: the zone does nothing before, and raises the end once it has fallen', () => {
    const before = r4();
    before.teleport(96, 0).settle();
    before.step(5);
    expect(before.session.exitsReached.size).toBe(0);
    const after = r4('west', { flags: [...FLAGS, DEFEATED] });
    after.teleport(96, 0);
    after.step(2);
    expect(after.session.exitsReached.has('east')).toBe(true);
    expect(after.session.transition.active).toBe(false);
  });

  it('a Warden that fell is never built again: not by a reload of the room, nor by coming back from R3, nor by a defeat elsewhere', () => {
    const d = r4('west', { flags: [...FLAGS, DEFEATED] });
    expect(boss(d)).toBeUndefined();
    expect(doors(d)).toEqual([false, false]);
    d.session.loadRoom('r4_sanctum', 'west');
    d.settle();
    expect(boss(d)).toBeUndefined();
    d.step(200);
    runTo(d, 50);
    expect(boss(d)).toBeUndefined();
    expect(d.session.flags.has(FIGHT)).toBe(false);
  });
});

describe('it is winnable, and the same every time', () => {
  it('the scripted fighter beats it on twelve seeds without dying, using what a player has (the sword, a dodge, a bottle)', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const d = r4('west', { seed });
      wake(d);
      const r = fightTheWarden(d, { maxTicks: 9000 });
      expect(r.won, `seed ${seed}`).toBe(true);
      expect(d.p.health.dead, `seed ${seed}`).toBe(false);
      expect(r.ticks, `seed ${seed}: a fight of at least 20 s`).toBeGreaterThan(1200);
      expect(r.ticks, `seed ${seed}: and at most 90 s for a flawless fighter`).toBeLessThan(5400);
    }
  });

  it('the same seed plays the same fight, bit for bit; another seed plays another', () => {
    const play = (seed: number): string => {
      const d = r4('west', { seed });
      wake(d);
      const r = fightTheWarden(d);
      return `${r.ticks} ${r.hurt} ${d.body.x.toFixed(9)} ${d.session.rng.state}`;
    };
    expect(play(5)).toBe(play(5));
    expect(new Set([1, 2, 3, 4].map(play)).size).toBeGreaterThan(1);
  });

  it('the Warden never leaves the arena: through a whole fight it stays between the doors', () => {
    const d = r4();
    wake(d);
    let min = Infinity;
    let max = -Infinity;
    const b = boss(d)!;
    fightTheWarden(d, {
      until: () => {
        min = Math.min(min, b.x);
        max = Math.max(max, b.x);
        return false;
      },
    });
    expect(min).toBeGreaterThan(26.5 + INK_WARDEN.body.halfWidth - 0.05);
    expect(max).toBeLessThan(65.5 - INK_WARDEN.body.halfWidth + 0.05);
  });

  it('the Spirit Bolt hurts it too — from a distance, for 2, on its body — and the crest takes double (a bolt flying at the height of the crest)', () => {
    const d = r4();
    wake(d);
    d.until(() => boss(d)!.state === 'choose' || boss(d)!.state === 'telegraph', 400);
    d.session.loadout.acquire('card_spirit_bolt');
    d.teleport(boss(d)!.x - 9, 0).settle();
    const hp = boss(d)!.health.current;
    const parts: string[] = [];
    d.session.bus.on('combat:hit', (e) => e.targetTeam === 'enemy' && parts.push(`${e.part}:${e.damage}`));
    d.tap('ability');
    d.step(60);
    expect(boss(d)!.health.current).toBe(hp - 2);
    expect(parts).toEqual(['body:2']);
  });
});

describe('what a save keeps', () => {
  it('a game saved in the middle of the fight has no volatile flag; a game begun from it finds the doors open and the Warden dormant and whole', () => {
    const d = r4();
    wake(d);
    expect(d.session.flags.has(FIGHT)).toBe(true);
    const saved = captureProgress(d.session);
    expect(saved.flags.some((f) => f.startsWith('~'))).toBe(false);
    expect(saved.flags).not.toContain(DEFEATED);
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(b.session.room.id).toBe('r4_sanctum');
    expect(boss(b)!.state).toBe('dormant');
    expect(boss(b)!.health.current).toBe(INK_WARDEN.health);
    expect(doors(b)).toEqual([false, false]);
  });

  it('a game saved after the Warden fell and the Air Dash was taken keeps both, and the begun game has no Warden, open doors and the ability', () => {
    const d = r4();
    wake(d);
    fightTheWarden(d);
    d.step(60);
    runTo(d, 84);
    d.stop();
    d.step(6);
    d.tap('interact');
    d.step(16);
    const saved = captureProgress(d.session);
    expect(saved.flags).toEqual(expect.arrayContaining([DEFEATED, 'taken:air_dash']));
    expect(saved.flags.some((f) => f.startsWith('~'))).toBe(false);
    expect(saved.abilities).toContain('air_dash');
    const r = restoreFromProgress(saved, ROOMS, WORLD.start);
    const b = driver({ room: ROOMS[r.startRoom]!, entry: r.startEntry, unlocked: r.unlocked, extra: { rooms: ROOMS, checkpoint: r.checkpoint, flags: r.flags, restore: r.restore, ...QUICK } });
    b.settle();
    expect(boss(b)).toBeUndefined();
    expect(doors(b)).toEqual([false, false]);
    expect(b.session.abilities.has('air_dash')).toBe(true);
    b.teleport(84, 0).settle();
    b.step(3);
    expect(b.session.interaction.current, 'the reward is not lying there again').toBeNull();
  });
});
