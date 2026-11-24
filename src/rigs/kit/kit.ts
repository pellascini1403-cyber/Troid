import { Container, Graphics, GraphicsContext, Mesh, MeshGeometry, Sprite } from 'pixi.js';
import type { RampName, RigAssets, ShapeEntry } from './assets';
import type { Pt } from './geometry';
import { LIGHT_UP, Pen } from './paint';

/** Anything that can be flashed white-hot when the creature is hit. */
export interface Flashable {
  setFlash(a: number): void;
}

/** Puts a part where it goes: `(x, y)` in cm with y UP, turned `rot` radians counter-clockwise, scaled. (Pixi's y is down and its rotation clockwise: the flip is done here, once.) */
export function place(node: Container, x: number, y: number, rot = 0, sx = 1, sy = sx): void {
  node.position.set(x, -y);
  node.rotation = -rot;
  node.scale.set(sx, sy);
}

/** A drawn piece of a creature: a static shape (its geometry is shared by every creature that draws it) that can flash white. Put it where it goes with `place`. */
export class Part extends Container implements Flashable {
  private flashG: Graphics | null = null;
  constructor(
    private readonly entry: ShapeEntry,
    private readonly assets: RigAssets,
    label: string,
  ) {
    super({ label });
    this.addChild(new Graphics(this.entry.ctx));
  }

  setFlash(a: number): void {
    if (a <= 0.004) {
      if (this.flashG) this.flashG.visible = false;
      return;
    }
    if (!this.flashG) {
      // the white-hot silhouette is only built the first time somebody of this species is hit, and shared after that
      if (!this.entry.flash) {
        const ctx = new GraphicsContext();
        const pen = new Pen(ctx, this.assets);
        for (const op of this.entry.silhouette) {
          op(pen);
          pen.fill(0xffffff);
        }
        this.entry.flash = ctx;
      }
      this.flashG = new Graphics(this.entry.flash);
      this.flashG.blendMode = 'add';
      this.addChild(this.flashG);
    }
    this.flashG.visible = true;
    this.flashG.alpha = Math.min(1, a);
  }
}

// ---------------------------------------------------------------------------------------------------------- ribbons

export interface RibbonSpec {
  /** Points of every spine (≥ 2). */
  n: number;
  /** How many strips the one mesh holds (default 1): the eight legs of a spider are one ribbon of eight lines. */
  count?: number;
  /** Width at `u` ∈ [0, 1] from the root to the tip of line `line`, cm. */
  width: (u: number, line: number) => number;
  color: number;
  /** The grey ramp that shades its width (default `tube`). */
  ramp?: RampName;
  alpha?: number;
  /** A darker band round it, `grow` cm wider on each side. */
  edge?: { color: number; grow: number };
  /** A thin light on the side that faces the light. */
  rim?: { color: number; width: number; alpha?: number };
  light?: Pt;
}

/**
 * Strips of surface that follow spines every frame: a tail, a tentacle, a leg that bends, the body of an eel, the bone of a wing. The width is a function along the length, and the shading is worked out per point from where it
 * faces — so a tentacle that curls round keeps its light on top. Several strips can share one mesh (`count`), which is how a creature with eight legs costs one. Two triangles per segment; no new geometry after the first frame.
 */
export class Ribbon extends Container implements Flashable {
  private readonly spec: RibbonSpec;
  private readonly count: number;
  private readonly body: Mesh;
  private readonly under: Mesh | null;
  private readonly rim: Mesh | null;
  private flashM: Mesh | null = null;
  private readonly geo: MeshGeometry;
  private readonly underGeo: MeshGeometry | null;
  private readonly rimGeo: MeshGeometry | null;
  private readonly light: Pt;

