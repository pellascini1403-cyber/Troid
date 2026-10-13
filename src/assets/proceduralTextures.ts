import { Texture } from 'pixi.js';

/**
 * Textures generated at start-up with a 2D canvas. No art dependency: glows, sparks, gradients and the abstract
 * placeholder frames all come from here, which also keeps every test and benchmark independent of real assets.
 * VIEW layer (needs `document`).
 */
export function createCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  return { canvas, ctx };
}

export function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): Texture {
  const { canvas, ctx } = createCanvas(width, height);
  draw(ctx, canvas.width, canvas.height);
  return Texture.from(canvas);
}

const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Top → bottom linear gradient (placeholder sky). */
export function verticalGradientTexture(top: number, bottom: number, height = 256): Texture {
  return canvasTexture(2, height, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, css(top));
    g.addColorStop(1, css(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** White radial falloff: tint it for glows, light pools and soft particles. */
export function softGlowTexture(size = 128): Texture {
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Small hard-edged diamond, for sparks and shards. */
export function sparkTexture(size = 32): Texture {
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w * 0.78, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(w * 0.22, h / 2);
    ctx.closePath();
    ctx.fill();
  });
}

/**
 * A WHITE square whose alpha is `alphaAt(d)`, where `d` is the distance from its middle in the units where the middle of an edge is 1 (a corner is √2): stretched over the screen it is a vignette, and tinted it
 * takes the hue of the room. Made pixel by pixel from the function, so what the contract measures is exactly what is drawn.
 */
export function vignetteTexture(alphaAt: (d: number) => number, size = 128): Texture {
  return canvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const cx = (w - 1) / 2;
    const cy = (h - 1) / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2));
        const i = (y * w + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(Math.min(1, Math.max(0, alphaAt(d))) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}
