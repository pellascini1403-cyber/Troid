import type { GraphicsContext } from 'pixi.js';
import type { RampName, RigAssets, SilhouetteOp } from './assets';
import { contourSegments, ellipsePoly, rimBands, sampleContour, type ContourOptions, type Pt } from './geometry';

/** The light that falls on every creature: from above and from BEHIND it (x is forward), the way a cave glows behind its dark things. */
export const LIGHT_UP: Pt = [-0.42, 0.9];
/** The reflected light that comes up from the floor. */
export const LIGHT_DOWN: Pt = [0.25, -1];

export interface RimLight {
  color: number;
  /** Direction the light comes from (default: from above and behind). */
  dir?: Pt;
  /** The widest the lit band gets, cm. */
  width: number;
  power?: number;
  alpha?: number;
  cut?: number;
}

export interface GlossLens {
  at: Pt;
  rx: number;
  ry: number;
  rot?: number;
  color: number;
  alpha: number;
}

/** How a surface looks: its body colour (shaded by a ramp that is tinted with it), the edge line, the light along its edge and the lenses of gloss on it. */
export interface Material {
  fill: number;
  ramp?: RampName;
  alpha?: number;
  /** A thin dark line round the shape: for pale materials, which would melt into the background without it. */
  edge?: { color: number; width: number; alpha?: number };
  rims?: readonly RimLight[];
  gloss?: readonly GlossLens[];
}

/** Draws in the authoring space (cm, y up) onto a Pixi graphics context, which is y down. */
export class Pen {
  constructor(
    readonly ctx: GraphicsContext,
    private readonly assets: RigAssets,
    /** Where the silhouette is written down while a shape is drawn (what the hit flash repaints in white). */
    private readonly rec?: SilhouetteOp[],
  ) {}

  /** Adds a path to the silhouette of the shape being drawn (`shape` already adds its own outline): for what is part of the body but is drawn by hand — a horn, a claw. */
  sil(op: SilhouetteOp): this {
    this.rec?.push(op);
    return this;
  }

  /** A smooth outline through `pts` (the path only: fill it yourself, or use `shape`). */
  contour(pts: readonly Pt[], o: ContourOptions = {}): this {
    const segs = contourSegments(pts, o);
    this.ctx.moveTo(pts[0]![0], -pts[0]![1]);
    for (const s of segs) this.ctx.bezierCurveTo(s[0], -s[1], s[2], -s[3], s[4], -s[5]);
    if (o.closed ?? true) this.ctx.closePath();
    return this;
  }

  /** A polygon from a flat list of x, y pairs. */
  poly(flat: readonly number[], close = true): this {
    const out: number[] = [];
    for (let i = 0; i < flat.length; i += 2) out.push(flat[i]!, -flat[i + 1]!);
    this.ctx.poly(out, close);
    return this;
  }

  /** Straight-edged polygon from points. */
  hard(pts: readonly Pt[]): this {
    return this.poly(pts.flatMap((p) => [p[0], p[1]]));
  }

  ellipse(cx: number, cy: number, rx: number, ry: number): this {
    this.ctx.ellipse(cx, -cy, rx, ry);
    return this;
  }

  circle(cx: number, cy: number, r: number): this {
    this.ctx.circle(cx, -cy, r);
    return this;
  }

  /** An arc of the circle at `(cx, cy)`, from angle `a0` to `a1` (counter-clockwise, radians, y up). Stroke it. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number): this {
    this.ctx.moveTo(cx + Math.cos(a0) * r, -(cy + Math.sin(a0) * r));
    this.ctx.arc(cx, -cy, r, -a0, -a1, true);
    return this;
  }

  line(a: Pt, b: Pt): this {
    this.ctx.moveTo(a[0], -a[1]);
    this.ctx.lineTo(b[0], -b[1]);
    return this;
  }

  fill(color: number, alpha = 1): this {
    this.ctx.fill({ color, alpha });
    return this;
  }

  /** Fills the path with a ramp (a grey picture of the volume), tinted by `color`. */
  fillRamp(ramp: RampName, color: number, alpha = 1): this {
    this.ctx.fill({ texture: this.assets.ramp(ramp), color, alpha, textureSpace: 'local' });
    return this;
  }

  stroke(color: number, width: number, alpha = 1): this {
    this.ctx.stroke({ color, width, alpha, join: 'round', cap: 'round' });
    return this;
  }

  /**
   * A whole surface in one go: the shape filled with its material, an edge line, the thin light along the lit edges, and the lenses of gloss. `detail` draws what only this shape has (plates, cracks, studs) on top.
   * The light is computed from the outline, so every body is lit the same way whatever its shape.
   */
  shape(pts: readonly Pt[], m: Material, o: ContourOptions = {}, detail?: (pen: Pen) => void): this {
    this.rec?.push((pen) => pen.contour(pts, o));
    this.contour(pts, o);
    if (m.ramp && m.ramp !== 'flat') this.fillRamp(m.ramp, m.fill, m.alpha ?? 1);
    else this.fill(m.fill, m.alpha ?? 1);
    if (m.edge) {
      this.contour(pts, o);
      this.stroke(m.edge.color, m.edge.width, m.edge.alpha ?? 1);
    }
    if (m.rims?.length) {
      const poly = sampleContour(pts, o, 7);
      for (const r of m.rims) {
        for (const band of rimBands(poly, { dir: r.dir ?? LIGHT_UP, width: r.width, ...(r.power !== undefined ? { power: r.power } : {}), ...(r.cut !== undefined ? { cut: r.cut } : {}) })) {
          this.poly(band).fill(r.color, r.alpha ?? 1);
        }
      }
    }
    for (const g of m.gloss ?? []) this.poly(ellipsePoly(g.at[0], g.at[1], g.rx, g.ry, g.rot ?? 0)).fill(g.color, g.alpha);
    detail?.(this);
    return this;
  }
}
