import { Rectangle, Texture } from 'pixi.js';
import type { VfxShape } from '@/presentation/vfx';
import { createCanvas } from './proceduralTextures';

/**
 * The VFX atlas: every effect shape drawn in WHITE with a 2D canvas, so the whole VFX layer needs one texture (one
 * batch per blend mode) and no art. The colour comes from the palette slot at runtime (tint). VIEW layer.
 */
export interface VfxAtlas {
  readonly frames: Readonly<Record<VfxShape, Texture>>;
  /** Frame width in pixels: a sprite of `w` metres is scaled by `w / widthPx[shape]`. */
  readonly widthPx: Readonly<Record<VfxShape, number>>;
  readonly source: Texture;
  destroy(): void;
}

interface Cell {
  shape: VfxShape;
  w: number;
  h: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function radial(ctx: CanvasRenderingContext2D, w: number, h: number, stops: Array<[number, number]>): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const CELLS: readonly Cell[] = [
  // soft round light: glows, motes, impact flashes
  { shape: 'glow', w: 96, h: 96, draw: (c, w, h) => radial(c, w, h, [[0, 1], [0.25, 0.7], [0.6, 0.18], [1, 0]]) },
  // four-point star: a bright core with four thin points
  {
    shape: 'spark', w: 48, h: 48,
    draw: (c, w, h) => {
      radial(c, w, h, [[0, 1], [0.2, 0.55], [0.5, 0]]);
      c.fillStyle = '#fff';
      for (const [rx, ry] of [[w / 2, 3], [3, h / 2]] as const) {
        c.beginPath();
        c.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
        c.fill();
      }
    },
  },
  // elongated pointed diamond, drawn along +x so `align` can turn it along the velocity
  {
    shape: 'shard', w: 96, h: 32,
    draw: (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, h / 2);
      c.lineTo(w * 0.62, h * 0.18);
      c.lineTo(w, h / 2);
      c.lineTo(w * 0.62, h * 0.82);
      c.closePath();
      c.fill();
    },
  },
  // thin soft ring
  {
    shape: 'ring', w: 128, h: 128,
    draw: (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.85, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    },
  },
  // a wide, low-contrast cloud: smoke and dust
  { shape: 'dust', w: 96, h: 96, draw: (c, w, h) => radial(c, w, h, [[0, 0.8], [0.45, 0.45], [0.8, 0.1], [1, 0]]) },
  // a round blob with a firm edge: ink droplets
  { shape: 'ink', w: 64, h: 64, draw: (c, w, h) => radial(c, w, h, [[0, 1], [0.7, 1], [0.88, 0.55], [1, 0]]) },
  // a horizontal capsule that fades at both ends: dash streaks
  {
    shape: 'streak', w: 192, h: 48,
    draw: (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.75, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(w / 2, h / 2, w / 2, h * 0.22, 0, 0, Math.PI * 2);
      c.fill();
      radial(c, w, h, [[0, 0.5], [0.5, 0]]);
    },
  },
  // a crescent bowing to +x: the sword slash. An ellipse with another carved out of its left side: thick at the bow,
  // pointed at the top and bottom tips, brighter on the outer edge. (Glow comes from a bigger translucent copy.)
  {
    shape: 'arc', w: 256, h: 192,
    draw: (c, w, h) => {
      c.save();
      const g = c.createLinearGradient(70, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.1)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(104, h / 2, 148, 92, 0, 0, Math.PI * 2);
      c.fill();
      // erase with an OPAQUE source: destination-out removes in proportion to the source alpha
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.beginPath();
      c.ellipse(62, h / 2, 150, 94, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    },
  },
];

/** Shelf-packs the shapes into one canvas and slices a `Texture` per shape. */
export function createVfxAtlas(): VfxAtlas {
  const pad = 2;
  const width = 512;
  let x = pad;
  let y = pad;
  let rowH = 0;
  const placed: Array<{ cell: Cell; x: number; y: number }> = [];
  for (const cell of CELLS) {
    if (x + cell.w + pad > width) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    placed.push({ cell, x, y });
    x += cell.w + pad;
    rowH = Math.max(rowH, cell.h);
  }
  const height = y + rowH + pad;
  const { canvas, ctx } = createCanvas(width, height);
  for (const { cell, x: px, y: py } of placed) {
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.rect(0, 0, cell.w, cell.h);
    ctx.clip();
    cell.draw(ctx, cell.w, cell.h);
    ctx.restore();
  }
  const source = Texture.from(canvas);
  const frames = {} as Record<VfxShape, Texture>;
  const widthPx = {} as Record<VfxShape, number>;
  for (const { cell, x: px, y: py } of placed) {
    frames[cell.shape] = new Texture({ source: source.source, frame: new Rectangle(px, py, cell.w, cell.h) });
    widthPx[cell.shape] = cell.w;
  }
  return {
    frames,
    widthPx,
    source,
    destroy: () => {
      for (const t of Object.values(frames)) t.destroy(false);
      source.destroy(true);
    },
  };
}
