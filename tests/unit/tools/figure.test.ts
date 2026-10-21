import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bodyOf, boundsOf, cleanliness, components, eyeDiameter, headDiameter } from '../../../tools/assets/figure';
import { LIMITS } from '../../../tools/assets/intake';
import { decodePng, type RgbaImage } from '../../../tools/assets/png';

/**
 * WHAT CAN BE MEASURED OF A FIGURE (tools/assets/figure.ts), pinned against the frames the protagonist had before the character sheet of the Prompt 16 — the frames of the design that is kept in
 * `art/player/archive/design-v1/` (the 90 that were in the game, from the 114 its generator made): the thresholds of the reception of new drawings were calibrated on them, so those frames must sit FAR inside every limit, and the measurements must keep saying what they said
 * the day they were calibrated. What the measurements say of the frames of the game TODAY is in `characterArt.test.ts`.
 */
const root = fileURLToPath(new URL('../../../', import.meta.url));
const OLD = join(root, 'art', 'player', 'archive', 'design-v1');
const dir = join(OLD, 'hero');
const frames = new Map<string, RgbaImage>();
for (const f of readdirSync(dir).filter((x) => x.endsWith('.png')).sort()) frames.set(f.slice(0, -4), decodePng(readFileSync(join(dir, f))));
const frame = (name: string): RgbaImage => frames.get(name)!;
/** The frames the generator made from the user's pixels: the ones of the clips drawn anew and handed over (`delivered` in the old rig) are not what these numbers were calibrated on. */
const handed = new Set((JSON.parse(readFileSync(join(OLD, 'source', 'hero.rig.json'), 'utf8')) as { delivered?: string[] }).delivered ?? []);
const made = [...frames].filter(([name]) => !handed.has(name.replace(/_\d+$/, '')));

