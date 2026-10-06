/**
 * Things the player can interact with (docs/GAME-SPEC-2D.md §12, docs/ARCHITECTURE-2D.md §5.7), as DATA. A room lists its
 * interactables; the `InteractionSystem` chooses the one in reach and performs its actions; the simulation never knows what
 * a prompt looks like and the interface never knows what a lever does.
 *
 * Text never lives here: `verbKey` is a key of the catalogs ("Recoger" / "Pick up"), the interface translates it.
 */

/** What kind of thing it is: the interface picks the icon from it, and the world its marker. */
export type InteractionKind = 'open' | 'talk' | 'pickup' | 'activate' | 'enter' | 'use' | 'rest';

/**
 * One effect of performing an interactable. A small CLOSED set the session knows how to apply (the host in
 * `InteractionSystem`); a new thing a reward can do is one more entry here and one more `case` there. Rewards write world FLAGS
 * (§14.3), which is what makes them survive a death, a reload of the room and, later, a save.
 */
export type InteractAction =
  /** The player gets a card (the first one is equipped at once). */
  | { type: 'acquireCard'; cardId: string }
  /** The player gets one more bottle slot (the fourth is a reward). */
  | { type: 'addBottleSlot'; bottleId: string }
  | { type: 'setFlag'; flag: string }
  | { type: 'clearFlag'; flag: string }
  /** Rest here: this room's entry `entry` becomes where the hero comes back after a defeat; life, magic and bottles are restored and the game is saved. */
  | { type: 'checkpoint'; entry: string };

/** How far from the object the player may be, in metres: horizontal and vertical distance of the feet (§12: 1.6 m / 1.2 m). */
export interface InteractReach {
  x: number;
  y: number;
}

export interface InteractableDef {
  /** Unique within the room. */
  id: string;
  kind: InteractionKind;
  /** Text key of the verb the icon names. */
  verbKey: string;
  /** Where the object stands (its feet), in metres. */
  x: number;
  y: number;
  /** How high above `(x, y)` the TOP of the object is, where its icon is anchored (default 1.2 m): the icon floats just above that point. */
  iconHeight?: number;
  reach?: InteractReach;
  /** Tie-breaker between two at the same distance: the higher one wins. */
  priority?: number;
  /** Available only while this world flag is set / only while it is NOT set (a pickup that was taken writes the flag its `whenClear` reads). */
  whenSet?: string;
  whenClear?: string;
  /** Ticks the hero is held in the `interact` pose, 0 … {@link MAX_INTERACT_LOCK} (default {@link MAX_INTERACT_LOCK}). */
  lock?: number;
  /** What happens, in order. */
  actions: readonly InteractAction[];
}

export const DEFAULT_REACH: Readonly<InteractReach> = { x: 1.6, y: 1.2 };
export const DEFAULT_ICON_HEIGHT = 1.2;
/** Interacting holds the control for at most this many ticks (§12). */
export const MAX_INTERACT_LOCK = 12;
/** Once chosen, an object keeps the icon until the player is this much further than its reach, so it does not flicker at the edge (§12). */
export const REACH_HYSTERESIS = 0.3;
