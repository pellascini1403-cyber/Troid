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
  /** The magic bar changed: spent (exactly), regained (about once per unit), refilled. */
  'magic:changed': MagicChange;
  /** A bottle was drunk, started or finished recharging, was added or refilled. `state` lists every slot afterwards. */
  'bottle:changed': BottleChange & { states: string[] };
  /** A card was acquired, equipped or taken off. */
  'card:changed': CardChange;
  'ability:unlocked': { id: string };
  'ability:locked': { id: string };
  'entity:spawned': { entity: SimEntity };
  'entity:despawned': { entity: SimEntity };
}
