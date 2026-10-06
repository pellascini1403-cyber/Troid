import type { BottleChange } from '@/abilities/BottleSet';
import type { CardChange } from '@/abilities/CardLoadout';
import type { MagicChange } from '@/abilities/Magic';
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
  /** The first ACTIVE tick of an attack: the hitbox exists from now on (`rect` is where, in world space). */
  'player:attackActive': { attackId: string; x: number; y: number; facing: 1 | -1; air: boolean; combo: number; rect: { x0: number; y0: number; x1: number; y1: number } };
  'player:hurt': { x: number; y: number; damage: number; direction: 1 | -1 };
  'player:died': { x: number; y: number };
  /** The player's health reached 0: the defeat flow starts (docs/GAME-SPEC-2D.md §9.2). */
  'death:started': { x: number; y: number };
  /** The fade to black begins and lasts `ticks` simulation ticks. */
  'death:fadeOut': { ticks: number };
  /** The player is back (room reloaded at the respawn point, health full); `entryId` is where. */
  'death:respawned': { roomId: string; entryId: string };
  /** The fade back in begins and lasts `ticks` simulation ticks. */
  'death:fadeIn': { ticks: number };
  /** A room was (re)built: views rebuild their scenery and cut the camera. */
  'room:loaded': { roomId: string; entryId: string };
  /** An enemy noticed the player (audio cue, camera nudge…). */
  'enemy:alerted': { id: string; defId: string; x: number; y: number };
  /** An enemy begins the wind-up of an attack: `ticks` ticks until the blow (the VFX layer draws the warning). */
  'enemy:telegraph': { id: string; defId: string; x: number; y: number; facing: 1 | -1; ticks: number };
  /** A world flag was set / cleared (progression memory: defeated guardians, opened doors). */
  'flag:set': { flag: string };
  'flag:cleared': { flag: string };
  /** A gate of the room opened or closed (views fade the door; `open` is its new state). */
  'gate:changed': { roomId: string; gateId: string; open: boolean };
  /** The player touched a way out of the room. Once per exit per room build. */
  'exit:reached': { roomId: string; exitId: string; to?: { room: string; entry: string } };
  /** A skill was cast: the cost was paid and its effect released at `(x, y)`. */
  'skill:cast': { skillId: string; x: number; y: number; facing: 1 | -1; cost: number };
  /** A cast was refused. `noMagic` is the one the interface answers (the bar and the card shake, a "denied" sound). */
  'skill:denied': { skillId: string; reason: 'noMagic' };
  /** A projectile ended: on what it hit, on a wall, or at the end of its range. */
  'projectile:ended': { id: string; skillId: string; x: number; y: number; facing: 1 | -1; reason: 'hit' | 'wall' | 'range' };
  /** The magic bar changed: spent (exactly), regained (about once per unit), refilled. */
  'magic:changed': MagicChange;
  /** A bottle was drunk, started or finished recharging, was added or refilled. `state` lists every slot afterwards. */
  'bottle:changed': BottleChange & { states: string[] };
  /** The hero began drinking: `ticks` ticks of channel, standing still. The effect lands on the last one. */
  'bottle:drinkStarted': { slot: number; x: number; y: number; ticks: number };
  /** The channel ended: the bottle is spent and its effect landed (`healed` = points of life actually restored). */
  'bottle:drunk': { slot: number; healed: number; x: number; y: number };
  /** The channel was broken before its end (a hit, losing the ground, nothing left to heal): nothing was spent. */
  'bottle:interrupted': { slot: number; reason: 'hit' | 'air' | 'full' };
  /** A request to drink was refused: no bottle is ready (`none`) or the life is already full (`full`). The interface answers (the bottles shake). */
  'bottle:denied': { reason: 'none' | 'full' };
  /** A card was acquired, equipped or taken off. */
  'card:changed': CardChange;
  'ability:unlocked': { id: string };
  'ability:locked': { id: string };
  'entity:spawned': { entity: SimEntity };
  'entity:despawned': { entity: SimEntity };
}
