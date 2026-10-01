import * as THREE from 'three';
import { ActorVisual, type ActorVisualOptions } from '@/assets/ActorVisual';
import type { CharacterModel } from '@/assets/CharacterModel';

/**
 * Player-specific presentation. Today it only adds convenience accessors on top of ActorVisual; this is the
 * home for player-only visual behaviour (cape physics, weapon swaps, ability glow…), kept apart from
 * PlayerController (logic), PlayerDefinition (data) and the model itself.
 */
export class PlayerVisual extends ActorVisual {
  constructor(model: CharacterModel, options: ActorVisualOptions = {}) {
    super(model, { facingYawDeg: 78, ...options });
  }

  /** World position of the weapon hand: where attack trails and projectiles are spawned visually. */
  weaponWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.model.getSocketWorld('weapon_r', out);
  }

  muzzleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.model.getSocketWorld('projectile_origin', out);
  }
}
