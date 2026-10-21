import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cutByBoxes, IntakeError, parsePoseBoxes, parseScaleFile } from '../../../tools/assets/intake';
import { heroPaths, readDelivered } from '../../../tools/assets/heroRepo';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';
import { clipSheet, CROP_MARGIN, readSheetData, sha256, sheetProblems, writeClipInbox, type SheetData } from '../../../tools/assets/sheetData';

/**
 * THE CHARACTER SHEET AND WHAT THE DATA SAYS OF IT (tools/assets/sheetData.ts, docs/PROMPT16-LOG.md): the protagonist's design is ONE image of the user's, kept bit for bit; `character-sheet.json` says where each of its 50
 * poses is and which are which clip. What is asserted here is that nothing in between has a hand in it: the file is the image that was handed over; every pose is accounted for; the part of the sheet a clip is made from is a plain
 * crop (not one pixel resampled or changed) and the archive of each delivery holds exactly that crop; and a pose's rectangle never cuts the figure it is meant to hold.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const paths = heroPaths(root);
const USER_SHEET_SHA256 = '1150f61df05fa7e7f8dae7cfc700602c88a7307e31573e349c707c9ab34d6bbd';
const sheetBytes = readFileSync(paths.sheet);
const sheet = decodePng(sheetBytes);
const data = readSheetData(root);

const same = (a: RgbaImage, b: RgbaImage): boolean => a.width === b.width && a.height === b.height && Buffer.from(a.data).equals(Buffer.from(b.data));
const slice = (img: RgbaImage, x0: number, y0: number, x1: number, y1: number): RgbaImage => {
  const w = x1 - x0 + 1;
  const out = new Uint8Array(w * (y1 - y0 + 1) * 4);
  for (let y = y0; y <= y1; y++) out.set(img.data.subarray((y * img.width + x0) * 4, (y * img.width + x1 + 1) * 4), (y - y0) * w * 4);
  return { width: w, height: y1 - y0 + 1, data: out };
};

describe('the character sheet is the user\'s image, bit for bit', () => {
  it('has the hash of the file that was handed over, the size it was handed over at, and the data that reads it was made for exactly it', () => {
    expect(sha256(sheetBytes)).toBe(USER_SHEET_SHA256);
    expect(data.sha256).toBe(USER_SHEET_SHA256);
    expect([sheet.width, sheet.height]).toEqual([1536, 1024]);
    expect(data.size).toEqual([1536, 1024]);
    expect(sheetProblems(root)).toEqual([]);
  });

  it('says what is wrong, and where, when it is not: another file under the same name, a pose outside the sheet, a clip that names a pose or a panel that is not there, a pose nobody accounts for', () => {
    // a doctored copy of the data (or of the file) in a fake repository root, judged by the same function: the real files are never touched
    const base = mkdtempSync(join(tmpdir(), 'troid-sheet-'));
    try {
      const src = join(base, 'art', 'player', 'source');
      mkdirSync(src, { recursive: true });
      const fake = heroPaths(base);
      const write = (d: SheetData, bytes: Uint8Array = sheetBytes): void => (writeFileSync(fake.sheet, bytes), writeFileSync(fake.sheetData, JSON.stringify(d)));
      const doctored = (change: (d: SheetData) => void): string[] => {
        const d = JSON.parse(JSON.stringify(data)) as SheetData;
        change(d);
        write(d);
        return sheetProblems(base);
      };
      expect(doctored(() => undefined), 'the copy, untouched, is as sound as the original').toEqual([]);
      expect(doctored((d) => (d.sha256 = '0'.repeat(64))).join('\n')).toMatch(/is not the sheet the data was made for .* the poses would be cut from other pixels/);
      expect(doctored((d) => (d.size = [1024, 1536])).join('\n')).toMatch(/the sheet is 1536 × 1024, the data says 1024 × 1536/);
      // another file under the same name: one bit of it different is enough — and a file that is not even a PNG any more is said, not thrown
      const other = new Uint8Array(sheetBytes);
      other[other.length >> 1] ^= 1;
      write(JSON.parse(JSON.stringify(data)) as SheetData, other);
      const damaged = sheetProblems(base);
      expect(damaged[0]).toMatch(/character-sheet\.png is not the sheet the data was made for/);
      expect(damaged[1]).toMatch(/character-sheet\.png cannot be read as a PNG: the PNG is corrupt/);
      expect(damaged).toHaveLength(2);
      write(JSON.parse(JSON.stringify(data)) as SheetData, new TextEncoder().encode('not a png'));
      expect(sheetProblems(base).join('\n')).toMatch(/cannot be read as a PNG/);
      expect(doctored((d) => (d.panels['idle']!.poses[0] = [-3, 0, 40, 40])).join('\n')).toMatch(/panel "idle" pose 1: the rectangle \[-3, 0, 40, 40\] is not inside the sheet/);
      expect(doctored((d) => (d.panels['idle']!.poses[1] = [10, 10, 5000, 40])).join('\n')).toMatch(/panel "idle" pose 2: the rectangle \[10, 10, 5000, 40\] is not inside the sheet/);
      expect(doctored((d) => (d.panels['idle']!.poses[1] = [10.5, 10, 40, 40])).join('\n')).toMatch(/panel "idle" pose 2: .* is not inside the sheet/);
      expect(doctored((d) => (d.clips['walk']!.panel = 'nowhere')).join('\n')).toMatch(/clip "walk": there is no panel "nowhere"/);
      expect(doctored((d) => d.clips['walk']!.poses.push(99)).join('\n')).toMatch(/clip "walk": pose 99 is not in the panel "walking" \(it has 6\)|clip "walk": pose 99 is not in the panel/);
      expect(doctored((d) => (d.clips['walk']!.poses = d.clips['walk']!.poses.slice(1))).join('\n')).toMatch(/pose 1: no clip uses it and "unused" does not say why/);
      expect(doctored((d) => (d.unused = [])).join('\n')).toMatch(/no clip uses it and "unused" does not say why/);
      // and nothing at all there: it says so, it does not throw
      expect(sheetProblems(join(base, 'art', 'nowhere'))[0]).toMatch(/is not there/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('writes the inbox of a clip from the sheet — the crop and its boxes, nothing else touched — and refuses to when the sheet and its data disagree', () => {
    const base = mkdtempSync(join(tmpdir(), 'troid-sheet-'));
    try {
      const fake = heroPaths(base);
      mkdirSync(fake.source, { recursive: true });
      writeFileSync(fake.sheet, sheetBytes);
      writeFileSync(fake.sheetData, JSON.stringify(data));
      const dir = writeClipInbox(base, 'fall');
      expect(dir).toBe(join(fake.inbox, 'fall'));
      const part = clipSheet(sheet, data, 'fall');
      expect(same(decodePng(readFileSync(join(dir, 'sheet.png'))), part.sheet)).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, 'poses.json'), 'utf8'))).toEqual(part.poses);
      // what else is in the clip's inbox (its anchors, what is taken out) is the person's: writing the sheet again leaves it
      writeFileSync(join(dir, 'erase.json'), '{"keep":"me"}');
      writeClipInbox(base, 'fall');
      expect(readFileSync(join(dir, 'erase.json'), 'utf8')).toBe('{"keep":"me"}');
      expect(() => writeClipInbox(base, 'crouch')).toThrow(/character-sheet\.json has no clip "crouch"/);
      writeFileSync(fake.sheetData, JSON.stringify({ ...data, sha256: '1'.repeat(64) }));
      expect(() => writeClipInbox(base, 'fall')).toThrow(/the character sheet and its data do not agree/);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('accounts for every pose of the sheet: the 44 poses of the 12 clips are the 44 frames of the game, the other 6 are the turn-round views and the view from behind — and each of those says why it is not used', () => {
    const poses = Object.values(data.panels).reduce((n, p) => n + p.poses.length, 0);
    expect(poses).toBe(50);
    const used = Object.values(data.clips).reduce((n, c) => n + c.poses.length, 0);
    expect(used).toBe(44);
    const unused = data.unused.reduce((n, u) => n + u.poses.length, 0);
    expect(used + unused).toBe(poses);
    for (const u of data.unused) expect(u.why.length, `${u.panel}: why it is not used`).toBeGreaterThan(40);
    // no pose is used by two clips, and none is both used and unused
    const seen = new Set<string>();
    for (const [clip, c] of Object.entries(data.clips)) for (const n of c.poses) expect(seen.has(`${c.panel}:${n}`), `${clip}: ${c.panel} pose ${n} is used twice`).toBe(false), seen.add(`${c.panel}:${n}`);
    for (const u of data.unused) for (const n of u.poses) expect(seen.has(`${u.panel}:${n}`), `${u.panel} pose ${n} is used and unused`).toBe(false);
  });

  it('every pose has a rectangle inside the sheet, and the rectangles of one panel do not touch: a pose never holds a piece of its neighbour', () => {
    for (const [name, panel] of Object.entries(data.panels)) {
      panel.poses.forEach(([x0, y0, x1, y1], k) => {
        expect(x0 >= 0 && y0 >= 0 && x1 < sheet.width && y1 < sheet.height && x0 <= x1 && y0 <= y1, `${name} ${k + 1}`).toBe(true);
        panel.poses.slice(k + 1).forEach(([a0, b0, a1, b1], j) => {
          const apart = x1 + 1 < a0 || a1 + 1 < x0 || y1 + 1 < b0 || b1 + 1 < y0;
          expect(apart, `${name}: pose ${k + 1} and pose ${k + j + 2} overlap`).toBe(true);
        });
      });
    }
  });

  it('no rectangle cuts a figure: the pixels just outside it hold no ink (what is not white), bar the odd faint speck', () => {
    for (const [name, panel] of Object.entries(data.panels)) {
      panel.poses.forEach(([x0, y0, x1, y1], k) => {
        let ink = 0;
        const probe = (x: number, y: number): void => {
          if (x < 0 || y < 0 || x >= sheet.width || y >= sheet.height) return;
          const o = (y * sheet.width + x) * 4;
          if (255 - Math.min(sheet.data[o]!, sheet.data[o + 1]!, sheet.data[o + 2]!) >= 255 * 0.12) ink++;
        };
        for (let x = x0 - 1; x <= x1 + 1; x++) (probe(x, y0 - 1), probe(x, y1 + 1));
        for (let y = y0; y <= y1; y++) (probe(x0 - 1, y), probe(x1 + 1, y));
        expect(ink, `${name} pose ${k + 1}: ink just outside its rectangle`).toBeLessThanOrEqual(2);
      });
    }
  });
});

describe('what each clip is made from', () => {
  it('is a plain crop of the sheet: the pixels of the part are the sheet\'s, not one resampled or changed, with room all round the poses — and the poses\' rectangles, put back, are the sheet\'s', () => {
    for (const [clip, c] of Object.entries(data.clips)) {
      const part = clipSheet(sheet, data, clip);
      const [ox, oy] = part.origin;
      expect(same(part.sheet, slice(sheet, ox, oy, ox + part.sheet.width - 1, oy + part.sheet.height - 1)), `${clip}: the part is a crop`).toBe(true);
      expect(part.poses.boxes, `${clip}: one box per pose`).toHaveLength(c.poses.length);
      part.poses.boxes.forEach((b, k) => {
        const master = data.panels[c.panel]!.poses[c.poses[k]! - 1]!;
        expect([b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy], `${clip} pose ${k + 1}: its box in the crop is its box in the sheet`).toEqual(master);
        // room for the soft edge: at least the margin the matte looks into, except where the sheet itself ends
        expect(b[0] >= Math.min(CROP_MARGIN, ox) && b[1] >= Math.min(CROP_MARGIN, oy), `${clip} pose ${k + 1}: room on the left and above`).toBe(true);
        expect(part.sheet.width - 1 - b[2] >= Math.min(CROP_MARGIN, sheet.width - 1 - (ox + part.sheet.width - 1)) && part.sheet.height - 1 - b[3] >= Math.min(CROP_MARGIN, sheet.height - 1 - (oy + part.sheet.height - 1)), `${clip} pose ${k + 1}: room on the right and below`).toBe(true);
      });
    }
  });

  it('is exactly what the archive of its delivery holds: the sheet.png and poses.json of `art/player/source/delivered/<clip>/` are that crop and those boxes — nobody has touched a pixel of it', () => {
    for (const clip of readDelivered(root)) {
      const dir = join(paths.delivered, clip);
      const part = clipSheet(sheet, data, clip);
      expect(same(decodePng(readFileSync(join(dir, 'sheet.png'))), part.sheet), `${clip}: the archived sheet is the crop`).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, 'poses.json'), 'utf8')), `${clip}: the archived boxes`).toEqual(part.poses);
    }
    expect(existsSync(join(paths.delivered, 'crouch')), 'a clip the sheet has no drawing for has no delivery').toBe(false);
  });

  it('has the clips the game has frames for, and no other: the twelve of the manifest', () => {
    expect(Object.keys(data.clips)).toEqual(['idle', 'walk', 'run', 'jump', 'fall', 'land', 'attack1', 'cast', 'dash', 'interact', 'hurt', 'death']);
    expect(readDelivered(root)).toEqual(Object.keys(data.clips));
  });
});

describe('cutting by the rectangles of poses.json, and the scale that is kept with a delivery', () => {
  const sheet2: RgbaImage = (() => {
    const w = 80;
    const h = 40;
    const d = new Uint8Array(w * h * 4).fill(255);
    const dot = (cx: number, cy: number): void => {
      for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) d.set([10, 12, 14, 255], (y * w + x) * 4);
    };
    dot(14, 20);
    dot(58, 20);
    return { width: w, height: h, data: d };
  })();

  it('reads the boxes: a rectangle per pose, whole numbers, inside the sheet — and says what is wrong, not guesses', () => {
    expect(parsePoseBoxes('{"boxes": [[0, 0, 30, 39], [40, 0, 79, 39]]}', 2, sheet2).boxes).toEqual([{ x0: 0, y0: 0, x1: 30, y1: 39 }, { x0: 40, y0: 0, x1: 79, y1: 39 }]);
    expect(parsePoseBoxes('{"boxes": [[0, 0, 30, 39]], "matte": {"ink": 0.2, "rim": 2}}', 1, sheet2).matte).toEqual({ ink: 0.2, rim: 2 });
    const bad = (text: string, expected: number, re: RegExp): void => expect(() => parsePoseBoxes(text, expected, sheet2)).toThrow(re);
    bad('{ nope', 1, /not valid JSON/);
    bad('{}', 1, /needs "boxes": 1 rectangles/);
    bad('{"boxes": [[0, 0, 30, 39]]}', 2, /needs "boxes": 2 rectangles .* has 1/);
    bad('{"boxes": [[0, 0, 30]]}', 1, /box 1 must be four whole numbers/);
    bad('{"boxes": [[0, 0, 30.5, 39]]}', 1, /box 1 must be four whole numbers/);
    bad('{"boxes": [[0, 0, 80, 39]]}', 1, /box 1 \[0, 0, 80, 39\] is not inside the 80 × 40 sheet/);
    bad('{"boxes": [[10, 0, 5, 39]]}', 1, /is not inside/);
    bad('{"boxes": [[0, 0, 30, 39]], "matte": {"ink": 2}}', 1, /matte\.ink must be a number between 0 and 1/);
    bad('{"boxes": [[0, 0, 30, 39]], "matte": {"rim": "a"}}', 1, /matte\.rim must be a number of pixels/);
  });

  it('cuts one pose out of each rectangle, in the order given, each the figure of its own rectangle — and says so when a rectangle holds nothing', () => {
    const cut = cutByBoxes(sheet2, [{ x0: 4, y0: 6, x1: 24, y1: 34 }, { x0: 48, y0: 6, x1: 68, y1: 34 }]);
    expect(cut.poses).toHaveLength(2);
    expect(cut.poses.map((p) => [p.width, p.height])).toEqual([[13, 13], [13, 13]]);
    expect(cut.final).toEqual([false, false]);
    expect(() => cutByBoxes(sheet2, [{ x0: 30, y0: 0, x1: 40, y1: 10 }])).toThrow(new RegExp(`nothing of a figure was found in the box`));
    expect(() => cutByBoxes(sheet2, [{ x0: 30, y0: 0, x1: 40, y1: 10 }])).toThrow(IntakeError);
  });

  it('reads scale.json: a factor and why it is not the neighbour\'s — nothing without it, and everything wrong with it said', () => {
    expect(parseScaleFile(null)).toBeUndefined();
    expect(parseScaleFile('{"factor": 1, "why": "the reference of the character: the sheet at its own size"}')).toBe(1);
    expect(parseScaleFile('{"factor": 1.25, "why": "a factor given with its reason, long enough to be one"}')).toBe(1.25);
    expect(() => parseScaleFile('{ nope')).toThrow(/not valid JSON/);
    expect(() => parseScaleFile('{"why": "a reason that is long enough to be one"}')).toThrow(/needs "factor"/);
    expect(() => parseScaleFile('{"factor": 0, "why": "a reason that is long enough to be one"}')).toThrow(/needs "factor"/);
    expect(() => parseScaleFile('{"factor": 11, "why": "a reason that is long enough to be one"}')).toThrow(/needs "factor"/);
    expect(() => parseScaleFile('{"factor": 1, "why": "short"}')).toThrow(/needs a "why" of at least 20 characters/);
  });
});
