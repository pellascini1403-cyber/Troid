import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import type { EnemyBrain } from '../EnemyBrain';
import type { EnemyAi } from '../EnemyDefinition';
import { SlimeBrain } from './inkSlime';

/** Every way of behaving there is (`EnemyAi['archetype']`). */
export type Archetype = EnemyAi['archetype'];
type AiOf<A extends Archetype> = Extract<EnemyAi, { archetype: A }>;
type Make = (enemy: Enemy, sim: SimServices) => EnemyBrain;

/**
 * THE BRAINS (docs/PROMPT21-LOG.md): which brain each archetype gets. The Ink Slime's is here, because the first rooms of the world are fought with nothing else; the thirteen that come after it are TAUGHT by
 * `enemies/archetypes/all.ts`, which travels with the creatures that need them — the first frame of the game does not carry the code of creatures that live sixty rooms away (the budget of the cold start, `npm run bench:bundle`).
 * A new archetype is a member of `EnemyAi`, a brain, and one `registerBrain`; `tests/unit/enemies/brains.test.ts` holds every member of the union to a brain.
 */
const BRAINS = new Map<Archetype, Make>();

export function registerBrain<A extends Archetype>(archetype: A, make: (enemy: Enemy, sim: SimServices, params: AiOf<A>['params']) => EnemyBrain): void {
  // (the definition says which archetype it is, and so which params: the compiler cannot follow that through a table, the registration above it does)
  const loose = make as (enemy: Enemy, sim: SimServices, params: unknown) => EnemyBrain;
  BRAINS.set(archetype, (enemy, sim) => loose(enemy, sim, enemy.def.ai.params));
}

/** Is there a brain for it? */
export function hasBrain(archetype: Archetype): boolean {
  return BRAINS.has(archetype);
}

registerBrain('slime', (enemy, sim, params) => new SlimeBrain(enemy, sim, params));

/** Builds the brain an enemy's definition asks for. */
export function createBrain(enemy: Enemy, sim: SimServices): EnemyBrain {
  const make = BRAINS.get(enemy.def.ai.archetype);
  if (!make) throw new Error(`enemy "${enemy.def.id}" asks for the "${enemy.def.ai.archetype}" brain, which has not been taught (the creatures after the Ink Slime come with \`content/beyond\`)`);
  return make(enemy, sim);
}
