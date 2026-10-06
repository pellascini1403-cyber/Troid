import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import type { EnemyBrain } from '../EnemyBrain';
import { SlimeBrain } from './inkSlime';

/** Builds the brain an enemy's definition asks for. A new archetype is one more `case` (the compiler checks the union). */
export function createBrain(enemy: Enemy, sim: SimServices): EnemyBrain {
  const ai = enemy.def.ai;
  switch (ai.archetype) {
    case 'slime':
      return new SlimeBrain(enemy, sim, ai.params);
  }
}
