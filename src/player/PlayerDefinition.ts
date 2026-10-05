import type { MovementTuning } from './MovementTuning';

/**
 * Static description of the player character. Grows with each phase: F3 = identity + model + body,
 * F5 adds `movement`, F6 adds `combat`. Everything tunable lives here, in one place.
 */
export interface PlayerDefinition {
  id: string;
  /** Id of a ModelDefinition (3D prototype, removed in S4). */
  modelId: string;
  /** Id of a SpriteSetDefinition (resolved through the content registry). Swap to change the character's art. */
  spriteSetId: string;
  /** Collision body. Position of the player is the centre of the feet. */
  body: {
    halfWidth: number;
    height: number;
  };
  movement: MovementTuning;
}
