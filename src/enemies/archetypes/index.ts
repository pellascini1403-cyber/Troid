import type { SimServices } from '@/gameplay/SimServices';
import type { Enemy } from '../Enemy';
import type { EnemyBrain } from '../EnemyBrain';
import { BatBrain } from './bat';
import { CrawlerBrain } from './crawler';
import { SlimeBrain } from './inkSlime';
import { LeechBrain } from './leech';
import { PistonBrain } from './piston';
import { RollerBrain } from './roller';
import { ShadeBrain } from './shade';
import { SporeBrain } from './spore';
import { SpitterBrain } from './spitter';
import { StonebackBrain } from './stoneback';
import { ToadBrain } from './toad';
import { TollerBrain } from './toller';
import { WeaverBrain } from './weaver';
import { WispBrain } from './wisp';

/** Builds the brain an enemy's definition asks for. A new archetype is one more `case` (the compiler checks the union). */
export function createBrain(enemy: Enemy, sim: SimServices): EnemyBrain {
  const ai = enemy.def.ai;
  switch (ai.archetype) {
    case 'slime':
      return new SlimeBrain(enemy, sim, ai.params);
    case 'crawler':
      return new CrawlerBrain(enemy, sim, ai.params);
    case 'toad':
      return new ToadBrain(enemy, sim, ai.params);
    case 'guard':
      return new StonebackBrain(enemy, sim, ai.params);
    case 'spore':
      return new SporeBrain(enemy, sim, ai.params);
    case 'spitter':
      return new SpitterBrain(enemy, sim, ai.params);
    case 'bat':
      return new BatBrain(enemy, sim, ai.params);
    case 'wisp':
      return new WispBrain(enemy, sim, ai.params);
    case 'toller':
      return new TollerBrain(enemy, sim, ai.params);
    case 'roller':
      return new RollerBrain(enemy, sim, ai.params);
    case 'piston':
      return new PistonBrain(enemy, sim, ai.params);
    case 'leech':
      return new LeechBrain(enemy, sim, ai.params);
    case 'weaver':
      return new WeaverBrain(enemy, sim, ai.params);
    case 'shade':
      return new ShadeBrain(enemy, sim, ai.params);
  }
}
