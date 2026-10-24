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
    slamDive: 'slam_dive',
    slamWave: 'slam',
    relics: { edgeBonus: 1, siphon: 8, wardScale: 1.6, swiftScale: 0.6, brewBonus: 1, pierce: 2 },
    attackBuffer: 0.12,
    hurt: { stun: 14, invulnerability: 60, knockbackScale: 1, deathHitStop: 8 },
  },
};
