import { mapRoom } from '@/world/roomMap';
import type { RoomDefinition } from '@/world/RoomDefinition';

/**
 * A room drawn for the movement abilities (docs/PROMPT21-LOG.md): a floor, a 5 m ledge (the Double Jump's), a 5 m wide shaft 14 m deep (the Wall Jump's) and an open stretch (the slam's). Both
 * `movementAbilities.test.ts` (what each ability does) and `reach.test.ts` (what the solver finds with each) play in it.
 */
export const LAB_W = 44;
export const LAB_H = 26;

export function lab(): RoomDefinition {
  const grid = Array.from({ length: LAB_H }, () => Array.from({ length: LAB_W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[LAB_H - 1 - y]![x] = ch;
  };
  fill(0, LAB_W, 0, 1, '#'); // bedrock
  fill(0, LAB_W, 1, 2, 'G'); // the floor, top at y = 2
  fill(0, 1, 0, LAB_H, '#'); // walls of the room
  fill(LAB_W - 1, LAB_W, 0, LAB_H, '#');
  fill(0, LAB_W, LAB_H - 1, LAB_H, '#'); // roof
  fill(7, 11, 2, 7, '#'); // the ledge: 5 m above the floor (a jump is 3.1)
  fill(19, 20, 2, LAB_H - 1, '#'); // the shaft: left wall (the whole way up)…
  fill(25, LAB_W - 1, 2, 16, '#'); // …and a block to its right, 14 m above the floor, that is the top of it
  const mark = (x: number, y: number, ch: string): void => {
    grid[LAB_H - 1 - y]![x] = ch;
  };
  mark(3, 2, 'a'); // the hero starts here
  mark(21, 2, 'w'); // the bottom of the shaft
  mark(26, 16, 't'); // the top of the block
  mark(34, 2, 's'); // an Ink Slime
  mark(14, 2, 'x'); // the slam's start
  return mapRoom(
    { id: 'move_lab', regionId: 'lab', name: 'Movement lab', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: grid.map((r) => r.join('')) },
    (m) => ({ entries: [m.entry('start', 'a', 1), m.entry('shaft', 'w', 1), m.entry('slam', 'x', 1), m.entry('top', 't', 1)] }),
  );
}
