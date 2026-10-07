import { Graphics, type Container } from 'pixi.js';
import type { Rect } from '@/core/math';
import { Rng } from '@/core/rng';
import { layerSpan, PARALLAX_FACTOR } from '@/presentation/environment';
import { PALETTE } from '@/presentation/palette';
import { viewY } from '@/presentation/worldTransform';
import type { Layers } from './layers';

export { layerSpan };

/**
 * PROVISIONAL scenery (docs/MIGRATION-2D.md S10: "capas de fondo provisionales"): layers of flat silhouettes behind and in
 * front of the action, so a room has depth and the dark hero has something lighter to read against (docs/GAME-SPEC-2D.md
 * §3.3, risk R14: light BEHIND, darkness in FRONT). It is not the art: it is made of rectangles and ellipses from a seeded
 * generator (the same room always looks the same), one `Graphics` per layer, and it never touches collision.
 *
 * Each layer is a child of a parallax container (`PARALLAX_FACTOR`), so its content is authored in the layer's own
 * coordinates: a layer with factor f scrolls at f × the camera, which means it has to span `f × (room width)` plus the
 * visible width on both sides — NOT the room's width.
 */
export interface BackdropOptions {
  /** The room's extents (the camera range). */
  bounds: Rect;
  seed: number;
}

/** The generators place elements until they pass the end of the span by this much (the largest gap between two of them), so the span is always FILLED to its end. */
const OVERRUN = 18;

type BackdropBuilder = (layers: Layers, opts: BackdropOptions) => Graphics[];

/** «Ancient Forest Ruins»: a pale haze far away, trunks, broken stone pillars, and dark vines hanging in front. */
const ruins: BackdropBuilder = (layers, { bounds, seed }) => {
  const rng = new Rng(seed);
  const made: Graphics[] = [];
  const add = (parent: Container, g: Graphics): Graphics => {
    parent.addChild(g);
    made.push(g);
    return g;
  };
  const rect = (g: Graphics, x: number, base: number, w: number, h: number): Graphics => g.rect(x, viewY(base + h), w, h);

  // ---- far: a moonlit haze behind everything, and a low ridge ----
  {
    const f = PARALLAX_FACTOR.backdropFar;
    const { x0, x1 } = layerSpan(bounds, f);
    const g = add(layers.backdropFar, new Graphics());
    g.label = 'backdrop:far';
    const cx = (x0 + x1) / 2 + 5;
    for (let i = 0; i < 7; i++) g.ellipse(cx, viewY(7.5), 17 - i * 2.1, 11 - i * 1.4).fill({ color: PALETTE.worldGlow, alpha: 0.035 });
    // a ridge: heights wander, never above ≈ 4.5 m
    g.moveTo(x0, viewY(-6));
    let h = 2.5;
    for (let x = x0; x <= x1 + OVERRUN; x += 2.5) {
      h = Math.min(4.5, Math.max(1.2, h + rng.range(-0.8, 0.8)));
      g.lineTo(x, viewY(h));
    }
    g.lineTo(x1 + OVERRUN, viewY(-6)).closePath().fill({ color: PALETTE.worldDeep, alpha: 0.55 });
  }

  // ---- mid: tree trunks with a crown of dark leaves, in two shades ----
  {
    const f = PARALLAX_FACTOR.backdropMid;
    const { x0, x1 } = layerSpan(bounds, f);
    const g = add(layers.backdropMid, new Graphics());
    g.label = 'backdrop:mid';
    for (let x = x0; x < x1 + OVERRUN; x += rng.range(2.6, 6.5)) {
      const w = rng.range(0.5, 1.5);
      const top = rng.range(11, 17);
      const shade = rng.chance(0.5) ? PALETTE.worldNight : PALETTE.worldVoid;
      const alpha = rng.range(0.55, 0.78);
      rect(g, x, -5, w, top + 5).fill({ color: shade, alpha });
      if (rng.chance(0.6)) g.ellipse(x + w / 2, viewY(top), rng.range(1.8, 3.4), rng.range(1.1, 2)).fill({ color: shade, alpha: alpha * 0.8 });
    }
  }

  // ---- near: ruined stone pillars, some broken in steps, a few joined by an arch ----
  {
    const f = PARALLAX_FACTOR.backdropNear;
    const { x0, x1 } = layerSpan(bounds, f);
    const g = add(layers.backdropNear, new Graphics());
    g.label = 'backdrop:near';
    for (let x = x0; x < x1 + OVERRUN; ) {
      const w = rng.range(1.3, 2.2);
      const height = rng.range(5.5, 11);
      const color = PALETTE.worldNight;
      rect(g, x, -5, w, height + 5).fill({ color, alpha: 0.88 });
      // a broken top: one or two steps down
      rect(g, x - 0.15, height - 0.6, w + 0.3, 0.6).fill({ color: PALETTE.worldVoid, alpha: 0.9 });
      if (rng.chance(0.5)) rect(g, x + w * 0.5, height, w * 0.5, rng.range(0.5, 1.5)).fill({ color, alpha: 0.88 });
      const gap = rng.range(7, 16);
      if (rng.chance(0.3) && gap < 11) {
        // an arch to the next pillar
        const ax = x + w;
        g.rect(ax, viewY(height), gap, 0.7).fill({ color, alpha: 0.88 });
      }
      x += w + gap;
    }
  }

  // ---- foreground: vines hanging from the top of the screen (never over the hero's band) ----
  {
    const f = PARALLAX_FACTOR.foreground;
    const { x0, x1 } = layerSpan(bounds, f);
    const g = add(layers.foreground, new Graphics());
    g.label = 'backdrop:front';
    for (let x = x0; x < x1 + OVERRUN; x += rng.range(5, 14)) {
      const len = rng.range(1.2, 3.2);
      const top = 9.5;
      const w = rng.range(0.12, 0.3);
      rect(g, x, top - len, w, len).fill({ color: PALETTE.worldVoid, alpha: 0.9 });
      g.ellipse(x + w / 2, viewY(top - len), rng.range(0.25, 0.5), rng.range(0.4, 0.9)).fill({ color: PALETTE.worldVoid, alpha: 0.9 });
    }
  }
  return made;
};

const BUILDERS: Readonly<Record<string, BackdropBuilder>> = { ruins };

/** Draws the named backdrop into the parallax layers. Returns what it made, so the caller can destroy it. Unknown id: nothing. */
export function buildBackdrop(id: string, layers: Layers, opts: BackdropOptions): Graphics[] {
  return BUILDERS[id]?.(layers, opts) ?? [];
}

export function backdropIds(): string[] {
  return Object.keys(BUILDERS);
}