  constructor(
    private readonly assets: RigAssets,
    spec: RibbonSpec,
    label = 'ribbon',
  ) {
    super({ label });
    this.spec = spec;
    this.count = spec.count ?? 1;
    const n = spec.n;
    const ramp = assets.ramp(spec.ramp ?? 'tube');
    const L = spec.light ?? LIGHT_UP;
    const ll = Math.hypot(L[0], L[1]) || 1;
    this.light = [L[0] / ll, L[1] / ll];
    const strip = (): MeshGeometry => {
      const indices = new Uint32Array((n - 1) * 6 * this.count);
      let q = 0;
      for (let l = 0; l < this.count; l++) {
        for (let i = 0; i < n - 1; i++) {
          const a = (l * n + i) * 2;
          indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], q);
          q += 6;
        }
      }
      return new MeshGeometry({ positions: new Float32Array(n * 4 * this.count), uvs: new Float32Array(n * 4 * this.count), indices });
    };
    this.geo = strip();
    this.underGeo = spec.edge ? strip() : null;
    this.rimGeo = spec.rim ? strip() : null;
    if (this.underGeo) {
      this.under = new Mesh({ geometry: this.underGeo, texture: assets.ramp('flat') });
      this.under.tint = spec.edge!.color;
      this.addChild(this.under);
    } else this.under = null;
    this.body = new Mesh({ geometry: this.geo, texture: ramp });
    this.body.tint = spec.color;
    if (spec.alpha !== undefined) this.body.alpha = spec.alpha;
    this.addChild(this.body);
    if (this.rimGeo) {
      this.rim = new Mesh({ geometry: this.rimGeo, texture: assets.ramp('flat') });
      this.rim.tint = spec.rim!.color;
      this.rim.alpha = spec.rim!.alpha ?? 1;
      this.addChild(this.rim);
    } else this.rim = null;
  }

  /** Lays strip `line` along `pts` (authoring space: cm, y up), root first. Call `commit` after the last one. A strip that is not needed this frame can be hidden by giving it zero width points (`hideLine`). */
  setLine(line: number, pts: readonly Pt[]): void {
    const n = this.spec.n;
    const pos = this.geo.positions;
    const uv = this.geo.uvs;
    const up = this.underGeo?.positions;
    const rp = this.rimGeo?.positions;
    const grow = this.spec.edge?.grow ?? 0;
    const rimW = this.spec.rim?.width ?? 0;
    const lx = this.light[0];
    const ly = this.light[1];
    const last = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const p = pts[Math.min(i, last)]!;
      const a = pts[Math.max(0, Math.min(last, i - 1))]!;
      const b = pts[Math.max(0, Math.min(last, i + 1))]!;
      let dx = b[0] - a[0];
      let dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      // the left-hand normal (y up)
      const nx = -dy;
      const ny = dx;
      const u = n > 1 ? i / (n - 1) : 0;
      const hw = this.spec.width(u, line) / 2;
      const o = (line * n + i) * 4;
      // left vertex, then right vertex (Pixi's y is down: y is negated here)
      pos[o] = p[0] + nx * hw;
      pos[o + 1] = -(p[1] + ny * hw);
      pos[o + 2] = p[0] - nx * hw;
      pos[o + 3] = -(p[1] - ny * hw);
      // shade by facing: the side whose normal faces the light is the bright one
      const d = nx * lx + ny * ly;
      uv[o] = u;
      uv[o + 1] = 0.5 - 0.5 * d;
      uv[o + 2] = u;
      uv[o + 3] = 0.5 + 0.5 * d;
      if (up) {
        up[o] = p[0] + nx * (hw + grow);
        up[o + 1] = -(p[1] + ny * (hw + grow));
        up[o + 2] = p[0] - nx * (hw + grow);
        up[o + 3] = -(p[1] - ny * (hw + grow));
      }
      if (rp) {
        const s = d >= 0 ? 1 : -1;
        const t = Math.min(rimW, hw) * Math.abs(d) ** 1.4;
        // the outer edge sits on the lit side of the strip, the inner one a sliver in
        rp[o] = p[0] + nx * s * hw;
        rp[o + 1] = -(p[1] + ny * s * hw);
        rp[o + 2] = p[0] + nx * s * (hw - t);
        rp[o + 3] = -(p[1] + ny * s * (hw - t));
      }
    }
  }

  /** Squashes a strip to nothing (a leg that is not out, a thread that has snapped). */
  hideLine(line: number): void {
    const n = this.spec.n;
    for (const g of [this.geo, this.underGeo, this.rimGeo]) {
      if (!g) continue;
      const pos = g.positions;
      const o = line * n * 4;
      for (let k = 0; k < n * 4; k += 2) {
        pos[o + k] = 0;
        pos[o + k + 1] = 0;
      }
    }
  }

  /** Sends what the lines wrote to the GPU. */
  commit(): void {
    this.geo.getBuffer('aPosition').update();
    this.geo.getBuffer('aUV').update();
    this.underGeo?.getBuffer('aPosition').update();
    this.rimGeo?.getBuffer('aPosition').update();
  }

  /** The common case: a ribbon of one line. */
  setSpine(pts: readonly Pt[]): void {
    this.setLine(0, pts);
    this.commit();
  }

  setFlash(a: number): void {
    if (a <= 0.004) {
      if (this.flashM) this.flashM.visible = false;
      return;
    }
    if (!this.flashM) {
      this.flashM = new Mesh({ geometry: this.geo, texture: this.assets.ramp('flat') });
      this.flashM.tint = 0xffffff;
      this.flashM.blendMode = 'add';
      this.addChild(this.flashM);
    }
    this.flashM.visible = true;
    this.flashM.alpha = Math.min(1, a);
  }
}

