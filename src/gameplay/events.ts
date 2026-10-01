/**
 * Catalogue of simulation events. The simulation EMITS these; HUD, VFX, audio, camera and analytics LISTEN.
 * Nothing in the simulation ever calls into a view: this file is the whole contract.
 *
 * Convention: `<subject>:<pastTenseVerb>`. Payloads are plain data; never put a mesh or DOM node in one.
 */
export interface GameEvents {
  'player:jumped': { x: number; y: number; air: boolean };
  'player:landed': { x: number; y: number; impact: number };
  'player:dashed': { x: number; y: number; facing: 1 | -1; air: boolean };
  'player:dashEnded': { x: number; y: number };
  'ability:unlocked': { id: string };
  'ability:locked': { id: string };
}
