import type { CombatEvents } from '@/combat/CombatSystem';
import type { SimEntity } from './SimEntity';

/**
 * Catalogue of simulation events. The simulation EMITS these; HUD, VFX, audio, camera and analytics LISTEN.
 * Nothing in the simulation ever calls into a view: this file is the whole contract.
 *
 * Convention: `<subject>:<pastTenseVerb>`. Payloads are plain data (the entity lifecycle events carry the entity
 * itself so views can bind to its `view` state; never put a mesh or DOM node in a payload).
 */
export interface GameEvents extends CombatEvents {
  'player:jumped': { x: number; y: number; air: boolean };
  'player:landed': { x: number; y: number; impact: number };
  'player:dashed': { x: number; y: number; facing: 1 | -1; air: boolean };
  'player:dashEnded': { x: number; y: number };
  'player:attacked': { attackId: string; x: number; y: number; facing: 1 | -1; air: boolean; combo: number };
  'player:hurt': { x: number; y: number; damage: number; direction: 1 | -1 };
  'player:died': { x: number; y: number };
  'ability:unlocked': { id: string };
  'ability:locked': { id: string };
  'entity:spawned': { entity: SimEntity };
  'entity:despawned': { entity: SimEntity };
}
