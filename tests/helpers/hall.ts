import { mapRoom } from '@/world/roomMap';

const W = 90;
const H = 24;

/**
 * A long hall to meet a creature in: a floor (top at y = 2), walls at both ends, a roof at 22 m, a ledge at 4 m in the middle (x 40…46) for the creatures that hang or float, and the hero's entry at x = 5.
 * (The same hall as `tests/integration/creatures.test.ts`, which proves each creature does what makes it itself; the brawlers of `brawler.ts` prove each one can be beaten.)
 */
export function hall(): ReturnType<typeof mapRoom> {
  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
  const fill = (x0: number, x1: number, y0: number, y1: number, ch: string): void => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[H - 1 - y]![x] = ch;
  };
  fill(0, W, 0, 1, '#');
  fill(0, W, 1, 2, 'G');
  fill(0, 1, 0, H, '#');
  fill(W - 1, W, 0, H, '#');
  fill(0, W, H - 1, H, '#');
  fill(40, 46, 4, 5, 'G');
  grid[H - 1 - 2]![5] = 'a';
  return mapRoom({ id: 'hall', regionId: 'lab', name: 'Hall', nameKey: 'room.lab.name', art: { backdrop: 'ruins', seed: 1 }, rows: grid.map((r) => r.join('')) }, (m) => ({ entries: [m.entry('start', 'a', 1)] }));
}

export const HALL = { width: W, height: H, floor: 2 } as const;
