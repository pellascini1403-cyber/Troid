import type { ModelDefinition } from '@/models/ModelDefinition';

/**
 * Model definitions: the only place that knows file paths, clip names and node names.
 * To use final art, add/replace an entry here and keep the logical keys (`clips`, `sockets`) — gameplay is unchanged.
 */

export const MANNEQUIN: ModelDefinition = {
  id: 'mannequin',
  url: 'assets/models/mannequin.glb',
  scale: 1,
  yawOffsetDeg: 0,
  height: 1.83,
  clips: {
    idle: 'Idle',
    walk: 'Walk',
    run: 'Run',
    jump: 'Jump',
    fall: 'Fall',
    land: 'Land',
    attack: 'Attack',
    attack2: 'Attack2',
    attackAir: 'AttackAir',
    dash: 'Dash',
    hurt: 'Hurt',
    death: 'Death',
  },
  sockets: {
    weapon_r: 'SOCKET_weapon_R',
    weapon_l: 'SOCKET_weapon_L',
    vfx_hand_r: 'SOCKET_vfx_hand_R',
    vfx_hand_l: 'SOCKET_vfx_hand_L',
  },
  look: {
    style: 'toon',
    baseColor: 0xffffff,
    outline: { thickness: 0.035, color: 0x16120f },
    rim: { color: 0xfff4e4, strength: 0.7, power: 2.4 },
  },
};

export const MODELS: Readonly<Record<string, ModelDefinition>> = {
  [MANNEQUIN.id]: MANNEQUIN,
};
