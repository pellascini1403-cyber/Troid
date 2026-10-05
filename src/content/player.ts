import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';

export const PLAYER: PlayerDefinition = {
  id: 'player',
  modelId: 'mannequin',
  spriteSetId: 'player_placeholder',
  body: { halfWidth: 0.35, height: 1.7 },
  movement: DEFAULT_MOVEMENT,
};
