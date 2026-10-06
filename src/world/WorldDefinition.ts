import type { Destination } from './RoomDefinition';

/**
 * A WORLD, as data (docs/PROMPT6-LOG.md S22): which rooms exist and where a new game begins. The connections are NOT here: each
 * room declares its own exits, and every exit names the room and the entry it leads to (`ExitDef.to`). So the graph is
 * `world → rooms → exits → destination → spawn point`, and nothing in the game loop knows what comes after what.
 *
 * The definitions of the rooms live in a registry (`content/`): a world only lists their ids, so the same room can be
 * walked in a test without a world and the validators can check the world against whatever registry they are given.
 */
export interface WorldDefinition {
  id: string;
  /** Where a new game begins, and the first checkpoint: a room and one of its entries. */
  start: Destination;
  /** The rooms that belong to the world. */
  rooms: readonly string[];
}

export type { Destination };
