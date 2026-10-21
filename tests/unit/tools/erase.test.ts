import { describe, expect, it } from 'vitest';
import { applyErase, insidePolygon, isBodyPixel, MIN_ERASE_WHY, parseErase, type Point } from '../../../tools/assets/erase';
import { IntakeError, type SwordPoints } from '../../../tools/assets/intake';
import type { RgbaImage } from '../../../tools/assets/png';

/**
 * WHAT A PERSON MAY TAKE OUT OF A DELIVERED DRAWING (tools/assets/erase.ts, docs/PROMPT12-LOG.md §8): the painted effects, by polygons, and nothing else. Tested on a frame built for it — a dark body, a bright
 * translucent arc apart from it and a bright opaque core inside the arc — so what is asserted is the rule and not a drawing: every pixel inside the polygons goes, no pixel outside is touched by a bit, and what
 * would take the figure (the body, the blade) or nothing at all (a stale polygon) is refused.
 */
const canvas = { width: 60, height: 40 };
const names = ['blow_00', 'blow_01'] as const;
const WHY = 'The arc of the slash is painted into the picture: an effect the game draws by itself, not the figure.';
const BODY: readonly [number, number, number, number] = [20, 30, 40, 255];
const ARC: readonly [number, number, number, number] = [100, 180, 250, 140];
const CORE: readonly [number, number, number, number] = [120, 200, 252, 255];
const HAZE: readonly [number, number, number, number] = [0, 110, 245, 10];

/** The frame: the body a block at x 10..29, y 10..29; the arc a translucent band at x 36..55, y 12..16; its bright core at x 40..44, y 20..22; a faint haze at x 46..52, y 24..25. The rest is transparent. */
function frame(): RgbaImage {
  const data = new Uint8Array(canvas.width * canvas.height * 4);
  const put = (x0: number, y0: number, x1: number, y1: number, rgba: readonly [number, number, number, number]): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data.set(rgba, (y * canvas.width + x) * 4);
  };
  put(10, 10, 29, 29, BODY);
  put(36, 12, 55, 16, ARC);
  put(40, 20, 44, 22, CORE);
  put(46, 24, 52, 25, HAZE);
  return { width: canvas.width, height: canvas.height, data };
}

const square = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const entry = (polygons: Point[][], why = WHY) => ({ why, polygons });
const px = (img: RgbaImage, x: number, y: number): number[] => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
const visible = (img: RgbaImage): number => { let n = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i]! > 0) n++; return n; };

describe('erase.json: reading it', () => {
  it('is nothing when there is no file, and otherwise an object of frames, each with its reason and its polygons (every one of them said as a list of [x, y] vertices inside the canvas)', () => {
    expect(parseErase(null, names, canvas)).toEqual({});
    const text = JSON.stringify({ blow_00: { why: `  ${WHY}  `, polygons: [square(34, 8, 58, 26), [[1, 1], [5, 1], [3, 5]]] } });
    const read = parseErase(text, names, canvas);
    expect(Object.keys(read)).toEqual(['blow_00']);
    expect(read['blow_00']!.why).toBe(WHY);
    expect(read['blow_00']!.polygons).toHaveLength(2);
    // a vertex ON the border of the canvas is inside it
    expect(() => parseErase(JSON.stringify({ blow_01: entry([square(0, 0, 60, 40)]) }), names, canvas)).not.toThrow();
  });

  it('says what is wrong, and where, and guesses nothing: not JSON, not an object, a frame the clip does not have, a reason too short to be one, no polygons, a polygon of two points or with a word in it, a vertex outside the canvas', () => {
    const bad = (value: unknown, text?: RegExp): void => expect(() => parseErase(typeof value === 'string' ? value : JSON.stringify(value), names, canvas)).toThrow(text ?? IntakeError);
    bad('{ nope', /not valid JSON/);
    bad([], /must be an object/);
    bad('3', /must be an object/);
    bad({ blow_09: entry([square(1, 1, 5, 5)]) }, /"blow_09" is not a frame of this clip \(blow_00, blow_01\)/);
    bad({ blow_00: { polygons: [square(1, 1, 5, 5)] } }, new RegExp(`needs a "why" of at least ${MIN_ERASE_WHY} characters`));
    bad({ blow_00: entry([square(1, 1, 5, 5)], 'an effect') }, /needs a "why"/);
    bad({ blow_00: { why: WHY } }, /needs "polygons"/);
    bad({ blow_00: entry([]) }, /needs "polygons"/);
    bad({ blow_00: entry([[[1, 1], [5, 5]] as Point[]]) }, /polygon 1 needs at least three \[x, y\] vertices/);
    bad({ blow_00: entry([square(1, 1, 5, 5), [[1, 1], [5, 1], ['a', 3]] as unknown as Point[]]) }, /polygon 2 needs at least three/);
    bad({ blow_00: entry([[[1, 1], [5, 1], [61, 3]]]) }, /polygon 1 has a vertex outside the canvas of 60 × 40/);
    bad({ blow_00: entry([[[1, 1], [5, 1], [3, -1]]]) }, /outside the canvas/);
  });

  it('knows what is inside a polygon (even-odd): a square, a polygon with a notch, and the corners of its pixels', () => {
    const box = square(10, 10, 20, 20);
    expect(insidePolygon(15, 15, box)).toBe(true);
    expect(insidePolygon(9.9, 15, box)).toBe(false);
    expect(insidePolygon(20.1, 15, box)).toBe(false);
    // an "L": the square without its top right quarter
    const ell: Point[] = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
    expect(insidePolygon(2, 2, ell)).toBe(true);
    expect(insidePolygon(8, 2, ell)).toBe(true);
    expect(insidePolygon(2, 8, ell)).toBe(true);
    expect(insidePolygon(8, 8, ell)).toBe(false);
  });
});