// ------------------------------------------------------------------------------------------------------------ patch

export interface PatchSpec {
  /** Points of the outline (≥ 3). */
  n: number;
  color: number;
  /** The ramp the surface is shaded with: `fade` makes it thin away toward its edge (a membrane), `vert` shades it from top to bottom. */
  ramp?: RampName;
  alpha?: number;
  /** Where on the ramp (0 … 1) the outline sits: 1 is the very end of it (for `fade`, nothing), 0.6 keeps a membrane visible to its rim. Default 0.65. */
  edgeV?: number;
}

/**
 * A flat piece of surface bounded by a polygon the species moves every frame — the membrane of a wing, a flap of hide, a sail. Drawn as a fan from the middle of the outline; the texture runs from 0 at the middle to 1 at the edge,
 * so a `fade` ramp makes it translucent toward the rim.
 */
export class Patch extends Container implements Flashable {
  private readonly geo: MeshGeometry;
  private readonly mesh: Mesh;
  private flashM: Mesh | null = null;
  readonly n: number;

  constructor(
    private readonly assets: RigAssets,
    spec: PatchSpec,
    label = 'patch',
  ) {
    super({ label });
    this.n = spec.n;
    const n = spec.n;
    const uvs = new Float32Array((n + 1) * 2);
    // vertex 0 is the middle (v = 0); the others are the rim
    for (let i = 0; i < n; i++) {
      uvs[(i + 1) * 2] = i / n;
      uvs[(i + 1) * 2 + 1] = spec.edgeV ?? 0.65;
    }
    const indices = new Uint32Array(n * 3);
    for (let i = 0; i < n; i++) indices.set([0, 1 + i, 1 + ((i + 1) % n)], i * 3);
    this.geo = new MeshGeometry({ positions: new Float32Array((n + 1) * 2), uvs, indices });
    this.mesh = new Mesh({ geometry: this.geo, texture: assets.ramp(spec.ramp ?? 'fade') });
    this.mesh.tint = spec.color;
    if (spec.alpha !== undefined) this.mesh.alpha = spec.alpha;
    this.addChild(this.mesh);
  }

  /** The outline (authoring space: cm, y up), in order; the middle is where the fan starts (default: the average of the points). */
  setPolygon(pts: readonly Pt[], centre?: Pt): void {
    const pos = this.geo.positions;
    let cx = 0;
    let cy = 0;
    if (centre) {
      cx = centre[0];
      cy = centre[1];
    } else {
      for (const p of pts) {
        cx += p[0];
        cy += p[1];
      }
      cx /= pts.length;
      cy /= pts.length;
    }
    pos[0] = cx;
    pos[1] = -cy;
    for (let i = 0; i < this.n; i++) {
      const p = pts[Math.min(i, pts.length - 1)]!;
      pos[(i + 1) * 2] = p[0];
      pos[(i + 1) * 2 + 1] = -p[1];
    }
    this.geo.getBuffer('aPosition').update();
  }

  setFlash(a: number): void {
    if (a <= 0.004) {
      if (this.flashM) this.flashM.visible = false;
      return;
    }
    if (!this.flashM) {
      this.flashM = new Mesh({ geometry: this.geo, texture: this.assets.ramp('flat') });
      this.flashM.tint = 0xffffff;
      this.flashM.blendMode = 'add';
      this.addChild(this.flashM);
    }
    this.flashM.visible = true;
    this.flashM.alpha = Math.min(1, a);
  }
}

// ------------------------------------------------------------------------------------------------------------ cloth

export interface ClothSpec {
  /** Points across and down (cells + 1 of each are drawn). */
  cols: number;
  rows: number;
  color: number;
  ramp?: RampName;
  alpha?: number;
}

/**
 * A sheet of surface on a grid whose points the species moves every frame: a veil, a wing's membrane, a hanging cloak. The texture runs across (`u`) and down (`v`), so a ramp that fades with `v` makes a hem that dissolves.
 */
export class Cloth extends Container implements Flashable {
  private readonly geo: MeshGeometry;
  private readonly mesh: Mesh;
  private flashM: Mesh | null = null;
  readonly cols: number;
  readonly rows: number;

