import type { PlayerDefinition } from '@/player/PlayerDefinition';
import { DEFAULT_MOVEMENT } from '@/player/MovementTuning';
import { PLAYER_ATTACKS } from './attacks';

export const PLAYER: PlayerDefinition = {
  id: 'player',
  spriteSetId: 'player_placeholder',
  body: { halfWidth: 0.35, height: 1.7, hurtbox: { halfWidth: 0.3, height: 1.55 } },
  movement: DEFAULT_MOVEMENT,
  combat: {
    maxHealth: 5,
    attacks: PLAYER_ATTACKS,
    groundAttack: 'slash_1',
    airAttack: 'air_slash',
    crouchAttack: 'crouch_slash',
    attackBuffer: 0.12,
    hurt: { stun: 14, invulnerability: 60, knockbackScale: 1, deathHitStop: 8 },
  },
};
