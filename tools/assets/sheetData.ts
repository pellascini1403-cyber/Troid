import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { heroPaths } from './heroRepo';
import { crop, IntakeError } from './intake';
import { decodePng, encodePng, type RgbaImage } from './png';
import type { Box } from './poses';

/**
 * THE CHARACTER SHEET AND WHAT IT SAYS (docs/PROMPT16-LOG.md): the protagonist's design is ONE image of the user's, kept bit for bit (`art/player/source/character-sheet.png`, checked against its hash), in panels
 * — idle, walking, running, jumping, falling, the blow, the cast, the dash, the interaction, being hurt, dying, the view from behind — each with its poses. `character-sheet.json` is the DATA that reads it: where every
 * pose is (a rectangle of the sheet, tight around the figure and what goes with it), and which poses of which panel are which clip of the game. The decisions that are a person's are in that file and can be looked at;
 * this module only follows it: it cuts out of the sheet, by a plain crop (no pixel resampled, none changed), the part each clip is made from and writes it into the clip's inbox, where `npm run assets:intake` takes over.
 */

export type PoseRect = [number, number, number, number];

export interface SheetClip {
  /** The panel of the sheet the poses are in. */
  panel: string;
  /** Which poses of the panel (1-based, in the order of the sheet), in the order of the frames. */
  poses: number[];
  note?: string;
}

export interface SheetData {
  comment: string;
  sheet: string;
  sha256: string;
  size: [number, number];
  panels: Record<string, { title: string; poses: PoseRect[] }>;
  clips: Record<string, SheetClip>;
  /** Poses of the sheet that no clip uses, and why. */
  unused: Array<{ panel: string; poses: number[]; why: string }>;
}

export const readSheetData = (root: string): SheetData => JSON.parse(readFileSync(heroPaths(root).sheetData, 'utf8')) as SheetData;

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

/** What is wrong with the sheet and its data (empty: all is as it should be): the file is not the one the data was made for, a pose is outside it or does not exist, a clip names a panel that is not there. */
export function sheetProblems(root: string): string[] {
  const paths = heroPaths(root);
  const problems: string[] = [];
  if (!existsSync(paths.sheet) || !existsSync(paths.sheetData)) return [`${!existsSync(paths.sheet) ? paths.sheet : paths.sheetData} is not there`];
  const data = readSheetData(root);
  const bytes = readFileSync(paths.sheet);
  if (sha256(bytes) !== data.sha256) problems.push(`character-sheet.png is not the sheet the data was made for (sha256 ${sha256(bytes)}, the data says ${data.sha256}): the poses would be cut from other pixels`);
  // a file that is not a PNG at all is a problem to say, not an exception: the rectangles are then judged against the size the data declares
  let size: [number, number] = data.size;
  try {
    const img = decodePng(bytes);
    size = [img.width, img.height];
    if (img.width !== data.size[0] || img.height !== data.size[1]) problems.push(`the sheet is ${img.width} × ${img.height}, the data says ${data.size[0]} × ${data.size[1]}`);
  } catch (e) {
    problems.push(`character-sheet.png cannot be read as a PNG: ${(e as Error).message}`);
  }
  for (const [name, panel] of Object.entries(data.panels)) {
    panel.poses.forEach(([x0, y0, x1, y1], k) => {
      if (![x0, y0, x1, y1].every(Number.isInteger) || x0 < 0 || y0 < 0 || x1 >= size[0] || y1 >= size[1] || x0 > x1 || y0 > y1) problems.push(`panel "${name}" pose ${k + 1}: the rectangle [${x0}, ${y0}, ${x1}, ${y1}] is not inside the sheet`);
    });
  }
  const used = new Map<string, Set<number>>();
  for (const [clip, c] of Object.entries(data.clips)) {
    const panel = data.panels[c.panel];
    if (!panel) {
      problems.push(`clip "${clip}": there is no panel "${c.panel}"`);
      continue;
    }
    for (const n of c.poses) {
      if (!Number.isInteger(n) || n < 1 || n > panel.poses.length) problems.push(`clip "${clip}": pose ${n} is not in the panel "${c.panel}" (it has ${panel.poses.length})`);
      else used.set(c.panel, (used.get(c.panel) ?? new Set()).add(n));
    }
  }
  for (const u of data.unused) for (const n of u.poses) used.set(u.panel, (used.get(u.panel) ?? new Set()).add(n));
  // every pose of the sheet is accounted for: used by a clip, or said not to be and why
  for (const [name, panel] of Object.entries(data.panels)) {
    for (let n = 1; n <= panel.poses.length; n++) if (!used.get(name)?.has(n)) problems.push(`panel "${name}" pose ${n}: no clip uses it and "unused" does not say why`);
  }
  return problems;
}

/** Room left around the poses in the part of the sheet a clip is made from (px): at least what the matte looks outside a pose. */
export const CROP_MARGIN = 8;

export interface ClipSheet {
  /** The part of the sheet the clip is made from: a crop, bit for bit. */
  sheet: RgbaImage;
  /** `poses.json` of the clip: the rectangles of its poses in `sheet`, in the order of its frames. */
  poses: { boxes: PoseRect[] };
  /** Where `sheet` starts in the whole sheet. */
  origin: [number, number];
}

/** The part of the sheet `clip` is made from, and where its poses are in it. */
export function clipSheet(sheet: RgbaImage, data: SheetData, clip: string): ClipSheet {
  const c = data.clips[clip];
  if (!c) throw new IntakeError(`character-sheet.json has no clip "${clip}" (it has ${Object.keys(data.clips).join(', ')})`);
  const rects = c.poses.map((n) => data.panels[c.panel]!.poses[n - 1]!);
  const x0 = Math.max(0, Math.min(...rects.map((r) => r[0])) - CROP_MARGIN);
  const y0 = Math.max(0, Math.min(...rects.map((r) => r[1])) - CROP_MARGIN);
  const x1 = Math.min(sheet.width - 1, Math.max(...rects.map((r) => r[2])) + CROP_MARGIN);
  const y1 = Math.min(sheet.height - 1, Math.max(...rects.map((r) => r[3])) + CROP_MARGIN);
  const box: Box = { x0, y0, x1, y1 };
  return { sheet: crop(sheet, box), poses: { boxes: rects.map((r) => [r[0] - x0, r[1] - y0, r[2] - x0, r[3] - y0] as PoseRect) }, origin: [x0, y0] };
}

/** Writes `art/player/inbox/<clip>/sheet.png` and `poses.json` from the character sheet (anything else in the clip's inbox — its anchors, its erase.json — is left as it is). */
export function writeClipInbox(root: string, clip: string): string {
  const problems = sheetProblems(root);
  if (problems.length > 0) throw new IntakeError(`the character sheet and its data do not agree:\n  ${problems.join('\n  ')}`);
  const paths = heroPaths(root);
  const part = clipSheet(decodePng(readFileSync(paths.sheet)), readSheetData(root), clip);
  const dir = join(paths.inbox, clip);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'sheet.png'), encodePng(part.sheet));
  writeFileSync(join(dir, 'poses.json'), `${JSON.stringify(part.poses)}\n`);
  return dir;
}
