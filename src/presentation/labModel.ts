import type { SpriteSetDefinition } from './SpriteSetDefinition';

/**
 * THE MATHS OF THE PLAYER LAB (`?lab=player`, docs/ART-PIPELINE-2D.md part G): which frame of a clip is on screen, and where the picture sits in metres. PURE — no
 * Pixi, no DOM — so that what the lab shows is tested without a GPU, and so that the numbers it shows (the canvas, the visible part, the frame) are the same ones
 * anything else would compute.
 */

/**
 * A clip played by hand: play, pause, step a frame at a time, change the speed. Unlike the game's animator — which is driven by the simulation — this one is driven
 * by a person looking at the art, so it can stop on any frame and walk through them one by one.
 */
export class ClipTimeline {
  playing = true;
  speed = 1;
  private t = 0;

  constructor(
    readonly count: number,
    readonly fps: number,
    readonly loops: boolean,
  ) {}

  /** The frame on screen. */
  get index(): number {
    if (this.count <= 1 || !(this.fps > 0)) return 0;
    const i = Math.floor(this.t * this.fps + 1e-9);
    return this.loops ? i % this.count : Math.min(i, this.count - 1);
  }

  /** Plays on from the frame it stands on — or from the first one when a clip that plays once has already reached its end (pressing play on a finished clip plays it again). */
  play(): void {
    this.playing = true;
    if (this.finished) this.t = 0;
  }

  /** `dt` real seconds. Does nothing while paused. */
  advance(dt: number): void {
    if (!this.playing || !(dt > 0)) return;
    this.t += dt * this.speed;
    // a loop only needs the time inside one turn; a clip that plays once stops where it ends
    if (this.loops && this.count > 0 && this.fps > 0) this.t %= this.count / this.fps;
    else if (this.fps > 0) this.t = Math.min(this.t, this.count / this.fps);
  }

  /** Pauses and moves `delta` whole frames, wrapping around the clip (the way a person looks through it). */
  step(delta: number): void {
    this.playing = false;
    this.seek(this.index + delta);
  }

  /** Pauses on the frame `i` (wrapped into the clip). */
  seek(i: number): void {
    const n = Math.max(1, this.count);
    const frame = ((Math.round(i) % n) + n) % n;
    this.t = this.fps > 0 ? (frame + 0.5) / this.fps : 0;
    this.playing = false;
  }

  restart(): void {
    this.t = 0;
  }

  get finished(): boolean {
    return !this.loops && this.count > 0 && this.index >= this.count - 1 && this.fps > 0 && this.t >= (this.count - 1) / this.fps;
  }
}

/** A rectangle in METRES from the feet, +x forward, +y UP. */
export interface MetreRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What drawing a picture of `w × h` art pixels does to the world: the metres each pixel covers, with the visual scale, about the feet pivot. */
export function metresPerArtPixel(def: Pick<SpriteSetDefinition, 'artPxPerMeter' | 'visualScale'>): number {
  return (def.visualScale ?? 1) / def.artPxPerMeter;
}

/** The whole (untrimmed) canvas of a frame, in metres from the feet: the rectangle the pivot is a fraction of. */
export function canvasRect(def: Pick<SpriteSetDefinition, 'pivot' | 'artPxPerMeter' | 'visualScale'>, width: number, height: number): MetreRect {
  const m = metresPerArtPixel(def);
  return { x0: -def.pivot[0] * width * m, x1: (1 - def.pivot[0]) * width * m, y0: -(1 - def.pivot[1]) * height * m, y1: def.pivot[1] * height * m };
}

/** The part of the canvas that was kept when the frame was trimmed (`trim`: where those pixels sit in the original), in metres from the feet. Without a trim, the canvas. */
export function visibleRect(def: Pick<SpriteSetDefinition, 'pivot' | 'artPxPerMeter' | 'visualScale'>, orig: { width: number; height: number }, trim: { x: number; y: number; width: number; height: number } | null): MetreRect {
  const canvas = canvasRect(def, orig.width, orig.height);
  if (!trim) return canvas;
  const m = metresPerArtPixel(def);
  const x0 = canvas.x0 + trim.x * m;
  const y1 = canvas.y1 - trim.y * m;
  return { x0, x1: x0 + trim.width * m, y1, y0: y1 - trim.height * m };
}

export const rectWidth = (r: MetreRect): number => r.x1 - r.x0;
export const rectHeight = (r: MetreRect): number => r.y1 - r.y0;
