import type { BottleState } from '@/abilities/BottleSet';

/** The equipped card as the interface needs it. `equipped` false = the slot is empty and the Ability button is not drawn. */
export interface CardStatus {
  equipped: boolean;
  id: string;
  nameKey: string;
  iconId: string;
  /** What the HUD card looks like: ready, dimmed for lack of magic, or sweeping its cooldown. */
  state: 'ready' | 'noMagic' | 'cooldown';
  /** 1 = just cast … 0 = ready again (the radial sweep). */
  cooldown01: number;
}

/** The object that has the interaction icon right now (or none): its icon floats at `(x, y)`, world metres. */
export interface InteractionStatus {
  active: boolean;
  id: string;
  kind: string;
  /** Text key of the verb, for the icon's accessible name. */
  verbKey: string;
  x: number;
  y: number;
}

export interface BottleStatus {
  state: BottleState;
  /** 0 … 1: 1 when ready, the recharge progress while recharging. */
  fill01: number;
  iconId: string;
}

/**
 * Everything the HUD reads about the player, as plain numbers: the READ side of the simulation → presentation contract
 * (docs/ARCHITECTURE-2D.md §4, §8). The simulation fills it (`GameSession.status`); the HUD never touches the player, the
 * resources or any entity. The object is reused every frame (no allocation in steady state).
 */
export interface PlayerStatus {
  life: { current: number; max: number };
  magic: { current: number; max: number; regenerating: boolean };
  card: CardStatus;
  bottles: BottleStatus[];
  /** The bottle being drunk right now (`slot` −1 = none) and how far through its channel the hero is, 0 … 1: that vial drains meanwhile. */
  drink: { slot: number; progress01: number };
  interaction: InteractionStatus;
  /** A bottle is ready AND drinking it would help now (life below the maximum): the contextual chip of the touch controls shows. */
  bottleUseful: boolean;
}

export function createPlayerStatus(): PlayerStatus {
  return {
    life: { current: 0, max: 0 },
    magic: { current: 0, max: 0, regenerating: false },
    card: { equipped: false, id: '', nameKey: '', iconId: '', state: 'ready', cooldown01: 0 },
    bottles: [],
    drink: { slot: -1, progress01: 0 },
    interaction: { active: false, id: '', kind: '', verbKey: '', x: 0, y: 0 },
    bottleUseful: false,
  };
}