describe('the measurements of a figure', () => {
  it('finds the big eye where the design has it, at the size the frames have: the idle 25 px, the landing crouch 19, the fall 17 (the user\'s drawings are not at one scale)', () => {
    expect(eyeDiameter(frame('idle_00'))!.diameter).toBeGreaterThan(24.3);
    expect(eyeDiameter(frame('idle_00'))!.diameter).toBeLessThan(26);
    expect(eyeDiameter(frame('land_00'))!.diameter).toBeGreaterThan(18.2);
    expect(eyeDiameter(frame('land_00'))!.diameter).toBeLessThan(19.6);
    expect(eyeDiameter(frame('fall_00'))!.diameter).toBeGreaterThan(16.2);
    expect(eyeDiameter(frame('fall_00'))!.diameter).toBeLessThan(17.6);
    // it is a circle-ish blob with highlights, the biggest of the frame
    const e = eyeDiameter(frame('idle_00'))!;
    expect(e.fill).toBeGreaterThan(0.7);
    expect(e.fill).toBeLessThan(0.9);
    expect(e.cx).toBeGreaterThan(100);
    expect(e.cx).toBeLessThan(130);
  });

  it('measures an eye in every frame except where the light has gone out (the death\'s last five): the thing a sheet is scaled by is really there', () => {
    const without = made.filter(([, img]) => eyeDiameter(img) === null).map(([name]) => name);
    expect(without.sort()).toEqual(handed.has('death') ? [] : ['death_04', 'death_05', 'death_06', 'death_07', 'death_08']);
  });

  it('the eye of a frame is the same however big the picture is: the measurement follows the figure, not the pixels (so it works on a sheet drawn at any size)', () => {
    const idle = frame('idle_00');
    const big = enlarge(idle, 3);
    const e1 = eyeDiameter(idle)!.diameter;
    const e3 = eyeDiameter(big)!.diameter;
    expect(Math.abs(e3 / 3 - e1) / e1).toBeLessThan(0.03);
  });

  it('is not fooled by what is not an eye: a frame of the glowing lines of the armour alone, or an empty one, has none', () => {
    const empty: RgbaImage = { width: 120, height: 120, data: new Uint8Array(120 * 120 * 4) };
    expect(eyeDiameter(empty)).toBeNull();
    // a thin cyan line: glowing, long, no highlight, nothing like an eye
    const line: RgbaImage = { width: 120, height: 120, data: new Uint8Array(120 * 120 * 4) };
    for (let x = 10; x < 110; x++) for (let y = 58; y < 62; y++) line.data.set([120, 220, 240, 255], (y * 120 + x) * 4);
    expect(eyeDiameter(line)).toBeNull();
  });

  it('the body is the torso and head, not the sword: its centre of mass sits where the figure stands, in the idle and in a lunge alike', () => {
    const idle = bodyOf(frame('idle_00'), 3)!;
    expect(idle.cx).toBeGreaterThan(116);
    expect(idle.cx).toBeLessThan(126);
    const lunge = bodyOf(frame('attack1_03'), 3)!;
    const whole = boundsOf(frame('attack1_03'), 128)!;
    // the sword reaches far past the body: the centre of mass is well inside the figure's width, not dragged out to the blade
    expect(lunge.cx).toBeGreaterThan(whole.x0 + 0.35 * (whole.x1 - whole.x0));
    expect(lunge.cx).toBeLessThan(whole.x0 + 0.65 * (whole.x1 - whole.x0));
  });

  it('the head is the biggest circle that fits inside the figure: a disc of 20 to 100 pixels is read within one pixel, an eye-sized hole in it changes nothing, and neither do an antenna or a blade', () => {
    const disc = (d: number, hole: boolean, thin: boolean): RgbaImage => {
      const w = d + 80;
      const h = d + 80;
      const data = new Uint8Array(w * h * 4);
      const cx = w / 2;
      const cy = h / 2;
      const put = (x: number, y: number): void => void data.set([16, 16, 32, 255], (y * w + x) * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > d / 2) continue;
          if (hole && Math.hypot(x + 0.5 - (cx + d / 6), y + 0.5 - cy) <= d / 5) continue;
          put(x, y);
        }
      }
      if (thin) for (let t = 0; t < 40; t++) for (const k of [0, 1]) (put(Math.round(cx + d / 2 + t), Math.round(cy + k)), put(Math.round(cx - d / 2 - t), Math.round(cy + 8 + k)));
      return { width: w, height: h, data };
    };
    for (const d of [20, 41, 60, 100, 101]) {
      for (const [hole, thin] of [[false, false], [true, false], [false, true], [true, true]] as const) {
        expect(Math.abs(headDiameter(disc(d, hole, thin))! - d), `a disc of ${d} px (hole ${hole}, thin parts ${thin})`).toBeLessThan(1);
      }
    }
    expect(headDiameter({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) })).toBeNull();
    // a figure that touches the edge of its picture ends there (a cut-out is trimmed to the figure): the circle is not measured past it
    const corner = new Uint8Array(40 * 40 * 4);
    for (let i = 0; i < 40 * 40; i++) corner[i * 4 + 3] = 255;
    expect(Math.abs(headDiameter({ width: 40, height: 40, data: corner })! - 40)).toBeLessThan(1);
  });

  it('the head is at the size the frames have — the idle 59 px, the fall 45 — and it does not change when the eye goes out: the thing that stays when the head turns away', () => {
    expect(headDiameter(frame('idle_00'))!).toBeGreaterThan(57);
    expect(headDiameter(frame('idle_00'))!).toBeLessThan(61);
    expect(headDiameter(frame('fall_00'))!).toBeGreaterThan(43);
    expect(headDiameter(frame('fall_00'))!).toBeLessThan(47);
    // paint the near eye of the idle out with the dark of the face: the eye is gone, the head is as big as it was
    const idle = frame('idle_00');
    const eye = eyeDiameter(idle)!;
    const dark: RgbaImage = { ...idle, data: new Uint8Array(idle.data) };
    const reach = eye.diameter * 0.9;
    for (let y = 0; y < dark.height; y++) {
      for (let x = 0; x < dark.width; x++) {
        if (Math.hypot(x - eye.cx, y - eye.cy) <= reach && dark.data[(y * dark.width + x) * 4 + 3]! > 0) dark.data.set([16, 16, 32], (y * dark.width + x) * 4);
      }
    }
    const left = eyeDiameter(dark);
    expect(left === null || left.diameter < eye.diameter * 0.6, 'the eye that was painted out is not measured any more').toBe(true);
    expect(Math.abs(headDiameter(dark)! - headDiameter(idle)!)).toBeLessThan(1);
  });

  it('components: pieces within the bridge are one, farther apart are two, and each says how many pixels it has', () => {
    const w = 40;
    const h = 10;
    const mask = new Uint8Array(w * h);
    for (let x = 2; x < 8; x++) mask[5 * w + x] = 1;
    for (let x = 10; x < 14; x++) mask[5 * w + x] = 1; // 2 px gap
    for (let x = 30; x < 35; x++) mask[5 * w + x] = 1; // far
    const apart = components(mask, w, h, 0);
    expect(apart.areas).toEqual([6, 4, 5]);
    const bridged = components(mask, w, h, 2);
    expect(bridged.areas).toEqual([10, 5]);
    expect(bridged.boxes[0]).toEqual({ x0: 2, y0: 5, x1: 13, y1: 5 });
  });
});

