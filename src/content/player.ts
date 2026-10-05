import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';

export const PLAYER: PlayerDefinition = {
  id: 'player',
  spriteSetId: 'player_placeholder',
  body: { halfWidth: 0.35, height: 1.7, hurtbox: { halfWidth: 0.3, height: 1.55 } },
  movement: DEFAULT_MOVEMENT,
};
