import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { R4_SANCTUM_ROOM } from '@/content/rooms/r4Sanctum';

/**
 * THE COMPOSITION OF R4 (tools/art/scenes/r4.ts, docs/PROMPT8-LOG.md phase E): the rules the scene was composed by, held as tests so that an edit that breaks one is noticed — the floor is paved from
 * wall to wall and the paving never lies over a door (a door is drawn by its own art and fades with its gate); the big pieces of the hall (the wall with the eye, the guardians, the portals, the
 * columns) never hide one another, so each is seen whole; and the places the eye must find are left free (nothing dark behind the shrine, nothing in front of the wall the Warden sleeps before).
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
interface Placement { sprite: string; x: number; y: number; scale?: number; w?: number; h?: number; flip?: boolean; alpha?: number; whenSet?: string; whenClear?: string }
interface Scene { layers: Record<string, Placement[] | undefined> }
interface Pack { sprites: Array<{ id: string; artPxPerMeter: number; frameSize?: [number, number] }> }

const read = <T,>(...path: string[]): T => JSON.parse(readFileSync(join(root, ...path), 'utf8')) as T;
const scene = read<Scene>('art', 'ruins-sanctum', 'scenes', 'r4_sanctum.json');
const pack = read<Pack>('art', 'ruins-sanctum', 'ruins-sanctum.pack.json');
/** The width of a placement in metres, as the game draws it. */
const widthOf = (p: Placement): number => {
  const s = pack.sprites.find((x) => x.id === p.sprite)!;
  return (s.frameSize![0] / s.artPxPerMeter) * (p.scale ?? 1);
};
const extent = (p: Placement): [number, number] => [p.x - widthOf(p) / 2, p.x + widthOf(p) / 2];

describe('the composition of R4', () => {
  const terrain = scene.layers['terrain'] ?? [];
  const near = scene.layers['backdropNear'] ?? [];
  const doors = R4_SANCTUM_ROOM.solids.filter((s) => s.material === 'gate');

  it('has the doors of the arena where the composition expects them (the paving stops at them)', () => {
    expect(doors.map((d) => [d.rect.x0, d.rect.x1])).toEqual([[25, 26.5], [65.5, 67]]);
  });

  it('paves the floor from wall to wall: the vestibule, the arena and the reward, with no gap and nothing lying over a door', () => {
    const slabs = terrain.filter((p) => p.sprite.startsWith('paving_')).map(extent).sort((a, b) => a[0] - b[0]);
    for (const [from, to] of [[2, 24.9], [26.5, 65.4], [67.1, 99]] as const) {
      const inside = slabs.filter(([a, b]) => b > from && a < to);
      expect(inside.length, `paving between ${from} and ${to}`).toBeGreaterThan(0);
      let reach: number = from;
      for (const [a, b] of inside) {
        expect(a, `a gap in the paving before ${a.toFixed(2)} (covered up to ${reach.toFixed(2)})`).toBeLessThanOrEqual(reach + 0.01);
        reach = Math.max(reach, b);
      }
      expect(reach, `the paving reaches ${to}`).toBeGreaterThanOrEqual(to - 0.01);
    }
    for (const d of doors) for (const [a, b] of slabs) expect(Math.min(b, d.rect.x1) - Math.max(a, d.rect.x0), 'paving over a door').toBeLessThanOrEqual(0.05);
  });

  it('never lets one of the big pieces of the hall hide another: the wall, the guardians, the portals and the columns stand clear of each other', () => {
    // (the pieces that answer a flag — the eye that burns, the eye that closes — lie over the wall on purpose)
    const big = near.filter((p) => !p.sprite.startsWith('banner_') && p.whenSet === undefined && p.whenClear === undefined);
    expect(big.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        const [a0, a1] = extent(big[i]!);
        const [b0, b1] = extent(big[j]!);
        const overlap = Math.min(a1, b1) - Math.max(a0, b0);
        expect(overlap, `${big[i]!.sprite} @ ${big[i]!.x} and ${big[j]!.sprite} @ ${big[j]!.x} overlap by ${overlap.toFixed(2)} m`).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('puts the pieces that answer the fight on the eye of the wall: the same centre, so each carved ring lights up where it was cut', () => {
    const wall = near.find((p) => p.sprite === 'eye_wall')!;
    const wallPiece = pack.sprites.find((x) => x.id === 'eye_wall')!;
    const wallHeight = wallPiece.frameSize![1] / wallPiece.artPxPerMeter;
    // the eye is cut 5.2 m under the head of the wall (the painter puts it at half the width, and a little lower)
    const eyeY = wall.y + wallHeight - 5.2;
    const answers = near.filter((p) => p.sprite.startsWith('eye_') && p.sprite !== 'eye_wall');
    expect(answers.map((p) => p.sprite).sort()).toEqual(['eye_awake', 'eye_dead']);
    for (const p of answers) {
      expect(p.x, `${p.sprite} stands on the eye`).toBeCloseTo(wall.x, 2);
      const piece = pack.sprites.find((x) => x.id === p.sprite)!;
      // (a soft piece is fitted to the size the scene gives it)
      expect(p.y + (p.h ?? piece.frameSize![1] / piece.artPxPerMeter) / 2, `${p.sprite} is centred on the eye`).toBeCloseTo(eyeY, 1);
      expect(p.whenSet !== undefined || p.whenClear !== undefined, `${p.sprite} answers a flag`).toBe(true);
    }
    // it burns while the fight is on and closes for good once the Warden has fallen: the two flags the room's own data names
    expect(answers.find((p) => p.sprite === 'eye_awake')).toMatchObject({ whenSet: '~fight:r4_boss', whenClear: 'defeated:r4_boss' });
    expect(answers.find((p) => p.sprite === 'eye_dead')).toMatchObject({ whenSet: 'defeated:r4_boss' });
    expect(R4_SANCTUM_ROOM.bosses?.[0]).toMatchObject({ fightFlag: '~fight:r4_boss', defeatFlag: 'defeated:r4_boss' });
  });

  it('keeps the banners off the wall with the eye and off the portals, and hangs them clear of the head of the hero', () => {
    const wall = near.find((p) => p.sprite === 'eye_wall')!;
    const portals = near.filter((p) => p.sprite === 'portal_grand');
    const [w0, w1] = extent(wall);
    for (const b of near.filter((p) => p.sprite.startsWith('banner_'))) {
      const [b0, b1] = extent(b);
      expect(Math.min(b1, w1) - Math.max(b0, w0), `the banner at ${b.x} covers the wall with the eye`).toBeLessThanOrEqual(0);
      for (const p of portals) {
        const [p0, p1] = extent(p);
        expect(Math.min(b1, p1) - Math.max(b0, p0), `the banner at ${b.x} hangs in a portal`).toBeLessThanOrEqual(0);
      }
      expect(b.y, 'a banner hangs above the head of the hero (1.7 m) and a jump').toBeGreaterThanOrEqual(2.4);
    }
  });

  it('leaves the middle of the arena free of the hall in front of the wall: nothing of the hall\'s columns stands where the Warden sleeps', () => {
    // the wall with the eye stands at 44.5 in the layer's own metres (≈ 56 in the world with the camera held in the arena): the columns keep to its sides
    const wall = near.find((p) => p.sprite === 'eye_wall')!;
    const [w0, w1] = extent(wall);
    for (const c of near.filter((p) => p.sprite.startsWith('column_grand_'))) {
      const [c0, c1] = extent(c);
      expect(Math.min(c1, w1) - Math.max(c0, w0), `the column at ${c.x} stands over the wall`).toBeLessThanOrEqual(0);
    }
  });
});
