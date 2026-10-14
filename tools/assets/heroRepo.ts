import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eyeDiameter, headDiameter } from './figure';
import { frameFile, keptFrom } from './heroAnimation';
import { decodePng, type RgbaImage } from './png';

/**
 * WHERE THE PROTAGONIST LIVES IN THE REPOSITORY, for the tools that read it (the production kit and the reception of new drawings): the paths, the clips the manifest declares, their frames and
 * the one measurement a new drawing is scaled against. Reading only; the generator (`animate.ts`) and the reception (`intake.ts`) are the ones that write.
 */

export const heroPaths = (root: string) => ({
  hero: join(root, 'art', 'player', 'hero'),
  manifest: join(root, 'art', 'player', 'player.pack.json'),
  source: join(root, 'art', 'player', 'source'),
  rig: join(root, 'art', 'player', 'source', 'hero.rig.json'),
  poses: join(root, 'art', 'player', 'source', 'hero.poses.json'),
  sheet: join(root, 'art', 'player', 'source', 'hero-sheet.png'),
  requestsDir: join(root, 'art', 'player', 'requests'),
  requests: join(root, 'art', 'player', 'requests', 'requests.json'),
  inbox: join(root, 'art', 'player', 'inbox'),
});

/** An entry of the manifest's `clips`, as far as the tools read one. */
export interface ManifestClip {
  frames: string;
  count: number;
  fps?: number;
  loop?: boolean;
  tags?: string[];
  phases?: Record<string, [number, number]>;
  comment?: string;
}

/** The clips of the protagonist as the committed manifest declares them (empty when there is no manifest yet). */
export function readClips(root: string): Record<string, ManifestClip> {
  const file = heroPaths(root).manifest;
  if (!existsSync(file)) return {};
  return keptFrom(JSON.parse(readFileSync(file, 'utf8'))).clips as Record<string, ManifestClip>;
}

/** The clips the rig lists as handed over by hand. */
export function readDelivered(root: string): string[] {
  const file = heroPaths(root).rig;
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, 'utf8')) as { delivered?: string[] }).delivered ?? [];
}

export const clipFrameNames = (clip: ManifestClip): string[] => Array.from({ length: clip.count }, (_, k) => frameFile(clip.frames, k));

export const readHeroFrame = (root: string, name: string): RgbaImage => decodePng(readFileSync(join(heroPaths(root).hero, `${name}.png`)));

export function median(values: readonly number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const mid = v.length >> 1;
  return v.length % 2 === 1 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** The big eye of a clip of the game, in pixels: the median over its frames that have one that can be measured, or `null` when none has (a clip whose light goes out). */
export function clipEye(root: string, clipName: string): number | null {
  const clip = readClips(root)[clipName];
  if (!clip) return null;
  const eyes: number[] = [];
  for (const name of clipFrameNames(clip)) {
    const e = eyeDiameter(readHeroFrame(root, name));
    if (e) eyes.push(e.diameter);
  }
  return eyes.length === 0 ? null : median(eyes);
}

/** The head of a clip of the game, in pixels: the biggest circle inside the figure (`headDiameter`), the median over its frames — the measure a sheet is scaled by when its head turns and its eyes cannot say. */
export function clipHead(root: string, clipName: string): number | null {
  const clip = readClips(root)[clipName];
  if (!clip) return null;
  const heads: number[] = [];
  for (const name of clipFrameNames(clip)) {
    const h = headDiameter(readHeroFrame(root, name));
    if (h !== null) heads.push(h);
  }
  return heads.length === 0 ? null : median(heads);
}