describe('erase.json: what it takes out, and only that', () => {
  it('makes transparent every visible pixel inside the polygons — the translucent arc, its opaque core, its haze — and changes no other byte of the frame; the frame as it was stays in the result for the report', () => {
    const f = frame();
    const original = new Uint8Array(f.data);
    const { frames, erased } = applyErase([f, frame()], names, { blow_00: entry([square(34, 8, 58, 18), square(38, 19, 46, 27), square(44, 23, 54, 27)]) });
    // the arc (20 × 5), the core (5 × 3) and the haze (7 × 2) are gone: 100 + 15 + 14 visible pixels
    expect(erased).toHaveLength(1);
    expect(erased[0]!).toMatchObject({ name: 'blow_00', why: WHY, pixels: 129 });
    expect(visible(frames[0]!)).toBe(visible(f) - 129);
    expect(px(frames[0]!, 40, 14)).toEqual([0, 0, 0, 0]);
    expect(px(frames[0]!, 42, 21)).toEqual([0, 0, 0, 0]);
    // nothing else moved: the body is the same bytes, and every pixel outside the polygons is exactly what it was
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const inside = erased[0]!.mask[y * canvas.width + x] === 1;
        const was = px(f, x, y);
        expect(px(frames[0]!, x, y), `(${x}, ${y})`).toEqual(inside ? [0, 0, 0, 0] : was);
      }
    }
    expect(erased[0]!.mask.reduce((n, v) => n + v, 0)).toBe(129);
    // the input is not touched, the frame it was is kept, and a frame with no entry comes back as the very same object
    expect([...f.data]).toEqual([...original]);
    expect(erased[0]!.before).toBe(f);
    expect(frames[0]).not.toBe(f);
    expect(applyErase([f, frame()], names, {}).frames[0]).toBe(f);
    const second = frame();
    expect(applyErase([f, second], names, { blow_00: entry([square(34, 8, 58, 18)]) }).frames[1]).toBe(second);
  });

  it('decides by the centre of the pixel: a polygon edge on a pixel boundary takes the pixels whose centre is past it, and no others', () => {
    // x 36..55 is the arc: an edge at x = 40 takes pixels 40.. (centre 40.5) and leaves 36..39 (centre 39.5)
    const { frames } = applyErase([frame(), frame()], names, { blow_00: entry([square(40, 8, 58, 18)]) });
    expect(px(frames[0]!, 39, 14)).toEqual([...ARC]);
    expect(px(frames[0]!, 40, 14)).toEqual([0, 0, 0, 0]);
    // and an edge that crosses a pixel at its middle leaves it: the pixel whose centre is outside is not touched
    const half = applyErase([frame(), frame()], names, { blow_00: entry([square(40.6, 8, 58, 18)]) }).frames[0]!;
    expect(px(half, 40, 14)).toEqual([...ARC]);
    expect(px(half, 41, 14)).toEqual([0, 0, 0, 0]);
  });

  it('refuses a polygon that covers a pixel of the body (dark and opaque), and says where — the effect is taken out, never the figure; the effect\'s own pixels are not the body, however opaque', () => {
    expect(isBodyPixel(40, 255)).toBe(true);
    expect(isBodyPixel(127, 160)).toBe(true);
    expect(isBodyPixel(252, 255)).toBe(false);
    expect(isBodyPixel(128, 255)).toBe(false);
    expect(isBodyPixel(40, 159)).toBe(false);
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(26, 8, 58, 18)]) })).toThrow(/covers \d+ pixel\(s\) of the body \(dark and opaque; the first at 26,10\)/);
    // the opaque bright core of an arc is not body
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(38, 19, 46, 24)]) })).not.toThrow();
  });

  it('refuses a polygon over the blade — the line from the grip to the tip — and a stale one that encloses no visible pixel; a frame whose blade is not given (its sword was accepted as not visible) has none to protect', () => {
    const blades = new Map<string, SwordPoints>([['blow_00', { grip: [38, 10], tip: [50, 28] }]]);
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(34, 8, 58, 18)]) }, blades)).toThrow(/covers the blade \(the line from the grip 38,10 to the tip 50,28 of anchors\.json, at 38\.0,10\.0\)/);
    // clear of the blade, the same polygon is fine: this one only takes the haze, far from the line
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(46, 23.5, 54, 27)]) }, new Map<string, SwordPoints>([['blow_00', { grip: [38, 10], tip: [38, 20] }]]))).not.toThrow();
    // with no blade given for the frame, nothing protects it
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(34, 8, 58, 18)]) }, new Map())).not.toThrow();
    // the blade of ANOTHER frame is not this frame's
    expect(() => applyErase([frame(), frame()], names, { blow_01: entry([square(34, 8, 58, 18)]) }, blades)).not.toThrow();

    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(34, 8, 58, 18), square(2, 32, 8, 38)]) })).toThrow(/"blow_00" polygon 2 encloses no visible pixel of the frame — remove it/);
    expect(() => applyErase([frame(), frame()], names, { blow_00: entry([square(2, 32, 8, 38), square(10, 32, 18, 38)]) })).toThrow(/polygon 1, 2 enclose no visible pixel/);
  });
});

