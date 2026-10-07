import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Rng } from '@/core/rng';
import { encodePng, type RgbaImage } from '../../tools/assets/png';

/**
 * A SOURCE FOLDER OF ART for the tests of the build and of the checker (docs/ART-PIPELINE-2D.md, parts C and E): an index, a manifest and one PNG per frame —
 * noise on a transparent canvas, never art. `art/<pack>/<pack>.pack.json` and `art/<pack>/<set>/<frame>.png`, as the build reads them.
 */
export const W = 96;
export const H = 80;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A frame: random opaque-ish pixels inside `box` (alpha never 0 there), transparent everywhere else. */
export function noiseFrame(seed: number, box: Box, width = W, height = H): RgbaImage {
  const rng = new Rng(seed);
  const data = new Uint8Array(width * height * 4);
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) data.set([rng.int(0, 256), rng.int(0, 256), rng.int(0, 256), [255, 255, 200, 1][rng.int(0, 4)]!], (y * width + x) * 4);
  }
  return { width, height, data };
}

export const put = (file: string, data: Buffer | string): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};
export const json = (v: unknown): string => JSON.stringify(v, null, 2);

export interface SourceSprite {
  id: string;
  clips: Record<string, { count: number; extra?: Record<string, unknown> }>;
  /** Extra keys of the sprite set in the manifest (`frames`, `anchors`, `height`, `missingClips`…). */
  extra?: Record<string, unknown>;
  /** The frame (same canvas for all): by default a block in the middle. */
  box?: Box;
}

export interface SourcePack {
  id: string;
  category?: string;
  status?: string;
  load?: string;
  zones?: string[];
  sprites: SourceSprite[];
  /** What to change in the manifest before it is written. */
  manifest?: (m: Record<string, unknown>) => Record<string, unknown>;
}

/** Writes `art/index.json` and, for each pack, its manifest and its frames. Returns the folder. */
export function writeSourceArt(src: string, packs: SourcePack[]): void {
  put(join(src, 'index.json'), json({ manifestVersion: 1, packs: packs.map((p) => ({ id: p.id, category: p.category ?? 'enemies', load: p.load ?? 'lazy', ...(p.zones ? { zones: p.zones } : {}), manifest: `${p.id}/${p.id}.pack.json` })) }));
  let seed = 1;
  for (const p of packs) {
    const manifest = {
      manifestVersion: 1,
      id: p.id,
      category: p.category ?? 'enemies',
      status: p.status ?? 'provisional',
      atlases: [],
      sprites: p.sprites.map((s) => ({
        id: s.id,
        artPxPerMeter: 40,
        pivot: [0.5, 1],
        height: 1.6,
        clips: Object.fromEntries(Object.entries(s.clips).map(([state, c]) => [state, { frames: `${state}_`, count: c.count, fps: 8, ...c.extra }])),
        ...s.extra,
      })),
    };
    put(join(src, p.id, `${p.id}.pack.json`), json(p.manifest ? p.manifest(manifest) : manifest));
    for (const s of p.sprites) {
      for (const [state, c] of Object.entries(s.clips)) {
        // the frames are named by the prefix the manifest gives the clip (`${state}_` unless the test says another: a pack names each frame once)
        const prefix = (c.extra?.['frames'] as string | undefined) ?? `${state}_`;
        for (let i = 0; i < c.count; i++) put(join(src, p.id, s.id, `${prefix}${String(i).padStart(2, '0')}.png`), encodePng(noiseFrame(seed++, s.box ?? { x: 20, y: 8, w: 40, h: 68 })));
      }
    }
  }
}

/** The sword contract for the frames of a blow: grip on the hand, tip 0.9 m ahead (metres from the feet). `grip` moves the grip away from the hand. */
export function swordAnchors(state: string, count: number, grip: [number, number] | null = null): Record<string, unknown> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => {
      const hand: [number, number] = [0.25 + 0.1 * i, 1.0];
      return [`${state}_${String(i).padStart(2, '0')}`, { anchors: { hand_r: hand, weapon_grip: grip ?? hand, weapon_tip: [hand[0] + 0.9, 1.2] } }];
    }),
  );
}
