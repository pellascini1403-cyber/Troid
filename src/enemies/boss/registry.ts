import type { Rect } from '@/core/math';
import type { SimEntity } from '@/gameplay/SimEntity';
import type { BossDefinition } from './BossDefinition';

/** Where a guardian is placed: its feet, and the way it faces. */
export interface BossPlace {
  x: number;
  y: number;
  facing?: 1 | -1;
}

type Make = (id: string, def: BossDefinition, at: BossPlace, arena: Rect) => SimEntity;
let make: Make | null = null;

/**
 * THE BOSS ENGINE, by name (docs/PROMPT21-LOG.md): the session builds a data-driven guardian through this, so that the engine (`Boss`, its patterns) is code that the first frame of the game does not carry — the Ink Warden is its own class and
 * the first four rooms are fought with it and the slime; the six guardians after it come with the engine, in `content/beyond`. Importing `enemies/boss/engine.ts` registers it.
 */
export function registerBossEngine(maker: Make): void {
  make = maker;
}

export function createEngineBoss(id: string, def: BossDefinition, at: BossPlace, arena: Rect): SimEntity {
  if (!make) throw new Error(`guardian "${def.id}" is a data-driven boss, and the boss engine has not been loaded (it comes with \`content/beyond\`)`);
  return make(id, def, at, arena);
}
