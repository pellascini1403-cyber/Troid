import { crop } from './pack';
import type { RgbaImage } from './png';
import type { SourceFrame } from './pack';

/**
 * FRAME EXTRACTION FROM A SPRITESHEET, WHEN IT IS CLEARLY DEFINED (docs/ART-PIPELINE-2D.md, part F): an artist may hand over one image per clip instead of one
 * file per frame. The packer then cuts it by a grid the MANIFEST states — the size of a frame, the columns, the number of frames — and nothing is guessed: the
 * sheet must be EXACTLY as large as that grid says, or the extraction refuses and reports both numbers. A crop is the whole of the operation: no pixel is
 * resampled, blended or changed, so what comes out of the sheet is bit for bit what was drawn in its cell.
 *
 *   "sheets": [ { "file": "idle.png", "prefix": "idle_", "frameSize": [256, 256], "columns": 4, "count": 8 } ]
 *
 * The frames are named `<prefix><NN>` from `first` (0 by default), left to right and then top to bottom.
 */
export interface SheetSpec {
  /** The image, relative to the sprite set's folder. */
  file: string;
  prefix: string;
  frameSize: [number, number];
  columns: number;
  count: number;
  first: number;
}

export interface SheetResult {
  spec: SheetSpec | null;
  frames: SourceFrame[];
  errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Reads one `sheets` entry of the manifest. `null` and the reasons when it is not a complete, sensible definition. */
export function parseSheetSpec(raw: unknown): { spec: SheetSpec | null; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(raw)) return { spec: null, errors: ['a sheet must be an object'] };
  const file = raw['file'];
  if (typeof file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(file)) errors.push('"file" must be the name of a .png in the set\'s folder');
  const prefix = raw['prefix'];
  if (typeof prefix !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(prefix)) errors.push('"prefix" must be a frame-name prefix (letters, digits, _ and -)');
  const size = raw['frameSize'];
  if (!Array.isArray(size) || size.length !== 2 || !whole(size[0], 1, 4096) || !whole(size[1], 1, 4096)) errors.push('"frameSize" must be [width, height] in whole pixels: nothing is guessed');
  if (!whole(raw['columns'], 1, 96)) errors.push('"columns" must be a whole number: nothing is guessed');
  if (!whole(raw['count'], 1, 96)) errors.push('"count" must be a whole number: nothing is guessed');
  const first = raw['first'] === undefined ? 0 : raw['first'];
  if (!whole(first, 0, 95)) errors.push('"first" must be a whole number');
  for (const k of Object.keys(raw)) if (!['file', 'prefix', 'frameSize', 'columns', 'count', 'first', 'comment'].includes(k)) errors.push(`unknown key "${k}"`);
  if (errors.length > 0) return { spec: null, errors };
  return { spec: { file: file as string, prefix: prefix as string, frameSize: [(size as number[])[0]!, (size as number[])[1]!], columns: raw['columns'] as number, count: raw['count'] as number, first: first as number }, errors };
}

/** Cuts a sheet into its frames. The sheet has to be exactly the size of its grid (`columns × ceil(count / columns)` cells). */
export function extractSheet(raw: unknown, image: RgbaImage): SheetResult {
  const { spec, errors } = parseSheetSpec(raw);
  if (!spec) return { spec: null, frames: [], errors };
  const [fw, fh] = spec.frameSize;
  const rows = Math.ceil(spec.count / spec.columns);
  const want = { w: spec.columns * fw, h: rows * fh };
  if (image.width !== want.w || image.height !== want.h) {
    return { spec, frames: [], errors: [`${spec.file} is ${image.width} × ${image.height} but ${spec.columns} column(s) of ${fw} × ${fh} and ${spec.count} frame(s) make ${want.w} × ${want.h}: nothing is guessed, so the manifest and the picture have to agree`] };
  }
  const frames: SourceFrame[] = [];
  for (let i = 0; i < spec.count; i++) {
    const col = i % spec.columns;
    const row = Math.floor(i / spec.columns);
    frames.push({ name: `${spec.prefix}${String(spec.first + i).padStart(2, '0')}`, image: crop(image, { x: col * fw, y: row * fh, w: fw, h: fh }) });
  }
  return { spec, frames, errors: [] };
}
