import { ABILITIES, BOSSES, ROOMS, WORLD } from '@/content';
import { CARDS } from '@/content/resources';
import type { GameSession } from '@/gameplay/GameSession';
import { isCompleted } from '@/progression/adventure';
import type { PlayStatsData } from '@/save/ProgressData';

/**
 * The text key of what an ability is called on the profile: literal strings, so the catalogs can be held to them (a key that nothing names is an orphan). An ability that has behaviour and
 * no entry here fails a test, so teaching the hero a new one cannot leave the profile without its name.
 */
export const ABILITY_KEYS: Readonly<Record<string, string>> = {
  dash: 'ability.dash',
  magic_attack: 'ability.magicAttack',
  air_dash: 'ability.airDash',
  double_jump: 'ability.doubleJump',
  wall_jump: 'ability.wallJump',
  ground_slam: 'ability.groundSlam',
  relic_edge: 'ability.relicEdge',
  relic_swift: 'ability.relicSwift',
  relic_siphon: 'ability.relicSiphon',
  relic_ward: 'ability.relicWard',
  relic_pierce: 'ability.relicPierce',
  relic_brew: 'ability.relicBrew',
};

/** What the profile shows, as plain data: every number is something the game counted or the simulation holds (docs/PROMPT14-LOG.md). */
export interface ProfileData {
  /** The saved game being played (`null`: a playground, which saves nothing). */
  slot: number | null;
  /** Simulation ticks lived (60 to the second). */
  ticks: number;
  deaths: number;
  kills: number;
  /** Text key of the zone the hero is in. */
  zoneKey: string | null;
  /** Rooms of the world the hero has been in, out of the rooms the world has: the one share of exploration that can be COMPUTED. */
  rooms: { visited: number; total: number };
  /** Text keys of the abilities the hero has (only those that have behaviour), in the order the content lists them. */
  abilities: string[];
  /** Text keys of the cards the hero owns. */
  cards: string[];
  bottles: { slots: number; max: number };
  /** Text keys of the bosses the hero has beaten, and how many the world has. */
  bosses: { beaten: string[]; total: number };
  lifeMax: number;
  /** The game has been taken to the end of the adventure (the world remembers it: `completed:adventure`). */
  completed: boolean;
}

/** The profile of the game being played, from the session and what was counted. Pure: the same session and counts always give the same profile. */
export function buildProfile(session: GameSession, stats: PlayStatsData, slot: number | null): ProfileData {
  const world = new Set(WORLD.rooms);
  const bosses = WORLD.rooms.flatMap((id) => ROOMS[id]?.bosses ?? []);
  return {
    slot,
    ticks: stats.ticks,
    deaths: stats.deaths,
    kills: stats.kills,
    zoneKey: session.room.nameKey ?? null,
    rooms: { visited: stats.rooms.filter((r) => world.has(r)).length, total: WORLD.rooms.length },
    abilities: ABILITIES.filter((a) => a.implemented && session.abilities.has(a.id)).flatMap((a) => (ABILITY_KEYS[a.id] ? [ABILITY_KEYS[a.id] as string] : [])),
    cards: session.loadout.owned.flatMap((id) => (CARDS[id] ? [CARDS[id].nameKey] : [])),
    bottles: { slots: session.bottles.slots.length, max: session.bottles.maxSlots },
    bosses: { beaten: bosses.filter((b) => session.flags.has(b.defeatFlag)).flatMap((b) => (BOSSES[b.guardian] ? [BOSSES[b.guardian]!.nameKey] : [])), total: bosses.length },
    lifeMax: session.player.health.max,
    completed: isCompleted((f) => session.flags.has(f)),
  };
}