describe('erase.json: a dark speck painted on the effect (allowDark)', () => {
  /** The arc with one dark opaque speck inside it, as a slash arc painted with a mark on it. */
  const withSpeck = (): RgbaImage => {
    const f = frame();
    f.data.set(BODY, (14 * canvas.width + 48) * 4);
    return f;
  };
  const arcPolygon = square(34, 10, 58, 18);

  it('refuses a polygon over a dark opaque pixel as before, and takes that pixel out — and only that one — when it is listed', () => {
    expect(() => applyErase([withSpeck(), frame()], names, { blow_00: entry([arcPolygon]) })).toThrow(/covers 1 pixel\(s\) of the body \(dark and opaque; the first at 48,14\)/);
    const { frames, erased } = applyErase([withSpeck(), frame()], names, { blow_00: { ...entry([arcPolygon]), allowDark: [[48, 14]] } });
    expect(px(frames[0]!, 48, 14)).toEqual([0, 0, 0, 0]);
    expect(px(frames[0]!, 47, 14)).toEqual([0, 0, 0, 0]);
    expect(erased[0]!.pixels).toBe(20 * 5);
    // the body, untouched
    expect(px(frames[0]!, 15, 15)).toEqual([...BODY]);
  });

  it('refuses an entry that does not hold: a pixel that is not dark, one no polygon covers, one that is not there — and a list that is not a few whole pixels inside the canvas', () => {
    const polygons = [arcPolygon];
    expect(() => applyErase([withSpeck(), frame()], names, { blow_00: { ...entry(polygons), allowDark: [[48, 14], [38, 14]] } })).toThrow(/allowDark \(38,14\) is not a dark opaque pixel inside a polygon/);
    expect(() => applyErase([withSpeck(), frame()], names, { blow_00: { ...entry(polygons), allowDark: [[48, 14], [15, 15]] } })).toThrow(/allowDark \(15,15\)/);
    const bad = (allowDark: unknown): void => expect(() => parseErase(JSON.stringify({ blow_00: { ...entry([arcPolygon]), allowDark } }), names, canvas)).toThrow(/allowDark must be a list of 1 to 12 whole-number pixels/);
    bad([]);
    bad('a');
    bad([[1.5, 2]]);
    bad([[61, 2]]);
    bad(Array.from({ length: 13 }, (_, i) => [i, 1]));
    expect(parseErase(JSON.stringify({ blow_00: { ...entry([arcPolygon]), allowDark: [[48, 14]] } }), names, canvas)['blow_00']!.allowDark).toEqual([[48, 14]]);
  });
});
