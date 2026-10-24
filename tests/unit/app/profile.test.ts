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
    expect(none.bosses).toEqual({ beaten: [], total: 1 });
    const down = buildProfile(session(['defeated:r4_boss']), stats, 1);
    expect(down.bosses).toEqual({ beaten: ['enemy.warden.name'], total: 1 });
  });
});