describe('the calibration: the frames the game has are far inside every limit of the reception', () => {
  it('no frame has a pale fringe, loose pieces, effect red or foreign colour anywhere near a limit — the thresholds ask for less than they were measured to allow', () => {
    let pale = 0;
    let loose = 0;
    let red = 0;
    let foreign = 0;
    for (const [, img] of made) {
      const c = cleanliness(img);
      pale = Math.max(pale, c.paleEdge);
      loose = Math.max(loose, c.loose);
      red = Math.max(red, c.red);
      foreign = Math.max(foreign, c.foreign);
    }
    // measured: pale ≤ 1.2 %, loose 0 %, red ≤ 0.45 % (the sword's dark-red edge), foreign ≤ 0.07 %
    expect(pale, 'the palest soft edge').toBeLessThan(LIMITS.paleEdge.warn / 3);
    expect(loose, 'the loosest').toBeLessThan(LIMITS.loose.warn / 2);
    expect(red, 'the reddest (a sword frame)').toBeLessThan(LIMITS.red.warn / 2);
    expect(foreign, 'the most foreign').toBeLessThan(LIMITS.foreign.warn / 5);
  });

  it('the head of a clip is steady from frame to frame: within a clip of the game no head strays from the median by more than a tenth (the most, today, is a jump\'s 8.5 %) — and the clips handed over stay inside the tolerance of the reception', () => {
    const byClip = new Map<string, number[]>();
    for (const [name, img] of frames) {
      const clip = name.replace(/_\d+$/, '');
      (byClip.get(clip) ?? byClip.set(clip, []).get(clip)!).push(headDiameter(img)!);
    }
    for (const [clip, heads] of byClip) {
      const sorted = [...heads].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const med = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
      const spread = Math.max(...heads.map((h) => Math.abs(h - med) / med));
      expect(spread, `${clip}: the head strays ${(spread * 100).toFixed(1)} % from its median`).toBeLessThan(handed.has(clip) ? 0.14 : 0.1);
    }
  });
});

/** `src` enlarged by an integer factor (nearest), to stand for a sheet drawn bigger than the frames. */
function enlarge(src: RgbaImage, k: number): RgbaImage {
  const out = new Uint8Array(src.width * k * src.height * k * 4);
  for (let y = 0; y < src.height * k; y++) {
    for (let x = 0; x < src.width * k; x++) {
      const s = (((y / k) | 0) * src.width + ((x / k) | 0)) * 4;
      out.set(src.data.subarray(s, s + 4), (y * src.width * k + x) * 4);
    }
  }
  return { width: src.width * k, height: src.height * k, data: out };
}