  constructor(
    private readonly assets: RigAssets,
    spec: ClothSpec,
    label = 'cloth',
  ) {
    super({ label });
    this.cols = spec.cols;
    this.rows = spec.rows;
    const vx = spec.cols + 1;
    const vy = spec.rows + 1;
    const uvs = new Float32Array(vx * vy * 2);
    for (let j = 0; j < vy; j++) {
      for (let i = 0; i < vx; i++) {
        const k = (j * vx + i) * 2;
        uvs[k] = i / spec.cols;
        uvs[k + 1] = j / spec.rows;
      }
    }
    const indices = new Uint32Array(spec.cols * spec.rows * 6);
    let q = 0;
    for (let j = 0; j < spec.rows; j++) {
      for (let i = 0; i < spec.cols; i++) {
        const a = j * vx + i;
        const b = a + 1;
        const c = a + vx;
        const d = c + 1;
        indices.set([a, b, c, b, d, c], q);
        q += 6;
      }
    }
    this.geo = new MeshGeometry({ positions: new Float32Array(vx * vy * 2), uvs, indices });
    this.mesh = new Mesh({ geometry: this.geo, texture: assets.ramp(spec.ramp ?? 'vert') });
    this.mesh.tint = spec.color;
    if (spec.alpha !== undefined) this.mesh.alpha = spec.alpha;
    this.addChild(this.mesh);
  }

  /** `at(i, j)` returns the point (authoring space: cm, y up) of column `i` ∈ [0, cols], row `j` ∈ [0, rows]. */
  setPoints(at: (i: number, j: number) => Pt): void {
    const vx = this.cols + 1;
    const pos = this.geo.positions;
    for (let j = 0; j <= this.rows; j++) {
      for (let i = 0; i < vx; i++) {
        const p = at(i, j);
        const k = (j * vx + i) * 2;
        pos[k] = p[0];
        pos[k + 1] = -p[1];
      }
    }
    this.geo.getBuffer('aPosition').update();
  }

  setFlash(a: number): void {
    if (a <= 0.004) {
      if (this.flashM) this.flashM.visible = false;
      return;
    }
    if (!this.flashM) {
      this.flashM = new Mesh({ geometry: this.geo, texture: this.assets.ramp('fade') });
      this.flashM.tint = 0xffffff;
      this.flashM.blendMode = 'add';
      this.addChild(this.flashM);
    }
    this.flashM.visible = true;
    this.flashM.alpha = Math.min(1, a);
  }
}

// -------------------------------------------------------------------------------------------------------------- kit

/** What a species is given to build itself with: it makes parts, halos and strips of surface, and the kit remembers what can flash. */
export class Kit {
  readonly flashables: Flashable[] = [];
  constructor(
    readonly assets: RigAssets,
    /** The species' id: the cache of geometry is keyed by it. */
    readonly id: string,
    /** The creature's own number in [0, 1). */
    readonly seed: number,
  ) {}

  group(label = 'group'): Container {
    return new Container({ label });
  }

  /** A static shape drawn with the pen; `key` names it within the species, and every creature of the species shares the geometry. */
  part(key: string, draw: (pen: Pen) => void): Part {
    const entry = this.assets.shape(`${this.id}/${key}`, (ctx, rec) => draw(new Pen(ctx, this.assets, rec)));
    const part = new Part(entry, this.assets, key);
    this.flashables.push(part);
    return part;
  }

  /** A soft round light (additive), `size` cm across. */
  glow(color: number, size: number, alpha = 1): Sprite {
    const s = new Sprite(this.assets.glow);
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = 'add';
    s.width = s.height = size;
    s.alpha = alpha;
    return s;
  }

  /** A soft dark patch (normal blend): contact shadows and the dark of a hollow. */
  dark(width: number, height: number, alpha = 0.5): Sprite {
    const s = new Sprite(this.assets.glow);
    s.anchor.set(0.5);
    s.tint = 0x000000;
    s.width = width;
    s.height = height;
    s.alpha = alpha;
    return s;
  }

  ribbon(spec: RibbonSpec, label?: string): Ribbon {
    const r = new Ribbon(this.assets, spec, label);
    this.flashables.push(r);
    return r;
  }

  patch(spec: PatchSpec, label?: string): Patch {
    const p = new Patch(this.assets, spec, label);
    this.flashables.push(p);
    return p;
  }

  cloth(spec: ClothSpec, label?: string): Cloth {
    const c = new Cloth(this.assets, spec, label);
    this.flashables.push(c);
    return c;
  }
}
