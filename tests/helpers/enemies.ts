import { ENEMIES, INK_SLIME } from '@/content/enemies';
import { Enemy, type EnemySpawn } from '@/enemies/Enemy';
import type { EnemyDefinition } from '@/enemies/EnemyDefinition';
import { block, ground, oneWay, rect } from '@/world/builders';
import type { RoomDefinition } from '@/world/RoomDefinition';
import type { Driver } from './sim';

/**
 * A flat arena for enemy behaviour, with the three things AI has to handle:
 *
 *   x:   -1 ────────────── 40 ░░░░░░ 46 ────── 80      ground, a 6 m pit, ground
 *                   ┃pillar 56..57 (6 m tall)           a wall between two bodies
 *                   ═══ one-way at y = 3, x 20..26      a platform above the floor
 */
export const ARENA: RoomDefinition = {
  id: 'slime_arena',
  regionId: 'test',
  name: 'Slime arena',
  bounds: rect(-2, -14, 82, 30),
  killY: -22,
  entries: [{ id: 'start', x: 4, y: 0, facing: 1 }],
  solids: [
    block('wall_left', -3, -14, -1, 30, 'stone'),
    block('wall_right', 80, -14, 82, 30, 'stone'),
    ground('g_left', -1, 40),
    ground('g_right', 46, 80),
    block('pillar', 56, 0, 57, 6, 'stone'),
    oneWay('plat', 20, 26, 3),
  ],
};

export const SLIME_ID = INK_SLIME.id;

/** Spawns an enemy and lets the session flush it into the world (entities join at the end of a tick). */
export function spawnEnemy(d: Driver, def: EnemyDefinition, spawn: EnemySpawn): Enemy {
  const enemy = d.session.spawn(new Enemy(d.session.ids.next(def.id), def, spawn));
  d.step(1);
  return enemy;
}

export function spawnSlime(d: Driver, x: number, y = 0, facing: 1 | -1 = -1): Enemy {
  return spawnEnemy(d, ENEMIES[SLIME_ID] as EnemyDefinition, { x, y, facing });
}

/** Steps until the enemy enters `state`; returns the ticks used (throws when it never does). */
export function untilState(d: Driver, e: Enemy, state: string, max = 600): number {
  return d.until(() => e.state === state, max);
}

/** A copy of the Ink Slime definition with some numbers replaced (tuning variants for tests). */
export function slimeWith(patch: Partial<EnemyDefinition>): EnemyDefinition {
  return { ...INK_SLIME, ...patch };
}
