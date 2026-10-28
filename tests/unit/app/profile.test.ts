import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, buildProfile } from '@/app/profile';
import { ABILITIES, ROOMS, WORLD } from '@/content';
import { driver } from '../../helpers/sim';

/**
 * THE PROFILE (docs/PROMPT14-LOG.md): what the game really knows about the hero — every number is something the simulation holds or the game counted, and nothing is invented: not an exploration
 * percentage that cannot be computed, not a stat nobody recorded.
 */
const stats = { ticks: 7260, deaths: 2, kills: 9, rooms: ['r1_gate', 'r2_hall', 'movement_test'] };
const session = (flags: string[] = [], unlocked: string[] = ['dash']) => driver({ room: ROOMS.r2_hall!, entry: 'west', unlocked, extra: { rooms: ROOMS, flags } }).settle().session;

describe('the profile', () => {
  it('carries the counts as they are, the zone the hero is in (by its text key) and the slot being played', () => {
    const p = buildProfile(session(), stats, 2);
    expect(p).toMatchObject({ slot: 2, ticks: 7260, deaths: 2, kills: 9, zoneKey: 'room.r2.name' });
  });

  it('a playground that saves nothing has no slot', () => {
    expect(buildProfile(session(), stats, null).slot).toBeNull();
  });

  it('exploration is rooms of the WORLD visited out of the rooms the world has — a test room is not part of the world — and nothing else (no percentage that cannot be computed)', () => {
    const p = buildProfile(session(), stats, 1);
    expect(p.rooms).toEqual({ visited: 2, total: WORLD.rooms.length });
    expect(Object.keys(p).sort()).not.toContain('percent');
  });

  it('abilities are those the hero HAS that have behaviour, in the content\'s order, by text key; one that is only declared (the grapple) is not shown', () => {
    expect(buildProfile(session(), stats, 1).abilities).toEqual(['ability.dash']);
    expect(buildProfile(session([], ['dash', 'magic_attack', 'air_dash', 'grapple']), stats, 1).abilities).toEqual(['ability.dash', 'ability.magicAttack', 'ability.airDash']);
    expect(buildProfile(session([], ['dash', 'double_jump', 'wall_jump', 'ground_slam']), stats, 1).abilities).toEqual(['ability.dash', 'ability.doubleJump', 'ability.wallJump', 'ability.groundSlam']);
  });

  it('every ability that has behaviour has a text key (teaching the hero a new one cannot leave the profile without its name)', () => {
    for (const a of ABILITIES.filter((x) => x.implemented)) expect(ABILITY_KEYS[a.id], a.id).toBeTruthy();
  });

  it('cards, bottles and the life the hero has', () => {
    const s = session(['taken:card_spirit_bolt']);
    s.loadout.acquire('card_spirit_bolt');
    const p = buildProfile(s, stats, 1);
    expect(p.cards).toEqual(['card.spiritBolt.name']);
    expect(p.bottles).toEqual({ slots: 3, max: 4 });
    expect(p.lifeMax).toBe(s.player.health.max);
    s.bottles.addSlot('energy_bottle');
    expect(buildProfile(s, stats, 1).bottles.slots).toBe(4);
  });

  it('bosses beaten are those whose defeat flag is set; the world\'s bosses are counted from the rooms, not from a number written here', () => {
    const none = buildProfile(session(), stats, 1);
    expect(none.bosses).toEqual({ beaten: [], total: 7 });
    const down = buildProfile(session(['defeated:r4_boss']), stats, 1);
    expect(down.bosses).toEqual({ beaten: ['enemy.warden.name'], total: 7 });
    // all seven, in the order of the world: the Warden, then the guardian of each zone after it
    const all = buildProfile(session(['defeated:r4_boss', 'defeated:rt_boss', 'defeated:mr_boss', 'defeated:mn_boss', 'defeated:sp_boss', 'defeated:fd_boss', 'defeated:ih_boss']), stats, 1);
    expect(all.bosses.total).toBe(7);
    expect(all.bosses.beaten).toHaveLength(7);
    expect(new Set(all.bosses.beaten).size, 'seven different guardians').toBe(7);
    expect(all.bosses.beaten[0]).toBe('enemy.warden.name');
  });

  it('where the time went: the zones the hero has been in, in the order of the world, with the ticks and the falls of each — and nothing for a zone with no time', () => {
    const counted = { ...stats, zones: { sunken_roots: 5400, ancient_forest_ruins: 1800 }, falls: { sunken_roots: 2, ink_heart: 1 } };
    const p = buildProfile(session(), counted, 1);
    expect(p.zones).toEqual([
      { region: 'ancient_forest_ruins', ticks: 1800, falls: 0 },
      { region: 'sunken_roots', ticks: 5400, falls: 2 },
      { region: 'ink_heart', ticks: 0, falls: 1 },
    ]);
    expect(buildProfile(session(), stats, 1).zones, 'a game that was not counted by zone has none').toEqual([]);
  });

  it('how long it took to get to each guardian: the ones that have fallen, in the order they fell, by their text key', () => {
    const counted = { ...stats, guardians: { boss_root_tyrant: 9000, ink_warden: 4000, not_a_boss: 1 } };
    const p = buildProfile(session(), counted, 1);
    expect(p.guardianTimes.map((g) => g.ticks)).toEqual([4000, 9000]);
    expect(p.guardianTimes.map((g) => g.nameKey)).toEqual(['enemy.warden.name', 'enemy.rootTyrant.name']);
  });
});

